// src/app/api/cron/refresh-5min-bars/route.ts
//
// Daily cron at 10:00 UTC (5 AM ET) Mon–Fri.
// Fetches 2 years of 5-min OHLCV bars for all INTRADAY_WATCHLIST symbols
// and stores them in Upstash Redis so grid search and portfolio backtests
// can load all 50 symbols instantly instead of racing Alpaca's rate limits.
//
// Fetch strategy:
//   - BATCH_SIZE=3 concurrent per batch (stays well under Alpaca's ~200 req/min)
//   - 600ms delay between batches (3 symbols × ~4 pages = 12 req/batch; 12/0.6s = 20 req/s = 1200/min theoretical
//     but actual spread by page latency keeps it ~40-60 req/min in practice)
//   - First pass: all symbols in batches of 3
//   - Retry pass: failed symbols retried individually with 2s gap (sequential, gentle)
//   - Each symbol: ~4 paginated pages at 2-year range → ~39,000 bars
//   - Total: ~50 symbols × 4 pages + retries ≈ 60-120s well within 300s limit
//
// Storage: bars are split into two Redis keys per symbol (:0 and :1 chunks)
// to stay under Upstash's 1 MB per-item limit (~1 MB per chunk at 2 years).
//
// On completion: writes swingedge:bars5min:{SYMBOL}:{0,1} + swingedge:bars5min:_meta

import { NextRequest, NextResponse } from 'next/server';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { setCachedBars } from '@/lib/data/bars-cache';
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 600;
const RETRY_DELAY_MS = 2000;

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

async function fetchAndCache(sym: string, startDate: string, endDate: string): Promise<boolean> {
  try {
    const bars = await alpacaDataClient.getHistoricalIntradayBars(sym, startDate, endDate);
    if (bars.length === 0) {
      console.warn(`refresh-5min-bars: ${sym} returned 0 bars`);
      return false;
    }
    await setCachedBars(sym, bars);
    console.log(`refresh-5min-bars: cached ${sym} (${bars.length} bars)`);
    return true;
  } catch (err) {
    console.error(`refresh-5min-bars: failed for ${sym} —`, err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2-year window: statistically robust optimization (30+ trades per parameter combo)
  const TWO_YEARS_AGO = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const TODAY = new Date().toISOString().split('T')[0];

  const loaded: string[] = [];
  const failed: string[] = [];
  const startTime = Date.now();

  console.log(`refresh-5min-bars: Starting refresh for ${INTRADAY_WATCHLIST.length} symbols (${TWO_YEARS_AGO} → ${TODAY})`);

  // Pass 1: batches of 3 with 600ms inter-batch delay
  for (let i = 0; i < INTRADAY_WATCHLIST.length; i += BATCH_SIZE) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
    const batch = INTRADAY_WATCHLIST.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(sym => fetchAndCache(sym, TWO_YEARS_AGO, TODAY))
    );
    batch.forEach((sym, idx) => {
      if (results[idx]) loaded.push(sym);
      else failed.push(sym);
    });
  }

  // Pass 2: retry failures sequentially with 2s gap (gentle — avoids re-triggering rate limit)
  if (failed.length > 0) {
    console.log(`refresh-5min-bars: Retrying ${failed.length} failed symbols sequentially...`);
    const retryList = [...failed];
    failed.length = 0; // reset — will re-populate for any that still fail
    for (const sym of retryList) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      const ok = await fetchAndCache(sym, TWO_YEARS_AGO, TODAY);
      if (ok) loaded.push(sym);
      else failed.push(sym);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`refresh-5min-bars: Done — ${loaded.length}/${INTRADAY_WATCHLIST.length} symbols cached in ${elapsed}s`);

  return NextResponse.json({
    success: true,
    loaded: loaded.length,
    failed: failed.length,
    total: INTRADAY_WATCHLIST.length,
    failedSymbols: failed,
    elapsedSeconds: parseFloat(elapsed),
    dateRange: { start: TWO_YEARS_AGO, end: TODAY },
  });
}
