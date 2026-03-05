// src/lib/analysis/technical-analysis.ts

import { NormalizedOHLCV } from '@/types/market';
import { TechnicalIndicators } from '@/types/analysis';
import {
  ema,
  rsi,
  macd,
  bollingerBands,
  atr,
  adx,
  obv,
  vwap,
  stochRsi,
  williamsR,
  mfi,
  findSupportResistance,
} from './indicators';

export interface TechnicalAnalysisResult {
  symbol: string;
  indicators: TechnicalIndicators;
  latestPrice: number;
  priceChange: number;
  priceChangePercent: number;
  analyzedAt: Date;
}

/**
 * Calculate all technical indicators for a given set of candles
 */
export function calculateTechnicalIndicators(
  candles: NormalizedOHLCV[]
): TechnicalIndicators | null {
  if (candles.length < 50) {
    console.warn('Insufficient data for technical analysis (need at least 50 candles)');
    return null;
  }

  const closes = candles.map(c => c.close);
  const latestIdx = closes.length - 1;

  // EMAs
  const ema9Values = ema(closes, 9);
  const ema21Values = ema(closes, 21);
  const ema50Values = ema(closes, 50);
  const ema200Values = ema(closes, 200);

  // MACD
  const macdResult = macd(closes);

  // RSI
  const rsiValues = rsi(closes, 14);

  // Stochastic RSI
  const stochRsiResult = stochRsi(closes);

  // Williams %R
  const williamsRValues = williamsR(candles, 14);

  // MFI
  const mfiValues = mfi(candles, 14);

  // ATR
  const atrValues = atr(candles, 14);

  // ADX
  const adxValues = adx(candles, 14);

  // Bollinger Bands
  const bbResult = bollingerBands(closes, 20, 2);

  // OBV
  const obvValues = obv(candles);

  // VWAP
  const vwapValues = vwap(candles);

  // Support/Resistance
  const srLevels = findSupportResistance(candles, 30);

  // Get latest values (handling NaN)
  const getLatest = (arr: number[], fallback: number = 0): number => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (!isNaN(arr[i])) return arr[i];
    }
    return fallback;
  };

  return {
    // Trend
    ema9: getLatest(ema9Values),
    ema21: getLatest(ema21Values),
    ema50: getLatest(ema50Values),
    ema200: getLatest(ema200Values, closes[latestIdx]),
    macd: {
      macd: getLatest(macdResult.macd),
      signal: getLatest(macdResult.signal),
      histogram: getLatest(macdResult.histogram),
    },
    adx: getLatest(adxValues, 25),

    // Momentum
    rsi14: getLatest(rsiValues, 50),
    stochRsi: {
      k: getLatest(stochRsiResult.k, 50),
      d: getLatest(stochRsiResult.d, 50),
    },
    williamsR: getLatest(williamsRValues, -50),
    mfi: getLatest(mfiValues, 50),

    // Volatility
    atr14: getLatest(atrValues),
    bollingerBands: {
      upper: getLatest(bbResult.upper),
      middle: getLatest(bbResult.middle),
      lower: getLatest(bbResult.lower),
      width: getLatest(bbResult.width),
    },

    // Volume
    obv: getLatest(obvValues),
    vwap: getLatest(vwapValues),

    // Support/Resistance
    supportLevels: srLevels.support,
    resistanceLevels: srLevels.resistance,
  };
}

/**
 * Generate a technical score from 0-100 based on indicators
 */
