// src/app/api/backtest/grid-search/route.ts
//
// Runs a 72-combination parameter grid search over the portfolio watchlist.
// Fetches candle data once, then sweeps all (gapThreshold × atrGate ×
// minQuality × enabledSignals) combinations and returns results ranked by
// profit factor — giving a data-driven basis for parameter selection.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { dataRouter } from '@/lib/data/data-router';
import { runGridSearch, buildParamGrid } from '@/lib/backtest/intraday-backtest';
import { groupBarsByDate, runGridSearch5min, buildParamGrid5min } from '@/lib/backtest/intraday-backtest-5min';
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';
import { DEFAULT_BACKTEST_CONFIG } from '@/lib/backtest/backtest-engine';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { NormalizedOHLCV } from '@/types/market';
import { BacktestConfig, GridSearchResult } from '@/types/backtest';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const configOverrides: Partial<BacktestConfig> = body.config ?? {};

    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      ...configOverrides,
    };

    // Fetch SPY first — needed for regime gate + benchmark; must not be dropped by rate limits
    let spyCandles: NormalizedOHLCV[] | undefined;
    try {
      const fetched = await dataRouter.getHistorical('SPY', '1day', 'full');
      if (fetched && fetched.length >= 30) spyCandles = fetched;
    } catch { /* regime gate will be skipped gracefully */ }

    // Fetch candles for all watchlist symbols in parallel — done once for all 81 runs
    const candleEntries = await Promise.all(
      INTRADAY_WATCHLIST.map(async (sym) => {
        try {
          const c = await dataRouter.getHistorical(sym, '1day', 'full');
          return c && c.length >= 30 ? ([sym, c] as [string, NormalizedOHLCV[]]) : null;
        } catch {
          return null;
        }
      }),
    );
    const allCandlesMap = new Map<string, NormalizedOHLCV[]>(
      candleEntries.filter((e): e is [string, NormalizedOHLCV[]] => e !== null),
    );
    // Use the pre-fetched SPY; fall back to batch result if pre-fetch failed
    if (!spyCandles) spyCandles = allCandlesMap.get('SPY');

    // Additionally fetch 5-min bars for accurate intraday signal simulation.
    // Fetch in batches of 5 to avoid Alpaca rate limits (200 req/min).
    const allBars5minMap = new Map<string, Map<string, NormalizedOHLCV[]>>();
    const BATCH_SIZE = 5;
    for (let i = 0; i < INTRADAY_WATCHLIST.length; i += BATCH_SIZE) {
      const batch = INTRADAY_WATCHLIST.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (sym) => {
          try {
            const bars = await alpacaDataClient.getHistoricalIntradayBars(sym, config.startDate, config.endDate);
            if (bars.length === 0) return null;
            return [sym, groupBarsByDate(bars)] as [string, Map<string, NormalizedOHLCV[]>];
          } catch { return null; }
        }),
      );
      for (const entry of batchResults) {
        if (entry) allBars5minMap.set(entry[0], entry[1]);
      }
    }

    // Use 5-min grid search when enough symbols loaded; fall back to daily-bar grid
    const has5minData = allBars5minMap.size >= 10;
    console.log(`Grid search 5-min bars loaded: ${allBars5minMap.size}/${INTRADAY_WATCHLIST.length} symbols`);
    let results: GridSearchResult[];
    if (has5minData) {
      const paramGrid = buildParamGrid5min();
      results = runGridSearch5min(allBars5minMap, allCandlesMap, config, spyCandles, paramGrid);
    } else {
      const paramGrid = buildParamGrid();
      results = runGridSearch(allCandlesMap, config, paramGrid, spyCandles);
    }

    // Compute SPY buy-and-hold return over the same date window for benchmark comparison
    let spyReturn: number | null = null;
    if (spyCandles && spyCandles.length >= 2) {
      const start = new Date(config.startDate).getTime();
      const end = new Date(config.endDate).getTime();
      const filtered = spyCandles.filter(c => {
        const t = new Date(c.timestamp).getTime();
        return t >= start && t <= end;
      });
      if (filtered.length >= 2) {
        spyReturn = ((filtered[filtered.length - 1].close / filtered[0].close) - 1) * 100;
      }
    }

    return NextResponse.json({
      count: results.length,
      config,
      spyReturn,
      backtestMode: has5minData ? '5min' : 'daily',
      results,
    });
  } catch (error) {
    console.error('Grid search API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Grid search failed' },
      { status: 500 },
    );
  }
}
