// src/types/backtest.ts

export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  positionSizePct: number;
  maxPositions: number;
  commission: number;
  slippageBps: number;
  stopLossPct: number;
  takeProfitPct: number;
}

export interface BacktestResult {
  id: string;
  name: string;
  config: BacktestConfig;
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  tradeLog: BacktestTrade[];
  monthlyReturns: Record<string, number>;
  createdAt: Date;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalTrades: number;
  avgHoldingDays: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface BacktestTrade {
  symbol: string;
  side: 'long' | 'short';
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdingDays: number;
  exitReason: 'target' | 'stop' | 'signal' | 'time';
}

export interface StrategyParams {
  entryRsiThreshold: number;
  exitRsiThreshold: number;
  emaFastPeriod: number;
  emaSlowPeriod: number;
  atrMultiplier: number;
  volumeThreshold: number;
  minHoldingDays: number;
  maxHoldingDays: number;
}
