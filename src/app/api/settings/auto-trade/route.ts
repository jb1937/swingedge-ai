// src/app/api/settings/auto-trade/route.ts
//
// GET  — returns current auto-trade enabled state (Redis key takes priority, env var fallback)
// POST — sets auto-trade enabled state in Redis { enabled: boolean }
// Both require a valid NextAuth session.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';

const SETTING_KEY = 'swingedge:auto_trade_enabled';

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const redis = getRedis();
  const stored = await redis.get<string>(SETTING_KEY);
  const enabled = stored !== null
    ? stored === 'true'
    : process.env.AUTO_TRADE_ENABLED === 'true';

  return NextResponse.json({ enabled });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { enabled } = await request.json();
  const redis = getRedis();
  await redis.set(SETTING_KEY, enabled ? 'true' : 'false');
  return NextResponse.json({ enabled });
}
