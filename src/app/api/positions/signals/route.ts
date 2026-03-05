// src/app/api/positions/signals/route.ts
//
// Returns active position → signal type + entry time map.
// Written by auto-trade when a bracket order is placed.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';

const POSITION_SIGNALS_KEY = 'swingedge:position_signals';

export interface PositionSignal {
  signalType: string;
  entryAt?: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const raw = await redis.hgetall<Record<string, string>>(POSITION_SIGNALS_KEY);
  const signals: Record<string, PositionSignal> = {};
  for (const [symbol, value] of Object.entries(raw ?? {})) {
    try {
      signals[symbol] = JSON.parse(value);
    } catch {
      // Backward compat: old format stored plain signalType string
      signals[symbol] = { signalType: value };
    }
  }

  return NextResponse.json({ signals });
}
