// src/app/api/settings/skip-sectors/route.ts
//
// Human override knob 2: sector blocklist.
// GET           → returns current blocked sectors list
// POST { sector } → adds a sector to the blocklist
// DELETE { sector } → removes a sector from the blocklist

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';
import { getSupabaseServer } from '@/lib/supabase/server';

const SKIP_SECTORS_KEY = 'swingedge:skip_sectors';

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

async function requireSession() {
  const session = await getServerSession(authOptions);
  return session;
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const redis = getRedis();
  const sectors: string[] = (await redis.get<string[]>(SKIP_SECTORS_KEY)) ?? [];
  return NextResponse.json({ sectors });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { sector } = await request.json();
  if (!sector || typeof sector !== 'string') {
    return NextResponse.json({ error: 'sector is required' }, { status: 400 });
  }

  const redis = getRedis();
  const current: string[] = (await redis.get<string[]>(SKIP_SECTORS_KEY)) ?? [];
  if (!current.includes(sector)) {
    current.push(sector);
    await redis.set(SKIP_SECTORS_KEY, JSON.stringify(current));
    // Fire-and-forget history log
    getSupabaseServer()
      .from('sector_block_history')
      .insert({ sectors: current, source: 'manual_add' })
      .then(() => {}, () => {});
  }
  return NextResponse.json({ sectors: current });
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { sector } = await request.json();
  if (!sector || typeof sector !== 'string') {
    return NextResponse.json({ error: 'sector is required' }, { status: 400 });
  }

  const redis = getRedis();
  const current: string[] = (await redis.get<string[]>(SKIP_SECTORS_KEY)) ?? [];
  const updated = current.filter(s => s.toLowerCase() !== sector.toLowerCase());
  await redis.set(SKIP_SECTORS_KEY, JSON.stringify(updated));
  // Fire-and-forget history log
  getSupabaseServer()
    .from('sector_block_history')
    .insert({ sectors: updated, source: 'manual_remove' })
    .then(() => {}, () => {});
  return NextResponse.json({ sectors: updated });
}
