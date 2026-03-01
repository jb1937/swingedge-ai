// src/app/api/cron/opportunities/route.ts
//
// Serves the cached daily scan opportunities from Upstash Redis.
// Called by the dashboard to display today's best setups without re-running
// the full screener on every page load.

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const OPPORTUNITIES_KEY = 'swingedge:daily_opportunities';

export async function GET() {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const raw = await redis.get<string>(OPPORTUNITIES_KEY);
    if (!raw) {
      return NextResponse.json({ opportunities: [], message: 'No scan results yet. Run /api/cron/daily-scan first.' });
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return NextResponse.json(data);
  } catch (error) {
    console.error('opportunities route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load opportunities' },
      { status: 500 }
    );
  }
}
