// src/app/api/cron/eod-cleanup/route.ts
//
// Runs at 3:45 PM ET (20:45 UTC) Mon–Fri via Vercel Cron.
//
// For day trading strategy this does TWO things:
//   1. Close all open positions at market — no overnight holds
//   2. Record signal performance (win/loss) per signal type in Redis
//      for the automated signal stats dashboard
//
// Also cancels any remaining unfilled limit buy orders as a safety net.

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';

const EOD_LOG_KEY = 'swingedge:eod_log';
const POSITION_SIGNALS_KEY = 'swingedge:position_signals';
const SIGNAL_STATS_KEY = 'swingedge:signal_stats';

type SignalType = 'gap_fade' | 'vwap_reversion' | 'orb';

interface SignalStats {
  wins: number;
  losses: number;
  totalRR: number;
}

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const closedPositions: string[] = [];
  const canceledOrders: string[] = [];
  const errors: { id: string; symbol: string; error: string }[] = [];
  const signalUpdates: { symbol: string; signalType: string; pnl: number; win: boolean }[] = [];

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // Load position → signal type map (written by auto-trade on each placement)
    const positionSignals: Record<string, string> =
      (await redis.hgetall(POSITION_SIGNALS_KEY)) ?? {};

    // -----------------------------------------------------------------
    // 1. Close all open positions at market
    // -----------------------------------------------------------------
    const openPositions = await alpacaExecutor.getPositions();
    console.log(`eod-cleanup: Found ${openPositions.length} open positions to close`);

    for (const pos of openPositions) {
      try {
        // Capture P&L before closing (unrealizedPL from Alpaca)
        const pnl = pos.unrealizedPL ?? 0;
        const win = pnl > 0;

        await alpacaExecutor.closePosition(pos.symbol);
        closedPositions.push(`${pos.symbol} (P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`);

        // Update signal performance stats
        const rawSignal = positionSignals[pos.symbol];
        let signalType: SignalType | undefined;
        if (rawSignal) {
          try {
            const parsed = JSON.parse(rawSignal);
            signalType = parsed.signalType as SignalType;
          } catch {
            signalType = rawSignal as SignalType; // backward compat: old format was plain string
          }
        }
        if (signalType !== undefined) {
          const entryPrice = pos.avgEntryPrice;
          const closePrice = pos.currentPrice;
          const rr = entryPrice > 0
            ? Math.abs(closePrice - entryPrice) / Math.abs(entryPrice * 0.01) // approximate R:R
            : 0;

          // Increment stats for this signal type
          const statsRaw = await redis.hget<string>(SIGNAL_STATS_KEY, signalType);
          const stats: SignalStats = statsRaw
            ? JSON.parse(statsRaw)
            : { wins: 0, losses: 0, totalRR: 0 };

          if (win) {
            stats.wins += 1;
          } else {
            stats.losses += 1;
          }
          stats.totalRR += rr;

          await redis.hset(SIGNAL_STATS_KEY, { [signalType]: JSON.stringify(stats) });

          signalUpdates.push({ symbol: pos.symbol, signalType, pnl, win });

          // Remove from position signals map
          await redis.hdel(POSITION_SIGNALS_KEY, pos.symbol);
        }
      } catch (err) {
        errors.push({
          id: pos.symbol,
          symbol: pos.symbol,
          error: err instanceof Error ? err.message : 'Close failed',
        });
      }
    }

    // -----------------------------------------------------------------
    // 2. Cancel remaining unfilled limit buy orders (safety net)
    // -----------------------------------------------------------------
    if (process.env.EOD_CANCEL_UNFILLED_BUYS !== 'false') {
      const openOrders = await alpacaExecutor.getOrders('open');
      const unfilledBuys = openOrders.filter(
        o => o.side === 'buy' && o.type === 'limit' && (o.status === 'new' || o.status === 'partially_filled')
      );

      for (const order of unfilledBuys) {
        try {
          await alpacaExecutor.cancelOrder(order.id);
          canceledOrders.push(`${order.symbol} @ $${order.limitPrice?.toFixed(2)}`);
        } catch (err) {
          errors.push({
            id: order.id,
            symbol: order.symbol,
            error: err instanceof Error ? err.message : 'Cancel failed',
          });
        }
      }
    }

    // -----------------------------------------------------------------
    // 3. Log the run
    // -----------------------------------------------------------------
    const logEntry = {
      ts: new Date().toISOString(),
      closedCount: closedPositions.length,
      closedPositions,
      canceledCount: canceledOrders.length,
      canceledOrders,
      signalUpdates,
      errors,
    };
    await redis.lpush(EOD_LOG_KEY, JSON.stringify(logEntry));
    await redis.ltrim(EOD_LOG_KEY, 0, 29);

    console.log(
      `eod-cleanup: Closed ${closedPositions.length} positions, canceled ${canceledOrders.length} orders`
    );

    return NextResponse.json({
      success: true,
      closedCount: closedPositions.length,
      closedPositions,
      canceledCount: canceledOrders.length,
      canceledOrders,
      signalUpdates,
      errors,
    });
  } catch (error) {
    console.error('eod-cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'EOD cleanup failed' },
      { status: 500 }
    );
  }
}
