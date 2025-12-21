// src/lib/backtest/backtest-engine.ts

import { NormalizedOHLCV } from '@/types/market';
import { 
  BacktestConfig, 
  BacktestResult, 
  BacktestMetrics, 
  BacktestTrade,
  EquityPoint,
  StrategyParams,
} from '@/types/backtest';
import { calculateTechnicalIndicators } from '@/lib/analysis/technical-analysis';
import { ema, rsi, atr } from '@/lib/analysis/indicators';

interface Signal {
  type: 'buy' | 'sell' | 'hold';
  strength: number;
}

/**
 * Generate trading signal based on strategy params
 */
function generateSignal(
  candles: NormalizedOHLCV[],
  index: number,
  params: StrategyParams
): Signal {
  if (index < params.emaSlowPeriod + 5) {
    return { type: 'hold', strength: 0 };
  }

  const closes = candles.slice(0, index + 1).map(c => c.close);
  const volumes = candles.slice(0, index + 1).map(c => c.volume);
  
  const fastEMA = ema(closes, params.emaFastPeriod);
  const slowEMA = ema(closes, params.emaSlowPeriod);
  const rsiValues = rsi(closes, 14);
  
  const currentFastEMA = fastEMA[fastEMA.length - 1];
  const currentSlowEMA = slowEMA[slowEMA.length - 1];
  const prevFastEMA = fastEMA[fastEMA.length - 2];
  const prevSlowEMA = slowEMA[slowEMA.length - 2];
  const currentRSI = rsiValues[rsiValues.length - 1];
  
  // Volume filter
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = volumes[volumes.length - 1] / avgVolume;
  
  // Entry signal: EMA crossover + RSI confirmation + volume
  if (
    prevFastEMA <= prevSlowEMA &&
    currentFastEMA > currentSlowEMA &&
    currentRSI < params.entryRsiThreshold &&
    volumeRatio >= params.volumeThreshold
  ) {
    return { type: 'buy', strength: Math.min(1, volumeRatio / 2) };
  }
  
  // Exit signal: EMA crossunder or RSI overbought
  if (
    (prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA) ||
    currentRSI > params.exitRsiThreshold
  ) {
    return { type: 'sell', strength: 1 };
  }
  
  return { type: 'hold', strength: 0 };
}

/**
 * Run backtest on historical data
 */
