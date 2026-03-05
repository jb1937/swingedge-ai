// src/app/api/settings/skip-today/route.ts
//
// Human override knob 1: daily go/no-go toggle.
// POST  → pause trading for today (skip_trade_today = true)
// DELETE → resume trading for today (skip_trade_today = false)
// GET   → returns current state
//
// The daily-scan cron resets this to false each morning at 8:30 AM.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { getSupabaseServer } from '@/lib/supabase/server';

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  return session;
}

async function upsertSetting(value: string) {
  const supabase = getSupabaseServer();
  await supabase
    .from('app_settings')
    .upsert({ key: 'skip_trade_today', value }, { onConflict: 'key' });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'skip_trade_today')
    .single();

  return NextResponse.json({ skipToday: data?.value === 'true' });
}

export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  await upsertSetting('true');
  return NextResponse.json({ skipToday: true });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  await upsertSetting('false');
  return NextResponse.json({ skipToday: false });
}
