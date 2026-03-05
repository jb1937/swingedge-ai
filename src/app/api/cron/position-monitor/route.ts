// src/app/api/cron/position-monitor/route.ts
//
// Runs every 30 minutes during market hours (14:30–21:00 UTC = 9:30–4:00 PM ET),
// plus pre-market (13:00 UTC = 8:00 AM ET) and after-hours (21:30, 23:00 UTC =
// 4:30 PM and 6:00 PM ET) Mon–Fri via Vercel Cron.
//
// Note: stop orders do NOT trigger on Alpaca during extended hours, but replaceOrder()
// still works — so extended-hours runs pre-position stops using closing prices, ensuring
// they are correctly set before the next market open.
//
// For each open position, checks unrealized P&L against the original stop/target
// levels (reconstructed from open orders) and moves stops to protect profits:
//
//   unrealizedPL% ≥ 1:1 R:R  → move stop to breakeven (entry + small buffer)
//   unrealizedPL% ≥ 1.5:1    → move stop to 0.75:1 level (lock in partial profit)
//   unrealizedPL% ≥ 2:1      → move stop to 1.5:1 level  (almost fully protected)

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';

const MONITOR_LOG_KEY = 'swingedge:monitor_log';

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

interface StopAdjustment {
  symbol: string;
  action: string;
  oldStop?: number;
  newStop: number;
  unrealizedPLPercent: number;
}

export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adjustments: StopAdjustment[] = [];
  const errors: { symbol: string; error: string }[] = [];

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const [positions, openOrders] = await Promise.all([
      alpacaExecutor.getPositions(),
      alpacaExecutor.getOrders('open'),
    ]);

    for (const position of positions) {
      if (position.side !== 'long') continue;

      const entry = position.avgEntryPrice;
      const current = position.currentPrice;
      const plPct = position.unrealizedPLPercent; // already in percent

      // Find linked stop-loss order for this symbol (sell side, stop type)
      const stopOrder = openOrders.find(
        o => o.symbol === position.symbol && o.side === 'sell' && (o.type === 'stop' || o.type === 'stop_limit')
      );

      if (!stopOrder || !stopOrder.stopPrice) {
        // No stop order found — place a defensive GTC stop at 2.5% below entry
        const fallbackStop = parseFloat((entry * 0.975).toFixed(2));
        try {
          await alpacaExecutor.submitOrder({
            symbol: position.symbol,
            qty: Math.abs(position.qty),
            side: 'sell',
            type: 'stop',
            timeInForce: 'gtc',
            stopPrice: fallbackStop,
          });
          adjustments.push({
            symbol: position.symbol,
            action: 'Placed missing stop (fallback 2.5% below entry)',
            newStop: fallbackStop,
            unrealizedPLPercent: plPct,
          });
          console.log(`position-monitor: ${position.symbol} — placed missing stop at ${fallbackStop} (no stop order found)`);
        } catch (err) {
          errors.push({ symbol: position.symbol, error: `Failed to place missing stop: ${err instanceof Error ? err.message : 'unknown'}` });
        }
        continue;
      }

      const existingStop = stopOrder.stopPrice;
      const risk = entry - existingStop; // how much per share we risked

      if (risk <= 0) continue; // Can't calculate without a valid original stop

      // Calculate R-multiple thresholds
      const breakevenStop = entry + risk * 0.05;  // entry + tiny buffer
      const at075Stop = entry + risk * 0.75;       // lock in 75% of R
      const at150Stop = entry + risk * 1.5;        // lock in 1.5:1

      // P&L percent as an R-multiple (using stop distance as R)
      // unrealizedPLPercent is in percent (e.g., 2.0 = 2%)
      const priceMove = current - entry;
      const rMultiple = priceMove / risk; // how many R's we're up

      let newStop: number | null = null;
      let action = '';

      if (rMultiple >= 2.0 && existingStop < at150Stop) {
        newStop = at150Stop;
        action = 'Trailing stop → 1.5:1 level';
      } else if (rMultiple >= 1.5 && existingStop < at075Stop) {
        newStop = at075Stop;
        action = 'Trailing stop → 0.75:1 level';
      } else if (rMultiple >= 1.0 && existingStop < breakevenStop) {
        newStop = breakevenStop;
        action = 'Stop moved to breakeven';
      }

      if (newStop !== null) {
        try {
          await alpacaExecutor.replaceOrder(stopOrder.id, { stopPrice: parseFloat(newStop.toFixed(2)) });
          adjustments.push({
            symbol: position.symbol,
            action,
            oldStop: existingStop,
            newStop: parseFloat(newStop.toFixed(2)),
            unrealizedPLPercent: plPct,
          });
          console.log(`position-monitor: ${position.symbol} — ${action} (stop ${existingStop.toFixed(2)} → ${newStop.toFixed(2)})`);
        } catch (err) {
          errors.push({ symbol: position.symbol, error: err instanceof Error ? err.message : 'Replace failed' });
        }
      }
    }

    // Log to Redis
    if (adjustments.length > 0 || errors.length > 0) {
      const logEntry = {
        ts: new Date().toISOString(),
        adjustments,
        errors,
      };
      await redis.lpush(MONITOR_LOG_KEY, JSON.stringify(logEntry));
      await redis.ltrim(MONITOR_LOG_KEY, 0, 99);
    }

    return NextResponse.json({
      success: true,
      positionsChecked: positions.length,
      adjustments,
      errors,
    });
  } catch (error) {
    console.error('position-monitor error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Monitor failed' },
      { status: 500 }
    );
  }
}