export function calculateTechnicalScore(indicators: TechnicalIndicators, currentPrice: number): number {
  let score = 50; // Neutral starting point
  let factors = 0;

  // Trend alignment (EMAs)
  if (currentPrice > indicators.ema9) { score += 3; factors++; }
  if (currentPrice > indicators.ema21) { score += 3; factors++; }
  if (currentPrice > indicators.ema50) { score += 4; factors++; }
  if (currentPrice > indicators.ema200) { score += 5; factors++; }
  
  // EMA alignment (bullish when short > long)
  if (indicators.ema9 > indicators.ema21) { score += 3; factors++; }
  if (indicators.ema21 > indicators.ema50) { score += 3; factors++; }

  // MACD
  if (indicators.macd.histogram > 0) { score += 5; factors++; }
  if (indicators.macd.macd > indicators.macd.signal) { score += 3; factors++; }

  // RSI - not overbought/oversold
  if (indicators.rsi14 > 30 && indicators.rsi14 < 70) {
    score += 5; factors++;
  } else if (indicators.rsi14 <= 30) {
    score += 8; factors++; // Oversold = buying opportunity
  } else {
    score -= 5; factors++; // Overbought = caution
  }

  // ADX - trend strength
  if (indicators.adx > 25) { score += 5; factors++; } // Strong trend
  if (indicators.adx > 40) { score += 3; factors++; } // Very strong trend

  // Bollinger Bands
  const bbPosition = (currentPrice - indicators.bollingerBands.lower) / 
    (indicators.bollingerBands.upper - indicators.bollingerBands.lower);
  if (bbPosition < 0.3) { score += 5; factors++; } // Near lower band
  if (bbPosition > 0.7) { score -= 3; factors++; } // Near upper band

  // MFI
  if (indicators.mfi > 30 && indicators.mfi < 70) { score += 3; factors++; }
  if (indicators.mfi <= 30) { score += 5; factors++; } // Oversold

  // Williams %R
  if (indicators.williamsR < -80) { score += 4; factors++; } // Oversold
  if (indicators.williamsR > -20) { score -= 3; factors++; } // Overbought

  // Stochastic RSI
  if (indicators.stochRsi.k < 20) { score += 4; factors++; } // Oversold
  if (indicators.stochRsi.k > 80) { score -= 3; factors++; } // Overbought

  // Normalize to 0-100
  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Intraday helpers — used by gap-fade / VWAP-reversion / ORB signal detectors
// ---------------------------------------------------------------------------

/**
 * Calculate session VWAP and ±N std-dev bands from intraday 5-min candles.
 * Pass only today's candles (from 9:30 AM onward).
 */
export function calculateIntradayVWAP(
  candles: NormalizedOHLCV[],
  stdDevMultiplier = 1.5
): { vwap: number; upperBand: number; lowerBand: number; stdDev: number } {
  if (candles.length === 0) {
    return { vwap: 0, upperBand: 0, lowerBand: 0, stdDev: 0 };
  }

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  const typicalPrices: number[] = [];

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    typicalPrices.push(tp);
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
  }

  const vwapValue =
    cumulativeVolume === 0
      ? typicalPrices[typicalPrices.length - 1]
      : cumulativeTPV / cumulativeVolume;

  const variance =
    typicalPrices.reduce((sum, tp) => sum + Math.pow(tp - vwapValue, 2), 0) /
    typicalPrices.length;
  const stdDev = Math.sqrt(variance);

  return {
    vwap: vwapValue,
    upperBand: vwapValue + stdDevMultiplier * stdDev,
    lowerBand: vwapValue - stdDevMultiplier * stdDev,
    stdDev,
  };
}

/**
 * Calculate opening range (ORB) from the first 15 minutes of trading
 * (first 3 × 5-min candles).
 */
export function calculateOpeningRange(
  candles: NormalizedOHLCV[]
): { high: number; low: number; midpoint: number; rangeSize: number } | null {
  if (candles.length < 3) return null;
  const orbCandles = candles.slice(0, 3);
  const high = Math.max(...orbCandles.map(c => c.high));
  const low = Math.min(...orbCandles.map(c => c.low));
  return { high, low, midpoint: (high + low) / 2, rangeSize: high - low };
}

/**
 * Calculate gap percent between previous close and today's open.
 * Negative = gap down, positive = gap up.
 */
export function calculateGapPercent(prevClose: number, openPrice: number): number {
  if (prevClose === 0) return 0;
  return ((openPrice - prevClose) / prevClose) * 100;
}

/**
 * Determine signal direction based on indicators
 */
export function determineSignalDirection(
  indicators: TechnicalIndicators,
  currentPrice: number
): 'long' | 'short' | 'neutral' {
  let bullishSignals = 0;
  let bearishSignals = 0;

  // Price vs EMAs
  if (currentPrice > indicators.ema50) bullishSignals++;
  else bearishSignals++;

  if (currentPrice > indicators.ema200) bullishSignals++;
  else bearishSignals++;

  // EMA crossovers
  if (indicators.ema9 > indicators.ema21) bullishSignals++;
  else bearishSignals++;

  // MACD
  if (indicators.macd.histogram > 0) bullishSignals++;
  else bearishSignals++;

  // RSI
  if (indicators.rsi14 < 40) bullishSignals++;
  if (indicators.rsi14 > 60) bearishSignals++;

  // Determine direction
  if (bullishSignals >= bearishSignals + 2) return 'long';
  if (bearishSignals >= bullishSignals + 2) return 'short';
  return 'neutral';
}
