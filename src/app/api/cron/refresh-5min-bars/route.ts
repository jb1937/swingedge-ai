// src/app/api/cron/refresh-5min-bars/route.ts
//
// Daily cron at 10:00 UTC (5 AM ET) Mon–Fri.
// Fetches 2 years of 5-min OHLCV bars for all INTRADAY_WATCHLIST symbols
// and stores them in Upstash Redis so grid search and portfolio backtests
// can load all 50 symbols instantly instead of racing Alpaca's rate limits.
//
// Fetch strategy:
//   - BATCH_SIZE=5 concurrent per batch (avoids Alpaca connection-level rate limiting)
//   - 10 batches × 5 symbols = 50 symbols total
//   - Each symbol: ~4 paginated pages at 2-year range → ~39,000 bars (paginated)
//   - Total: ~50 × 4 pages ≈ 40-80s at 200 req/min budget (well within 300s limit)
//
// Storage: bars are split into two Redis keys per symbol (:0 and :1 chunks)
// to stay under Upstash's 1 MB per-item limit (~1 MB per chunk at 2 years).
//
// On completion: writes swingedge:bars5min:{SYMBOL}:{0,1} + swingedge:bars5min:_meta

import { NextRequest, NextResponse } from 'next/server';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { setCachedBars } from '@/lib/data/bars-cache';
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';

const BATCH_SIZE = 5;

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2-year window: statistically robust optimization (30+ trades per parameter combo)
  const SIX_MONTHS_AGO = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const TODAY = new Date().toISOString().split('T')[0];

  const loaded: string[] = [];
  const failed: string[] = [];
  const startTime = Date.now();

  console.log(`refresh-5min-bars: Starting refresh for ${INTRADAY_WATCHLIST.length} symbols (${SIX_MONTHS_AGO} → ${TODAY})`);

  for (let i = 0; i < INTRADAY_WATCHLIST.length; i += BATCH_SIZE) {
    const batch = INTRADAY_WATCHLIST.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (sym) => {
        try {
          const bars = await alpacaDataClient.getHistoricalIntradayBars(sym, SIX_MONTHS_AGO, TODAY);
          if (bars.length === 0) {
            console.warn(`refresh-5min-bars: ${sym} returned 0 bars`);
            failed.push(sym);
            return;
          }
          await setCachedBars(sym, bars);
          loaded.push(sym);
          console.log(`refresh-5min-bars: cached ${sym} (${bars.length} bars)`);
        } catch (err) {
          console.error(`refresh-5min-bars: failed for ${sym} —`, err);
          failed.push(sym);
        }
      })
    );
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
    dateRange: { start: SIX_MONTHS_AGO, end: TODAY },
  });
}
