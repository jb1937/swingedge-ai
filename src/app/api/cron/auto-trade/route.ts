// src/app/api/cron/auto-trade/route.ts
//
// Runs at 9:35 AM ET (14:35 UTC) Mon–Fri via Vercel Cron.
// Reads today's cached opportunities (from daily-scan) and places bracket
// orders for qualifying setups, subject to the safety controls below.
//
// Safety controls (all must pass):
//   AUTO_TRADE_ENABLED=true                — master on/off switch
//   AUTO_TRADE_MIN_QUALITY=excellent|good  — minimum trade quality
//   AUTO_TRADE_MAX_POSITIONS=N             — max concurrent open positions
//   AUTO_TRADE_MAX_DAILY_ORDERS=N          — max new orders this session
//
// Stop-hit cooldown and correlation enforcement are also applied.

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { checkIncomingSymbolCorrelation } from '@/lib/trading/sector-mapping';
import { calculatePositionSize } from '@/lib/trading/position-sizing';

const OPPORTUNITIES_KEY = 'swingedge:daily_opportunities';
const COOLDOWN_KEY = 'swingedge:stop_hits';
const AUTO_TRADE_LOG_KEY = 'swingedge:auto_trade_log';

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

interface LogEntry {
  ts: string;
  placed: string[];
  skipped: { symbol: string; reason: string }[];
  reason?: string;
  positionSizeMultiplier?: number;
}

async function logRun(redis: Redis, entry: Omit<LogEntry, 'ts'>) {
  const record: LogEntry = { ts: new Date().toISOString(), ...entry };
  await redis.lpush(AUTO_TRADE_LOG_KEY, JSON.stringify(record));
  await redis.ltrim(AUTO_TRADE_LOG_KEY, 0, 49);
}

interface Opportunity {
  symbol: string;
  suggestedEntry?: number;
  suggestedStop?: number;
  suggestedTarget?: number;
  tradeQuality?: string;
  signalStrength?: number;
}

export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const minQuality = process.env.AUTO_TRADE_MIN_QUALITY || 'excellent';
  const maxPositions = parseInt(process.env.AUTO_TRADE_MAX_POSITIONS || '5');
  const maxDailyOrders = parseInt(process.env.AUTO_TRADE_MAX_DAILY_ORDERS || '3');

  const placed: string[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // --- Master switch: Redis key takes priority over env var ---
    const storedEnabled = await redis.get<string>('swingedge:auto_trade_enabled');
    const autoTradeEnabled = storedEnabled !== null
      ? storedEnabled === 'true'
      : process.env.AUTO_TRADE_ENABLED === 'true';
    if (!autoTradeEnabled) {
      await logRun(redis, { placed: [], skipped: [], reason: 'Auto-trading is disabled' });
      return NextResponse.json({ skipped: true, reason: 'Auto-trading is disabled' });
    }

    // 1. Load today's opportunities
    const raw = await redis.get<string>(OPPORTUNITIES_KEY);
    if (!raw) {
      await logRun(redis, { placed: [], skipped: [], reason: 'No daily scan results found' });
      return NextResponse.json({ skipped: true, reason: 'No daily scan results found' });
    }
    const scanData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const opportunities: Opportunity[] = scanData.opportunities ?? [];

    // 2. Check market regime gate — if danger, skip all auto-trading
    if (scanData.regimeGate?.allowLongs === false) {
      const reason = `Market regime gate blocked: ${scanData.regimeGate.reason}`;
      await logRun(redis, { placed: [], skipped: [], reason });
      return NextResponse.json({ skipped: true, reason });
    }
    const positionSizeMultiplier: number = scanData.regimeGate?.positionSizeMultiplier ?? 1.0;

    // 3. Get current positions
    const positions = await alpacaExecutor.getPositions();
    if (positions.length >= maxPositions) {
      const reason = `At max positions (${positions.length}/${maxPositions})`;
      await logRun(redis, { placed: [], skipped: [], reason, positionSizeMultiplier });
      return NextResponse.json({ skipped: true, reason });
    }
    const currentSymbols = positions.map(p => p.symbol);

    // 4. Get account for position sizing
    const account = await alpacaExecutor.getAccount();
    const riskPerTrade = account.equity * 0.02; // 2% risk rule

    // 5. Load stop-hit cooldowns from Redis
    const cooldowns: Record<string, string> = await redis.hgetall(COOLDOWN_KEY) ?? {};
    const now = Date.now();
    const cooldownMs = 3 * (24 * 60 * 60 * 1000) * (7 / 5); // 3 business days

    let ordersPlaced = 0;

    for (const opp of opportunities) {
      if (ordersPlaced >= maxDailyOrders) break;
      if (positions.length + ordersPlaced >= maxPositions) break;

      const { symbol, suggestedEntry, suggestedStop, suggestedTarget, tradeQuality } = opp;

      // Quality filter
      const qualityRank: Record<string, number> = { excellent: 3, good: 2, fair: 1, poor: 0 };
      const minRank = qualityRank[minQuality] ?? 3;
      if ((qualityRank[tradeQuality ?? 'poor'] ?? 0) < minRank) {
        skipped.push({ symbol, reason: `Quality ${tradeQuality} below threshold ${minQuality}` });
        continue;
      }

      // Need entry/stop/target prices
      if (!suggestedEntry || !suggestedStop || !suggestedTarget) {
        skipped.push({ symbol, reason: 'Missing price levels' });
        continue;
      }

      // Cooldown check
      const hitAt = cooldowns[symbol.toUpperCase()];
      if (hitAt && now - new Date(hitAt).getTime() < cooldownMs) {
        skipped.push({ symbol, reason: 'Stop-hit cooldown active' });
        continue;
      }

      // Correlation check
      const allSymbolsSoFar = [...currentSymbols, ...placed];
      const corrCheck = checkIncomingSymbolCorrelation(symbol, allSymbolsSoFar);
      if (!corrCheck.allowed) {
        skipped.push({ symbol, reason: `Correlation block: ${corrCheck.message}` });
        continue;
      }

      // Position sizing
      const stopDistance = Math.abs(suggestedEntry - suggestedStop);
      const adjustedRisk = riskPerTrade * positionSizeMultiplier;
      const rawQty = Math.floor(adjustedRisk / stopDistance);
      const qty = Math.max(1, rawQty);

      // Submit bracket order
      try {
        await alpacaExecutor.submitBracketOrder({
          entry: {
            symbol,
            qty,
            side: 'buy',
            type: 'limit',
            timeInForce: 'day',
            limitPrice: suggestedEntry,
          },
          stopLoss: suggestedStop,
          takeProfit: suggestedTarget,
        });
        placed.push(symbol);
        ordersPlaced++;
        console.log(`auto-trade: Placed bracket order for ${symbol} @ ${suggestedEntry}, stop ${suggestedStop}, target ${suggestedTarget}`);
      } catch (err) {
        skipped.push({ symbol, reason: err instanceof Error ? err.message : 'Order failed' });
      }
    }

    await logRun(redis, { placed, skipped: skipped.slice(0, 10), positionSizeMultiplier });

    return NextResponse.json({ success: true, placed, skipped });
  } catch (error) {
    console.error('auto-trade error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-trade failed' },
      { status: 500 }
    );
  }
}
