// src/app/api/cron/auto-trade/route.ts
//
// Runs at 9:35 AM ET (14:35 UTC) and 9:47 AM ET (14:47 UTC) Mon–Fri.
// At 9:35 AM: detects gap-fade and VWAP-reversion setups.
// At 9:47 AM: additionally detects opening-range breakouts (needs 3 completed 5-min bars).
// At 10:30 AM and 11:00 AM: VWAP-only rescans via ?signals=vwap_reversion.
//
// All orders use timeInForce: 'day' — clean slate every session.
// No GTC orders. No overnight positions.
// Late-entry guard: no new entries after 1:00 PM ET (too little time before 3:45 PM EOD cleanup).
//
// Safety controls (all must pass):
//   AUTO_TRADE_ENABLED=true              — master on/off switch (cron only)
//   AUTO_TRADE_MIN_QUALITY=excellent|good — minimum signal trade quality
//   AUTO_TRADE_MAX_POSITIONS=N           — max concurrent open positions (default 10)
//   AUTO_TRADE_MAX_DAILY_ORDERS=N        — max new orders this session (default 5)
//   DISABLE_SIGNALS=gap_fade,orb         — comma-separated signal types to skip
//
// Query parameters (GET only):
//   ?signals=vwap_reversion              — restrict to listed signal types for this run
//
// Human override knobs (checked in order):
//   skip_trade_today (Supabase app_settings) — daily pause toggle
//   swingedge:skip_sectors (Redis)           — sector blocklist

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { checkIncomingSymbolCorrelation } from '@/lib/trading/sector-mapping';
import { getSectorForSymbol } from '@/lib/trading/sector-mapping';
import { getSupabaseServer } from '@/lib/supabase/server';
import { runIntradayScreener } from '@/lib/analysis/screener';
import { checkMarketRegimeGate } from '@/lib/analysis/market-regime';
import { dataRouter } from '@/lib/data/data-router';

const AUTO_TRADE_LOG_KEY = 'swingedge:auto_trade_log';
const SKIP_SECTORS_KEY = 'swingedge:skip_sectors';
const POSITION_SIGNALS_KEY = 'swingedge:position_signals';

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

interface LogEntry {
  ts: string;
  placed: { symbol: string; signalType: string }[];
  skipped: { symbol: string; reason: string }[];
  reason?: string;
  positionSizeMultiplier?: number;
}

async function logRun(redis: Redis, entry: Omit<LogEntry, 'ts'>) {
  const record: LogEntry = { ts: new Date().toISOString(), ...entry };
  await redis.lpush(AUTO_TRADE_LOG_KEY, JSON.stringify(record));
  await redis.ltrim(AUTO_TRADE_LOG_KEY, 0, 49);
}

