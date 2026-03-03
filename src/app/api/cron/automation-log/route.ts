// src/app/api/cron/automation-log/route.ts
//
// Returns the last N auto-trade cron run records from Upstash Redis.
// No auth required (read-only, same pattern as /api/cron/opportunities).

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const AUTO_TRADE_LOG_KEY = 'swingedge:auto_trade_log';

export async function GET() {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const raw = await redis.lrange(AUTO_TRADE_LOG_KEY, 0, 4); // last 5 runs
    const entries = raw.map(r => (typeof r === 'string' ? JSON.parse(r) : r));
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('automation-log error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load log' },
      { status: 500 }
    );
  }
}
