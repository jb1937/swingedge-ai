// src/app/api/settings/signal-stats/route.ts
//
// Returns signal performance statistics for the AutomationLog dashboard widget.
// Stats are written automatically by eod-cleanup after each day's positions are closed.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';

const SIGNAL_STATS_KEY = 'swingedge:signal_stats';

interface SignalStats {
  wins: number;
  losses: number;
  totalRR: number;
}

export interface SignalStatsRow {
  signalType: string;
  wins: number;
  losses: number;
  totalTrades: number;
  winRate: number;
  avgRR: number;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const raw = await redis.hgetall<Record<string, string>>(SIGNAL_STATS_KEY);
  const signalTypes = ['gap_fade', 'vwap_reversion', 'orb'];

  const rows: SignalStatsRow[] = signalTypes.map(signalType => {
    const statsRaw = raw?.[signalType];
    const stats: SignalStats = statsRaw ? JSON.parse(statsRaw) : { wins: 0, losses: 0, totalRR: 0 };
    const totalTrades = stats.wins + stats.losses;
    return {
      signalType,
      wins: stats.wins,
      losses: stats.losses,
      totalTrades,
      winRate: totalTrades > 0 ? Math.round((stats.wins / totalTrades) * 100) : 0,
      avgRR: totalTrades > 0 ? Math.round((stats.totalRR / totalTrades) * 100) / 100 : 0,
    };
  });

  return NextResponse.json({ stats: rows });
}
