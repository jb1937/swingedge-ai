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
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';
import { DEFAULT_BACKTEST_CONFIG } from '@/lib/backtest/backtest-engine';
import { NormalizedOHLCV } from '@/types/market';
import { BacktestConfig } from '@/types/backtest';

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

    // Fetch candles for all watchlist symbols in parallel — done once for all 72 runs
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

    // Ensure SPY is available for regime gate
    let spyCandles = allCandlesMap.get('SPY');
    if (!spyCandles) {
      try {
        const fetched = await dataRouter.getHistorical('SPY', '1day', 'full');
        if (fetched && fetched.length >= 30) spyCandles = fetched;
      } catch { /* regime gate will be skipped gracefully */ }
    }

    const paramGrid = buildParamGrid();
    const results = runGridSearch(allCandlesMap, config, paramGrid, spyCandles);

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
