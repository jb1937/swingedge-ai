// src/app/api/backtest/run/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { dataRouter } from '@/lib/data/data-router';
import {
  runBacktest,
  DEFAULT_BACKTEST_CONFIG,
  DEFAULT_STRATEGY_PARAMS,
} from '@/lib/backtest/backtest-engine';
import {
  StrategyType,
  STRATEGY_DEFAULTS,
  STRATEGY_DESCRIPTIONS,
} from '@/lib/backtest/strategies';
import {
  runGapFadeBacktest,
  runVWAPReversionBacktest,
  runORBBacktest,
  runAutoModeBacktest,
  runPortfolioAutoModeBacktest,
} from '@/lib/backtest/intraday-backtest';
import { groupBarsByDate, runPortfolio5minBacktest } from '@/lib/backtest/intraday-backtest-5min';
import { DEFAULT_SIGNAL_PARAMS, SignalParams } from '@/types/backtest';
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { getBatchCachedBars, setCachedBars } from '@/lib/data/bars-cache';
import { backtestRequestSchema } from '@/lib/validation/schemas';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { BacktestConfig, StrategyParams } from '@/types/backtest';
import { NormalizedOHLCV } from '@/types/market';

const SINGLE_SYMBOL_INTRADAY: StrategyType[] = ['gap_fade', 'vwap_reversion', 'orb', 'auto_mode'];

