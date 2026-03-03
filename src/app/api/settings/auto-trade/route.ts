// src/app/api/settings/auto-trade/route.ts
//
// GET  — returns current auto-trade enabled state
// POST — sets auto-trade enabled state { enabled: boolean }
// Both require a valid NextAuth session.
//
// Setting is stored in Supabase (app_settings table) for durability.
// Falls back to AUTO_TRADE_ENABLED env var if the row doesn't exist.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { getSupabaseServer } from '@/lib/supabase/server';

// Never cache this route — the toggle state must always be read fresh.
export const dynamic = 'force-dynamic';

const SETTING_KEY = 'auto_trade_enabled';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .single();

  const enabled = data
    ? data.value === 'true'
    : process.env.AUTO_TRADE_ENABLED === 'true';

  return NextResponse.json({ enabled });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { enabled } = await request.json();
  const supabase = getSupabaseServer();
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SETTING_KEY, value: enabled ? 'true' : 'false' });

  if (error) {
    console.error('auto-trade setting upsert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enabled });
}
