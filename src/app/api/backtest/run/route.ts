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
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';
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
    let result;

    if (strategy === 'portfolio_auto_mode') {
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
      // Ensure SPY is available for benchmark — fetch explicitly if the parallel
      // batch silently dropped it (rate limit / timeout on one of the 64 fetches)
      let spyCandles = allCandlesMap.get('SPY');
      if (!spyCandles) {
        try {
          const fetched = await dataRouter.getHistorical('SPY', '1day', 'full');
          if (fetched && fetched.length >= 30) spyCandles = fetched;
        } catch { /* benchmark will be omitted gracefully */ }
      }
      result = runPortfolioAutoModeBacktest(allCandlesMap, config, excl, spyCandles);
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
