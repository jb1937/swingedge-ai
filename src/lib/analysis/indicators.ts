// src/lib/analysis/indicators.ts

import { NormalizedOHLCV } from '@/types/market';

/**
 * Simple Moving Average
 */
export function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

/**
 * Exponential Moving Average
 */
export function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA uses SMA as starting point
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(NaN);
  }
  result[period - 1] = sum / period;
  
  for (let i = period; i < data.length; i++) {
    const emaValue = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    result.push(emaValue);
  }
  
  return result;
}

/**
 * Relative Strength Index (RSI)
 */
export function rsi(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // First RSI value
  result.push(NaN); // First data point has no previous
  
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    } else {
      // Use smoothed average
      const prevAvgGain = (result[i] === 100 ? gains[i - 1] : gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period);
      const prevAvgLoss = (result[i] === 0 ? losses[i - 1] : losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period);
      const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
      const avgLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
  }
  
  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 */
export function macd(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = ema(data, fastPeriod);
  const slowEMA = ema(data, slowPeriod);
  
  const macdLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }
  
  // Signal line is EMA of MACD line
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalEMA = ema(validMacd, signalPeriod);
  
  // Pad signal line to match MACD length
  const signalLine: number[] = [];
  let signalIdx = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(macdLine[i])) {
      signalLine.push(NaN);
    } else {
      signalLine.push(signalEMA[signalIdx] || NaN);
      signalIdx++;
    }
  }
  
  // Histogram
  const histogram: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - signalLine[i]);
    }
  }
  
  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Bollinger Bands
 */
export function bollingerBands(
  data: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[]; width: number[] } {
  const middle = sma(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const width: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      width.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
      width.push((upper[i] - lower[i]) / middle[i]);
    }
  }
  
  return { upper, middle, lower, width };
}

/**
 * Average True Range (ATR)
 */
export function atr(candles: NormalizedOHLCV[], period: number = 14): number[] {
  const trueRanges: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trueRanges.push(tr);
    }
  }
  
  // ATR is smoothed average of true range
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      result.push(trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period);
    } else {
      result.push((result[i - 1] * (period - 1) + trueRanges[i]) / period);
    }
  }
  
  return result;
}

/**
 * Average Directional Index (ADX)
 */
export function adx(candles: NormalizedOHLCV[], period: number = 14): number[] {
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRanges: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      plusDM.push(0);
      minusDM.push(0);
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const upMove = candles[i].high - candles[i - 1].high;
      const downMove = candles[i - 1].low - candles[i].low;
      
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trueRanges.push(tr);
    }
  }
  
  // Smoothed values
  const smoothedPlusDM = ema(plusDM, period);
  const smoothedMinusDM = ema(minusDM, period);
  const smoothedTR = ema(trueRanges, period);
  
  // DI+ and DI-
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(smoothedTR[i]) || smoothedTR[i] === 0) {
      plusDI.push(NaN);
      minusDI.push(NaN);
      dx.push(NaN);
    } else {
      const pdi = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
      const mdi = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
      plusDI.push(pdi);
      minusDI.push(mdi);
      
      const diSum = pdi + mdi;
      dx.push(diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100);
    }
  }
  
  // ADX is smoothed DX
  return ema(dx.filter(v => !isNaN(v)), period);
}

/**
 * On-Balance Volume (OBV)
 */
export function obv(candles: NormalizedOHLCV[]): number[] {
  const result: number[] = [candles[0]?.volume || 0];
  
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      result.push(result[i - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      result.push(result[i - 1] - candles[i].volume);
    } else {
      result.push(result[i - 1]);
    }
  }
  
  return result;
}

/**
 * Volume Weighted Average Price (VWAP) - Intraday
 */
export function vwap(candles: NormalizedOHLCV[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    
    result.push(cumulativeVolume === 0 ? typicalPrice : cumulativeTPV / cumulativeVolume);
  }
  
  return result;
}

/**
 * Stochastic RSI
 */
export function stochRsi(
  data: number[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kPeriod: number = 3,
  dPeriod: number = 3
): { k: number[]; d: number[] } {
  const rsiValues = rsi(data, rsiPeriod);
  
  const stochK: number[] = [];
  for (let i = 0; i < rsiValues.length; i++) {
    if (i < stochPeriod - 1 || isNaN(rsiValues[i])) {
      stochK.push(NaN);
    } else {
      const slice = rsiValues.slice(i - stochPeriod + 1, i + 1).filter(v => !isNaN(v));
      const minRsi = Math.min(...slice);
      const maxRsi = Math.max(...slice);
      const range = maxRsi - minRsi;
      stochK.push(range === 0 ? 50 : ((rsiValues[i] - minRsi) / range) * 100);
    }
  }
  
  // Smooth K and D
  const k = sma(stochK.filter(v => !isNaN(v)), kPeriod);
  const d = sma(k.filter(v => !isNaN(v)), dPeriod);
  
  return { k, d };
}

/**
 * Williams %R
 */
export function williamsR(candles: NormalizedOHLCV[], period: number = 14): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const range = highestHigh - lowestLow;
      
      result.push(range === 0 ? -50 : ((highestHigh - candles[i].close) / range) * -100);
    }
  }
  
  return result;
}

/**
 * Money Flow Index (MFI)
 */
export function mfi(candles: NormalizedOHLCV[], period: number = 14): number[] {
  const typicalPrices: number[] = [];
  const moneyFlows: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    typicalPrices.push(tp);
    moneyFlows.push(tp * candles[i].volume);
  }
  
  const result: number[] = [NaN]; // First value has no comparison
  
  for (let i = 1; i < candles.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      let positiveFlow = 0;
      let negativeFlow = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrices[j] > typicalPrices[j - 1]) {
          positiveFlow += moneyFlows[j];
        } else if (typicalPrices[j] < typicalPrices[j - 1]) {
          negativeFlow += moneyFlows[j];
        }
      }
      
      const mfRatio = negativeFlow === 0 ? 100 : positiveFlow / negativeFlow;
      result.push(100 - (100 / (1 + mfRatio)));
    }
  }
  
  return result;
}

/**
 * Find Support and Resistance levels using pivot points
 */
export function findSupportResistance(
  candles: NormalizedOHLCV[],
  lookback: number = 20
): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  if (candles.length < lookback) {
    return { support: [], resistance: [] };
  }
  
  const recentCandles = candles.slice(-lookback);
  const closes = recentCandles.map(c => c.close);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  
  // Find local minima and maxima
  for (let i = 2; i < recentCandles.length - 2; i++) {
    // Local high (resistance)
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
        highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      if (!resistance.includes(highs[i])) {
        resistance.push(highs[i]);
      }
    }
    
    // Local low (support)
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      if (!support.includes(lows[i])) {
        support.push(lows[i]);
      }
    }
  }
  
  // Sort and take top 3 levels
  support.sort((a, b) => a - b);
  resistance.sort((a, b) => b - a);
  
  return {
    support: support.slice(0, 3),
    resistance: resistance.slice(0, 3),
  };
}