export function runBacktest(
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  params: StrategyParams,
  backtestName: string = 'Backtest'
): BacktestResult {
  const { 
    initialCapital, 
    positionSizePct, 
    maxPositions, 
    commission, 
    slippageBps,
    stopLossPct,
    takeProfitPct,
  } = config;
  
  let cash = initialCapital;
  let equity = initialCapital;
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const monthlyReturns: Record<string, number> = {};
  
  interface Position {
    symbol: string;
    side: 'long';
    entryPrice: number;
    entryDate: string;
    quantity: number;
    stopPrice: number;
    targetPrice: number;
  }
  
  let position: Position | null = null;
  let maxEquity = initialCapital;
  let maxDrawdown = 0;
  
  // Filter candles by date range
  const startDate = new Date(config.startDate);
  const endDate = new Date(config.endDate);
  const filteredCandles = candles.filter(c => {
    const date = new Date(c.timestamp);
    return date >= startDate && date <= endDate;
  });
  
  if (filteredCandles.length < 50) {
    throw new Error('Insufficient data for backtest period');
  }
  
  const atrValues = atr(filteredCandles, 14);
  
  for (let i = params.emaSlowPeriod + 5; i < filteredCandles.length; i++) {
    const candle = filteredCandles[i];
    const currentDate = new Date(candle.timestamp).toISOString().split('T')[0];
    const currentATR = atrValues[i] || candle.close * 0.02;
    
    // Check existing position
    if (position) {
      const currentPrice = candle.close;
      const daysHeld = Math.floor(
        (new Date(candle.timestamp).getTime() - new Date(position.entryDate).getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      
      let exitReason: 'target' | 'stop' | 'signal' | 'time' | null = null;
      let exitPrice = 0;
      
      // Check stop loss (hit during the day)
      if (candle.low <= position.stopPrice) {
        exitPrice = position.stopPrice;
        exitReason = 'stop';
      }
      // Check take profit
      else if (candle.high >= position.targetPrice) {
        exitPrice = position.targetPrice;
        exitReason = 'target';
      }
      // Check time-based exit
      else if (daysHeld >= params.maxHoldingDays) {
        exitPrice = currentPrice;
        exitReason = 'time';
      }
      // Check signal-based exit
      else {
        const signal = generateSignal(filteredCandles.slice(0, i + 1), i, params);
        if (signal.type === 'sell' && daysHeld >= params.minHoldingDays) {
          exitPrice = currentPrice;
          exitReason = 'signal';
        }
      }
      
      if (exitReason) {
        // Apply slippage
        exitPrice = exitPrice * (1 - slippageBps / 10000);
        
        const grossPnL = (exitPrice - position.entryPrice) * position.quantity;
        const commissionPaid = position.quantity * position.entryPrice * commission + 
                               position.quantity * exitPrice * commission;
        const netPnL = grossPnL - commissionPaid;
        const pnlPercent = (exitPrice - position.entryPrice) / position.entryPrice * 100;
        
        cash += position.quantity * exitPrice - commissionPaid;
        
        trades.push({
          symbol: position.symbol,
          side: 'long',
          entryDate: position.entryDate,
          exitDate: currentDate,
          entryPrice: position.entryPrice,
          exitPrice,
          quantity: position.quantity,
          pnl: netPnL,
          pnlPercent,
          holdingDays: daysHeld,
          exitReason,
        });
        
        position = null;
      }
    }
    
    // Check for new entry signal
    if (!position) {
      const signal = generateSignal(filteredCandles.slice(0, i + 1), i, params);
      
      if (signal.type === 'buy') {
        const entryPrice = candle.close * (1 + slippageBps / 10000); // Apply slippage
        const positionValue = equity * positionSizePct;
        const quantity = Math.floor(positionValue / entryPrice);
        
        if (quantity > 0 && cash >= quantity * entryPrice) {
          const stopDistance = currentATR * params.atrMultiplier;
          const stopPrice = entryPrice - stopDistance;
          const riskAmount = stopDistance * quantity;
          const targetPrice = entryPrice + (stopDistance * 2); // 2:1 R/R
          
          cash -= quantity * entryPrice + (quantity * entryPrice * commission);
          
          position = {
            symbol: filteredCandles[0].symbol,
            side: 'long',
            entryPrice,
            entryDate: currentDate,
            quantity,
            stopPrice,
            targetPrice,
          };
        }
      }
    }
    
    // Calculate equity
    const positionValue = position ? position.quantity * candle.close : 0;
    equity = cash + positionValue;
    
    // Track drawdown
    maxEquity = Math.max(maxEquity, equity);
    const currentDrawdown = (maxEquity - equity) / maxEquity;
    maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
    
    // Record equity curve (daily)
    equityCurve.push({
      date: currentDate,
      equity,
      drawdown: currentDrawdown * 100,
    });
    
    // Track monthly returns
    const monthKey = currentDate.slice(0, 7);
    if (!monthlyReturns[monthKey]) {
      monthlyReturns[monthKey] = 0;
    }
  }
  
  // Calculate monthly returns properly
  const equityByMonth: Record<string, { start: number; end: number }> = {};
  for (const point of equityCurve) {
    const month = point.date.slice(0, 7);
    if (!equityByMonth[month]) {
      equityByMonth[month] = { start: point.equity, end: point.equity };
    }
    equityByMonth[month].end = point.equity;
  }
  
  for (const [month, values] of Object.entries(equityByMonth)) {
    monthlyReturns[month] = ((values.end - values.start) / values.start) * 100;
  }
  
  // Calculate metrics
  const metrics = calculateMetrics(trades, initialCapital, equity, equityCurve);
  
  return {
    id: crypto.randomUUID(),
    name: backtestName,
    config,
    metrics,
    equityCurve,
    tradeLog: trades,
    monthlyReturns,
    createdAt: new Date(),
  };
}

/**
 * Calculate backtest performance metrics
 */
function calculateMetrics(
  trades: BacktestTrade[],
  initialCapital: number,
  finalEquity: number,
  equityCurve: EquityPoint[]
): BacktestMetrics {
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
  
  // Annualized return (assuming 252 trading days)
  const tradingDays = equityCurve.length;
  const years = tradingDays / 252;
  const annualizedReturn = years > 0 
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100 
    : 0;
  
  // Calculate returns for Sharpe/Sortino
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    dailyReturns.push(ret);
  }
  
  const avgDailyReturn = dailyReturns.length > 0 
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length 
    : 0;
  
  const variance = dailyReturns.length > 0
    ? dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length
    : 0;
  const stdDev = Math.sqrt(variance);
  
  // Sharpe Ratio (annualized, assuming 0% risk-free rate)
  const sharpeRatio = stdDev > 0 ? (avgDailyReturn / stdDev) * Math.sqrt(252) : 0;
  
  // Sortino Ratio (downside deviation only)
  const negativeReturns = dailyReturns.filter(r => r < 0);
  const downsideVariance = negativeReturns.length > 0
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDev > 0 ? (avgDailyReturn / downsideDev) * Math.sqrt(252) : 0;
  
  // Max drawdown
  const maxDrawdown = Math.max(...equityCurve.map(e => e.drawdown));
  
  // Win rate and P&L stats
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
    : 0;
  
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length
    : 0;
  
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  const avgHoldingDays = trades.length > 0
    ? trades.reduce((sum, t) => sum + t.holdingDays, 0) / trades.length
    : 0;
  
  return {
    totalReturn,
    annualizedReturn,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    totalTrades: trades.length,
    avgHoldingDays,
  };
}

/**
 * Default strategy parameters
 */
export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  entryRsiThreshold: 60,
  exitRsiThreshold: 75,
  emaFastPeriod: 9,
  emaSlowPeriod: 21,
  atrMultiplier: 2,
  volumeThreshold: 1.0,
  minHoldingDays: 2,
  maxHoldingDays: 10,
};

/**
 * Default backtest configuration
 */
export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  initialCapital: 100000,
  positionSizePct: 0.1,
  maxPositions: 5,
  commission: 0.001,
  slippageBps: 5,
  stopLossPct: 0.05,
  takeProfitPct: 0.1,
};
