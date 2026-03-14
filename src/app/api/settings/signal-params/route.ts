// src/app/api/settings/signal-params/route.ts
//
// Live signal parameter store — reads/writes the SignalParams that both the
// live screener and the backtest engine use. Populated by the grid search
// "Apply to live engine" action.
//
// GET    → returns current params (or defaults if never set)
// POST { params: SignalParams } → persists params to Redis
// DELETE → resets to defaults

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';
import { DEFAULT_SIGNAL_PARAMS, SignalParams } from '@/types/backtest';

export const SIGNAL_PARAMS_KEY = 'swingedge:signal_params';

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const redis = getRedis();
  const stored = await redis.get<SignalParams>(SIGNAL_PARAMS_KEY);
  return NextResponse.json({ params: stored ?? DEFAULT_SIGNAL_PARAMS, isDefault: !stored });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await request.json();
  const incoming: Partial<SignalParams> = body.params ?? body;

  // Merge with defaults so partial updates are safe
  const params: SignalParams = {
    gapThresholdPct: typeof incoming.gapThresholdPct === 'number' ? incoming.gapThresholdPct : DEFAULT_SIGNAL_PARAMS.gapThresholdPct,
    atrGatePct: typeof incoming.atrGatePct === 'number' ? incoming.atrGatePct : DEFAULT_SIGNAL_PARAMS.atrGatePct,
    minQuality: incoming.minQuality === 'excellent' || incoming.minQuality === 'good' ? incoming.minQuality : DEFAULT_SIGNAL_PARAMS.minQuality,
    enabledSignals: Array.isArray(incoming.enabledSignals) && incoming.enabledSignals.length > 0
      ? incoming.enabledSignals as SignalParams['enabledSignals']
      : DEFAULT_SIGNAL_PARAMS.enabledSignals,
  };

  const redis = getRedis();
  await redis.set(SIGNAL_PARAMS_KEY, JSON.stringify(params));

  return NextResponse.json({ params, saved: true });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const redis = getRedis();
  await redis.del(SIGNAL_PARAMS_KEY);
  return NextResponse.json({ params: DEFAULT_SIGNAL_PARAMS, reset: true });
}