export async function POST(request: NextRequest) {
  try {
    // Check rate limit (backtests are expensive, so limit more strictly)
    const rateLimitResponse = rateLimitMiddleware(request, 'backtest');
    if (rateLimitResponse) return rateLimitResponse;

    // Get session
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request
    const validation = backtestRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: validation.error.flatten()
        },
        { status: 400 }
      );
    }

    const { symbol, name, config: configOverrides, params: paramsOverrides } = validation.data;
    const strategy = (body.strategy || 'ema_crossover') as StrategyType;
    const excludedSectors: string[] = Array.isArray(body.excludedSectors) ? body.excludedSectors : [];

    // Validate strategy
    if (!STRATEGY_DEFAULTS[strategy]) {
      return NextResponse.json(
        { error: `Invalid strategy: ${strategy}. Valid strategies: ${Object.keys(STRATEGY_DEFAULTS).join(', ')}` },
        { status: 400 }
      );
    }

    // Portfolio mode doesn't need a symbol; all others do
    if (strategy !== 'portfolio_auto_mode' && !symbol) {
      return NextResponse.json(
        { error: 'Symbol is required for this strategy' },
        { status: 400 }
      );
    }

    const strategyInfo = STRATEGY_DESCRIPTIONS[strategy];
    const backtestName = name || (strategy === 'portfolio_auto_mode'
      ? strategyInfo.name
      : `${symbol} - ${strategyInfo.name}`);

    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      ...configOverrides,
    };

    const params: StrategyParams = {
      ...DEFAULT_STRATEGY_PARAMS,
      ...STRATEGY_DEFAULTS[strategy],
      ...paramsOverrides,
    };

    const excl = excludedSectors.length > 0 ? excludedSectors : undefined;
    const signalParams: SignalParams = {
      ...DEFAULT_SIGNAL_PARAMS,
      ...(body.signalParams ?? {}),
    };
    let result;

    if (strategy === 'portfolio_auto_mode') {
      // Fetch SPY first — needed for regime gate + benchmark; must not be dropped by rate limits
      let spyCandles: NormalizedOHLCV[] | undefined;
      try {
        const fetched = await dataRouter.getHistorical('SPY', '1day', 'full');
        if (fetched && fetched.length >= 30) spyCandles = fetched;
      } catch { /* benchmark will be omitted gracefully */ }

      // Fetch candles for all watchlist symbols in parallel
      const candleEntries = await Promise.all(
        INTRADAY_WATCHLIST.map(async (sym) => {
          try {
            const c = await dataRouter.getHistorical(sym, '1day', 'full');
            return c && c.length >= 30 ? ([sym, c] as [string, NormalizedOHLCV[]]) : null;
          } catch {
            return null;
          }
        })
      );
      const allCandlesMap = new Map<string, NormalizedOHLCV[]>(
        candleEntries.filter((e): e is [string, NormalizedOHLCV[]] => e !== null)
      );
      // Use the pre-fetched SPY; fall back to batch result if pre-fetch failed
      if (!spyCandles) spyCandles = allCandlesMap.get('SPY');
      // Load 5-min bars: check Redis cache first, fall back to Alpaca for misses.
      const allBars5minMap = new Map<string, Map<string, NormalizedOHLCV[]>>();
      let cacheHits = 0;

      // Phase 1: batch-load from Redis cache
      const cachedBarsMap = await getBatchCachedBars(INTRADAY_WATCHLIST);
      for (const [sym, bars] of cachedBarsMap) {
        allBars5minMap.set(sym, groupBarsByDate(bars));
        cacheHits++;
      }

      // Phase 2: Alpaca fetch for cache misses (batches of 5)
      const missSymbols = INTRADAY_WATCHLIST.filter(s => !cachedBarsMap.has(s));
      if (missSymbols.length > 0) {
        console.log(`Backtest: ${cacheHits} cache hits, ${missSymbols.length} Alpaca fetches needed`);
        const BATCH_SIZE = 5;
        for (let i = 0; i < missSymbols.length; i += BATCH_SIZE) {
          const batch = missSymbols.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (sym) => {
              try {
                const bars = await alpacaDataClient.getHistoricalIntradayBars(sym, config.startDate, config.endDate);
                if (bars.length === 0) return null;
                // Populate cache so next run is instant
                setCachedBars(sym, bars).catch(() => {});
                return [sym, groupBarsByDate(bars)] as [string, Map<string, NormalizedOHLCV[]>];
              } catch { return null; }
            })
          );
          for (const entry of batchResults) {
            if (entry) allBars5minMap.set(entry[0], entry[1]);
          }
        }
      } else {
        console.log(`Backtest: all ${cacheHits} symbols loaded from Redis cache`);
      }

      // Use 5-min backtester when enough symbols loaded; fall back to daily-bar approximation
      console.log(`Backtest 5-min bars loaded: ${allBars5minMap.size}/${INTRADAY_WATCHLIST.length} symbols`);
      const has5minData = allBars5minMap.size >= 10;
      result = has5minData
        ? runPortfolio5minBacktest(allBars5minMap, allCandlesMap, config, excl, spyCandles, signalParams)
        : runPortfolioAutoModeBacktest(allCandlesMap, config, excl, spyCandles, signalParams);

      // Compute SPY buy-and-hold return over the same date window for the benchmark card
      let portfolioSpyReturn: number | null = null;
      if (spyCandles && spyCandles.length >= 2) {
        const start = new Date(config.startDate).getTime();
        const end = new Date(config.endDate).getTime();
        const filtered = spyCandles.filter(c => {
          const t = new Date(c.timestamp).getTime();
          return t >= start && t <= end;
        });
        if (filtered.length >= 2) {
          portfolioSpyReturn = ((filtered[filtered.length - 1].close / filtered[0].close) - 1) * 100;
        }
      }

      const portfolioResponse = NextResponse.json({
        ...result,
        spyReturn: portfolioSpyReturn,
        backtestMode: has5minData ? '5min' : 'daily',
        bars5minLoaded: allBars5minMap.size,
        bars5minTotal: INTRADAY_WATCHLIST.length,
        cacheHits,
        strategy: {
          type: strategy,
          name: strategyInfo.name,
          description: strategyInfo.description,
        },
      });
      return addRateLimitHeaders(portfolioResponse, getClientIP(request), 'backtest');
    } else {
      // Fetch historical data for single-symbol strategies
      const candles = await dataRouter.getHistorical(symbol!, '1day', 'full');

      if (!candles || candles.length < 100) {
        return NextResponse.json(
          { error: `Insufficient historical data for ${symbol}. Need at least 100 trading days.` },
          { status: 400 }
        );
      }

      if (SINGLE_SYMBOL_INTRADAY.includes(strategy)) {
        // Fetch SPY for the market regime gate (same logic as portfolio_auto_mode).
        let spyCandles: NormalizedOHLCV[] | undefined;
        try {
          const fetched = await dataRouter.getHistorical('SPY', '1day', 'full');
          if (fetched && fetched.length >= 30) spyCandles = fetched;
        } catch { /* SPY gate will be skipped gracefully if fetch fails */ }

        const runners: Record<string, (s: string, c: NormalizedOHLCV[], cfg: BacktestConfig, excl?: string[], spy?: NormalizedOHLCV[]) => ReturnType<typeof runGapFadeBacktest>> = {
          gap_fade: runGapFadeBacktest,
          vwap_reversion: runVWAPReversionBacktest,
          orb: runORBBacktest,
          auto_mode: runAutoModeBacktest,
        };
        result = runners[strategy](symbol!, candles, config, excl, spyCandles);
      } else {
        result = runBacktest(candles, config, params, backtestName, strategy);
      }
    }

    const response = NextResponse.json({
      ...result,
      strategy: {
        type: strategy,
        name: strategyInfo.name,
        description: strategyInfo.description,
      },
    });
    return addRateLimitHeaders(response, getClientIP(request), 'backtest');
  } catch (error) {
    console.error('Backtest API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
