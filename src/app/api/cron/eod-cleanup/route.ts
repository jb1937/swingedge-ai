// src/app/api/cron/eod-cleanup/route.ts
//
// Runs at 3:55 PM ET (20:55 UTC) Mon–Fri via Vercel Cron.
// Cancels unfilled limit buy orders at end of day so they don't gap-open
// at tomorrow's open at a stale price.
// Controlled by EOD_CANCEL_UNFILLED_BUYS env var (default: true).

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';

const EOD_LOG_KEY = 'swingedge:eod_log';

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

  // Check if cleanup is enabled (default: true)
  if (process.env.EOD_CANCEL_UNFILLED_BUYS === 'false') {
    return NextResponse.json({ skipped: true, reason: 'EOD_CANCEL_UNFILLED_BUYS=false' });
  }

  const canceled: string[] = [];
  const errors: { orderId: string; symbol: string; error: string }[] = [];

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // Fetch all open orders
    const openOrders = await alpacaExecutor.getOrders('open');

    // Find pending limit buy orders (entry legs that haven't filled yet)
    const unfilledBuys = openOrders.filter(
      o => o.side === 'buy' && o.type === 'limit' && (o.status === 'new' || o.status === 'partially_filled')
    );

    console.log(`eod-cleanup: Found ${unfilledBuys.length} unfilled limit buy orders`);

    for (const order of unfilledBuys) {
      try {
        await alpacaExecutor.cancelOrder(order.id);
        canceled.push(`${order.symbol} (${order.qty} shares @ $${order.limitPrice?.toFixed(2)})`);
      } catch (err) {
        errors.push({
          orderId: order.id,
          symbol: order.symbol,
          error: err instanceof Error ? err.message : 'Cancel failed',
        });
      }
    }

    const logEntry = {
      ts: new Date().toISOString(),
      canceledCount: canceled.length,
      canceled,
      errors,
    };
    await redis.lpush(EOD_LOG_KEY, JSON.stringify(logEntry));
    await redis.ltrim(EOD_LOG_KEY, 0, 29);

    console.log(`eod-cleanup: Canceled ${canceled.length} orders`);

    return NextResponse.json({
      success: true,
      canceledCount: canceled.length,
      canceled,
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
