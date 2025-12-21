// src/app/api/backtest/run/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
import { 
  runBacktest, 
  DEFAULT_BACKTEST_CONFIG, 
  DEFAULT_STRATEGY_PARAMS 
} from '@/lib/backtest/backtest-engine';
import { BacktestConfig, StrategyParams } from '@/types/backtest';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const symbol = body.symbol?.toUpperCase();
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }
    
    const name = body.name || `${symbol} Backtest`;
    
    // Merge with defaults
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      ...body.config,
    };
    
    const params: StrategyParams = {
      ...DEFAULT_STRATEGY_PARAMS,
      ...body.params,
    };
    
    // Fetch historical data
    const candles = await dataRouter.getHistorical(symbol, '1day', 'full');
    
    if (!candles || candles.length < 100) {
      return NextResponse.json(
        { error: `Insufficient historical data for ${symbol}` },
        { status: 400 }
      );
    }
    
    // Run backtest
    const result = runBacktest(candles, config, params, name);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Backtest API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
