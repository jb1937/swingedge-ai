// src/hooks/useBacktest.ts

import { useMutation } from '@tanstack/react-query';
import { BacktestResult, BacktestConfig, StrategyParams } from '@/types/backtest';

interface BacktestRequest {
  symbol: string;
  name?: string;
  strategy?: string;
  config?: Partial<BacktestConfig>;
  params?: Partial<StrategyParams>;
}

async function runBacktest(request: BacktestRequest): Promise<BacktestResult> {
  const response = await fetch('/api/backtest/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to run backtest');
  }
  
  return response.json();
}

export function useBacktest() {
  return useMutation({
    mutationFn: runBacktest,
  });
}
