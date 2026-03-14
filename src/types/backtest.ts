// src/types/backtest.ts

export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  positionSizePct: number;     // legacy flat-% sizing (used by EMA crossover backtest)
  riskPerTradePct: number;     // fraction of equity to risk per trade (intraday, default 0.01)
  maxPositionPct: number;      // hard cap on single position as % of equity (default 0.20)
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
  benchmarkCurve?: EquityPoint[];
  tradeLog: BacktestTrade[];
  monthlyReturns: Record<string, number>;
  createdAt: Date;
  bySymbol: Record<string, BreakdownEntry>;
  bySignalType: Record<string, BreakdownEntry>;
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
  exitReason: 'target' | 'stop' | 'signal' | 'time' | 'trailing_stop';
  signalType?: 'gap_fade' | 'vwap_reversion' | 'orb';
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

// ---------------------------------------------------------------------------
// Signal parameter optimization types
// ---------------------------------------------------------------------------

/** Key thresholds for intraday signal detection — the parameters the grid search sweeps. */
export interface SignalParams {
  /** Min gap% (absolute value) for gap_fade and vwap_reversion entry. Default 2.0 */
  gapThresholdPct: number;
  /** Min ATR/price% required to accept any signal. Default 1.5 */
  atrGatePct: number;
  /** Minimum signal quality (R:R gate). 'good' = R:R ≥ 1.5; 'excellent' = R:R ≥ 2.0 */
  minQuality: 'good' | 'excellent';
  /** Which signal types to include. Default all three. */
  enabledSignals: ('gap_fade' | 'vwap_reversion' | 'orb')[];
}

export const DEFAULT_SIGNAL_PARAMS: SignalParams = {
  gapThresholdPct: 2.0,
  atrGatePct: 1.5,
  minQuality: 'good',
  enabledSignals: ['gap_fade', 'vwap_reversion'],
};

/** Per-symbol or per-signal-type P&L breakdown. */
export interface BreakdownEntry {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;       // 0–100
  totalPnlPct: number;   // sum of pnlPercent across all trades
  avgWin: number;        // average pnlPercent of winning trades
  avgLoss: number;       // average pnlPercent of losing trades (negative)
  profitFactor: number;
}

/** Single result from a grid search sweep. */
export interface GridSearchResult {
  params: SignalParams;
  metrics: Pick<BacktestMetrics, 'totalReturn' | 'profitFactor' | 'winRate' | 'totalTrades'>;
  bySignalType: Record<string, BreakdownEntry>;
}