async function runAutoTrade(skipEnabledCheck = false, allowedSignals: string[] | null = null) {
  const minQuality = process.env.AUTO_TRADE_MIN_QUALITY || 'good';
  const maxPositions = parseInt(process.env.AUTO_TRADE_MAX_POSITIONS || '10');
  const maxDailyOrders = parseInt(process.env.AUTO_TRADE_MAX_DAILY_ORDERS || '5');
  const disabledSignals = (process.env.DISABLE_SIGNALS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const placed: { symbol: string; signalType: string }[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // --- Master switch (skipped for manual runs) ---
    if (!skipEnabledCheck) {
      const supabase = getSupabaseServer();
      const { data: setting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'auto_trade_enabled')
        .single();
      const autoTradeEnabled = setting
        ? setting.value === 'true'
        : process.env.AUTO_TRADE_ENABLED === 'true';
      if (!autoTradeEnabled) {
        await logRun(redis, { placed: [], skipped: [], reason: 'Auto-trading is disabled' });
        return NextResponse.json({ skipped: true, reason: 'Auto-trading is disabled' });
      }
    }

    // --- Human knob 1: Daily go/no-go toggle ---
    const supabase = getSupabaseServer();
    const { data: skipSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'skip_trade_today')
      .single();
    if (skipSetting?.value === 'true') {
      const reason = 'Trading paused for today (skip_trade_today=true)';
      await logRun(redis, { placed: [], skipped: [], reason });
      return NextResponse.json({ skipped: true, reason });
    }

    // --- Market regime gate (from live SPY data) ---
    const spyCandles = await dataRouter.getHistorical('SPY', '1day', 'full').catch(() => null);
    if (spyCandles && spyCandles.length >= 50) {
      const regime = checkMarketRegimeGate(spyCandles);
      if (!regime.allowLongs) {
        const reason = `Market regime gate blocked: ${regime.reason}`;
        await logRun(redis, { placed: [], skipped: [], reason });
        return NextResponse.json({ skipped: true, reason });
      }
    }

    // --- Human knob 2: Sector blocklist ---
    const skipSectors: string[] = (await redis.get<string[]>(SKIP_SECTORS_KEY)) ?? [];

    // --- Get current positions ---
    const positions = await alpacaExecutor.getPositions();
    if (positions.length >= maxPositions) {
      const reason = `At max positions (${positions.length}/${maxPositions})`;
      await logRun(redis, { placed: [], skipped: [], reason });
      return NextResponse.json({ skipped: true, reason });
    }
    const currentSymbols = positions.map(p => p.symbol);

    // --- Account for position sizing ---
    const account = await alpacaExecutor.getAccount();
    const riskPerTrade = account.equity * 0.01; // 1% risk rule for day trading

    // --- Late-entry guard: no new entries after 1:00 PM ET ---
    const now = new Date();
    const isDST = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 10;
    const etOffsetHours = isDST ? 4 : 5;
    const etTime = new Date(now.getTime() - etOffsetHours * 60 * 60 * 1000);
    if (etTime.getUTCHours() >= 13) {
      const reason = 'Too late for new entries (after 1:00 PM ET)';
      await logRun(redis, { placed: [], skipped: [], reason });
      return NextResponse.json({ skipped: true, reason });
    }

    // --- Run live intraday screener ---
    const allScreenResults = await runIntradayScreener();
    // If caller specified signal types (e.g. ?signals=vwap_reversion), restrict to those only
    const screenResults = allowedSignals
      ? allScreenResults.filter(r => allowedSignals.includes(r.signal.signalType))
      : allScreenResults;

    const qualityRank: Record<string, number> = { excellent: 3, good: 2, fair: 1, poor: 0 };
    const minRank = qualityRank[minQuality] ?? 2;

    let ordersPlaced = 0;

    for (const result of screenResults) {
      if (ordersPlaced >= maxDailyOrders) break;
      if (positions.length + ordersPlaced >= maxPositions) break;

      const { symbol, signal } = result;

      // Skip disabled signal types
      if (disabledSignals.includes(signal.signalType)) {
        skipped.push({ symbol, reason: `Signal type ${signal.signalType} is disabled` });
        continue;
      }

      // Quality filter
      if ((qualityRank[signal.tradeQuality] ?? 0) < minRank) {
        skipped.push({ symbol, reason: `Quality ${signal.tradeQuality} below threshold ${minQuality}` });
        continue;
      }

      // Sector blocklist check (Human knob 2)
      if (skipSectors.length > 0) {
        const sector = getSectorForSymbol(symbol);
        if (skipSectors.some(s => s.toLowerCase() === sector.toLowerCase())) {
          skipped.push({ symbol, reason: `Sector blocked: ${sector}` });
          continue;
        }
      }

      // Skip if already holding this symbol
      if (currentSymbols.includes(symbol) || placed.some(p => p.symbol === symbol)) {
        skipped.push({ symbol, reason: 'Already holding this symbol' });
        continue;
      }

      // Correlation check
      const allSymbolsSoFar = [...currentSymbols, ...placed.map(p => p.symbol)];
      const corrCheck = checkIncomingSymbolCorrelation(symbol, allSymbolsSoFar);
      if (!corrCheck.allowed) {
        skipped.push({ symbol, reason: `Correlation block: ${corrCheck.message}` });
        continue;
      }

      // Round prices to 2dp
      const entry = Math.round(signal.entry * 100) / 100;
      const stop  = Math.round(signal.stop  * 100) / 100;
      const target = Math.round(signal.target * 100) / 100;

      // Position sizing using intraday signal's exact stop distance
      const stopDistance = Math.max(entry - stop, 0.01);
      const rawQty = Math.floor(riskPerTrade / stopDistance);
      const qty = Math.max(1, rawQty);

      // Submit bracket order — day orders only (no overnight positions)
      try {
        await alpacaExecutor.submitBracketOrder({
          entry: {
            symbol,
            qty,
            side: 'buy',
            type: 'limit',
            timeInForce: 'day',
            limitPrice: entry,
          },
          stopLoss: stop,
          takeProfit: target,
        });

        // Record signal type + entry time for performance tracking (Human knob 3)
        await redis.hset(POSITION_SIGNALS_KEY, {
          [symbol]: JSON.stringify({ signalType: signal.signalType, entryAt: new Date().toISOString() }),
        });

        placed.push({ symbol, signalType: signal.signalType });
        ordersPlaced++;
        console.log(
          `auto-trade: Placed [${signal.signalType}] bracket order for ${symbol}` +
          ` @ ${entry}, stop ${stop}, target ${target}, qty ${qty}`
        );
      } catch (err) {
        skipped.push({ symbol, reason: err instanceof Error ? err.message : 'Order failed' });
      }
    }

    await logRun(redis, { placed, skipped: skipped.slice(0, 10) });

    return NextResponse.json({ success: true, placed, skipped });
  } catch (error) {
    console.error('auto-trade error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-trade failed' },
      { status: 500 }
    );
  }
}

// GET — called by Vercel cron, authenticated via CRON_SECRET
// Optional: ?signals=vwap_reversion restricts to listed signal types for this run
export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const signalsParam = request.nextUrl.searchParams.get('signals');
  const allowedSignals = signalsParam
    ? signalsParam.split(',').map(s => s.trim()).filter(Boolean)
    : null;
  return runAutoTrade(false, allowedSignals);
}

// POST — manual trigger from dashboard, authenticated via user session
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return runAutoTrade(true);
}
