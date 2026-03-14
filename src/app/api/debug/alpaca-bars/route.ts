// src/app/api/debug/alpaca-bars/route.ts
// Diagnostic endpoint — tests whether Alpaca historical bars are accessible.
// Returns the raw API response so we can see auth errors, feed errors, etc.
// Hit GET /api/debug/alpaca-bars in the browser to diagnose.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const apiKey = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return NextResponse.json({ error: 'Alpaca API credentials not set in env' }, { status: 500 });
  }

  // Test: fetch just 10 bars for AAPL on a recent weekday
  const results: Record<string, unknown> = {
    apiKeyPrefix: apiKey.slice(0, 8) + '…',
    tests: [],
  };

  // Test 1: fetch with feed=iex
  try {
    const url = new URL('https://data.alpaca.markets/v2/stocks/AAPL/bars');
    url.searchParams.set('timeframe', '5Min');
    url.searchParams.set('start', '2025-03-10T13:30:00Z');
    url.searchParams.set('end', '2025-03-11T21:30:00Z');
    url.searchParams.set('feed', 'iex');
    url.searchParams.set('limit', '10');

    const res = await fetch(url.toString(), {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    (results.tests as unknown[]).push({
      test: 'AAPL 5min 2025-03-10 feed=iex',
      status: res.status,
      ok: res.ok,
      body: parsed,
    });
  } catch (e) {
    (results.tests as unknown[]).push({
      test: 'AAPL 5min 2025-03-10 feed=iex',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Test 2: fetch without feed param
  try {
    const url = new URL('https://data.alpaca.markets/v2/stocks/AAPL/bars');
    url.searchParams.set('timeframe', '5Min');
    url.searchParams.set('start', '2025-03-10T13:30:00Z');
    url.searchParams.set('end', '2025-03-11T21:30:00Z');
    url.searchParams.set('limit', '10');

    const res = await fetch(url.toString(), {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    (results.tests as unknown[]).push({
      test: 'AAPL 5min 2025-03-10 no feed',
      status: res.status,
      ok: res.ok,
      body: parsed,
    });
  } catch (e) {
    (results.tests as unknown[]).push({
      test: 'AAPL 5min 2025-03-10 no feed',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Test 3: fetch with feed=sip (paid tier)
  try {
    const url = new URL('https://data.alpaca.markets/v2/stocks/AAPL/bars');
    url.searchParams.set('timeframe', '5Min');
    url.searchParams.set('start', '2025-03-10T13:30:00Z');
    url.searchParams.set('end', '2025-03-11T21:30:00Z');
    url.searchParams.set('feed', 'sip');
    url.searchParams.set('limit', '10');

    const res = await fetch(url.toString(), {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    (results.tests as unknown[]).push({
      test: 'AAPL 5min 2025-03-10 feed=sip',
      status: res.status,
      ok: res.ok,
      body: parsed,
    });
  } catch (e) {
    (results.tests as unknown[]).push({
      test: 'AAPL 5min 2025-03-10 feed=sip',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return NextResponse.json(results);
}
