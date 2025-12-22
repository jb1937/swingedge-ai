// src/app/api/backtest/run/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { dataRouter } from '@/lib/data/data-router';
import { 
  runBacktest, 
  DEFAULT_BACKTEST_CONFIG, 
  DEFAULT_STRATEGY_PARAMS 
} from '@/lib/backtest/backtest-engine';
import { 
  StrategyType, 
  STRATEGY_DEFAULTS, 
  STRATEGY_DESCRIPTIONS 
} from '@/lib/backtest/strategies';
import { backtestRequestSchema } from '@/lib/validation/schemas';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { BacktestConfig, StrategyParams } from '@/types/backtest';

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
    
    // Validate strategy
    if (!STRATEGY_DEFAULTS[strategy]) {
      return NextResponse.json(
        { error: `Invalid strategy: ${strategy}. Valid strategies: ${Object.keys(STRATEGY_DEFAULTS).join(', ')}` },
        { status: 400 }
      );
    }
    
    const strategyInfo = STRATEGY_DESCRIPTIONS[strategy];
    const backtestName = name || `${symbol} - ${strategyInfo.name}`;
    
    // Merge with defaults - use strategy-specific defaults
    const strategyDefaults = STRATEGY_DEFAULTS[strategy];
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      ...configOverrides,
    };
    
    const params: StrategyParams = {
      ...DEFAULT_STRATEGY_PARAMS,
      ...strategyDefaults,
      ...paramsOverrides,
    };
    
    // Fetch historical data
    const candles = await dataRouter.getHistorical(symbol, '1day', 'full');
    
    if (!candles || candles.length < 100) {
      return NextResponse.json(
        { error: `Insufficient historical data for ${symbol}. Need at least 100 trading days.` },
        { status: 400 }
      );
    }
    
    // Run backtest with selected strategy
    const result = runBacktest(candles, config, params, backtestName, strategy);
    
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
