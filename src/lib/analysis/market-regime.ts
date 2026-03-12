// src/lib/analysis/market-regime.ts

import { NormalizedOHLCV } from '@/types/market';
import { ema, atr, adx } from './indicators';

export type MarketRegime = 'strong-bull' | 'bull' | 'neutral' | 'bear' | 'strong-bear';
export type TrendStrength = 'strong' | 'moderate' | 'weak' | 'none';
export type Volatility = 'high' | 'normal' | 'low';

export interface MarketRegimeResult {
  regime: MarketRegime;
  strength: number; // 0-100
  trend: {
    direction: 'up' | 'down' | 'sideways';
    strength: TrendStrength;
    ema50Above200: boolean;
    priceAbove200: boolean;
    priceAbove50: boolean;
  };
  volatility: {
    level: Volatility;
    atrPercent: number; // ATR as % of price
    expanding: boolean;
  };
  momentum: {
    adx: number;
    trending: boolean;
  };
  recommendation: {
    strategy: 'momentum' | 'mean-reversion' | 'avoid';
    positionSizeAdjustment: number; // 0.5 = half, 1.0 = normal, 1.5 = 150%
    bias: 'long' | 'short' | 'neutral';
  };
  summary: string;
}

/**
 * Detect the current market regime based on price action
 */
export function detectMarketRegime(candles: NormalizedOHLCV[]): MarketRegimeResult | null {
  if (candles.length < 200) {
    console.warn('Need at least 200 candles for market regime detection');
    return null;
  }

  const closes = candles.map(c => c.close);
  const latestPrice = closes[closes.length - 1];
  const latestIdx = closes.length - 1;

  // Calculate EMAs
  const ema50Values = ema(closes, 50);
  const ema200Values = ema(closes, 200);
  const ema50 = ema50Values[latestIdx];
  const ema200 = ema200Values[latestIdx];

  // Calculate ADX for trend strength
  const adxValues = adx(candles, 14);
  const currentADX = adxValues.length > 0 ? adxValues[adxValues.length - 1] : 20;

  // Calculate ATR for volatility
  const atrValues = atr(candles, 14);
  const currentATR = atrValues[latestIdx];
  const atrPercent = (currentATR / latestPrice) * 100;

  // Calculate historical ATR for comparison (20-day rolling average)
  const historicalATRs = atrValues.slice(-40, -20).filter(v => !isNaN(v));
  const avgHistoricalATR = historicalATRs.length > 0 
    ? historicalATRs.reduce((a, b) => a + b, 0) / historicalATRs.length 
    : currentATR;
  const volatilityExpanding = currentATR > avgHistoricalATR * 1.2;

  // Trend analysis
  const ema50Above200 = ema50 > ema200;
  const priceAbove200 = latestPrice > ema200;
  const priceAbove50 = latestPrice > ema50;

  // Calculate 20-day price change
  const price20DaysAgo = closes[closes.length - 21] || closes[0];
  const priceChange20D = ((latestPrice - price20DaysAgo) / price20DaysAgo) * 100;

  // Determine trend direction
  let trendDirection: 'up' | 'down' | 'sideways';
  if (priceAbove200 && priceAbove50 && ema50Above200) {
    trendDirection = 'up';
  } else if (!priceAbove200 && !priceAbove50 && !ema50Above200) {
    trendDirection = 'down';
  } else {
    trendDirection = 'sideways';
  }

  // Determine trend strength based on ADX
  let trendStrength: TrendStrength;
  const trending = currentADX > 25;
  if (currentADX >= 40) {
    trendStrength = 'strong';
  } else if (currentADX >= 25) {
    trendStrength = 'moderate';
  } else if (currentADX >= 15) {
    trendStrength = 'weak';
  } else {
    trendStrength = 'none';
  }

  // Determine volatility level
  let volatilityLevel: Volatility;
  if (atrPercent >= 3) {
    volatilityLevel = 'high';
  } else if (atrPercent >= 1.5) {
    volatilityLevel = 'normal';
  } else {
    volatilityLevel = 'low';
  }

  // Determine market regime
  let regime: MarketRegime;
  let strength: number;

  if (trendDirection === 'up' && trending) {
    if (trendStrength === 'strong' && priceChange20D > 5) {
      regime = 'strong-bull';
      strength = 85 + Math.min(15, priceChange20D);
    } else {
      regime = 'bull';
      strength = 60 + Math.min(20, currentADX);
    }
  } else if (trendDirection === 'down' && trending) {
    if (trendStrength === 'strong' && priceChange20D < -5) {
      regime = 'strong-bear';
      strength = 85 + Math.min(15, Math.abs(priceChange20D));
    } else {
      regime = 'bear';
      strength = 60 + Math.min(20, currentADX);
    }
  } else {
    regime = 'neutral';
    strength = 50 - Math.abs(priceChange20D);
  }

  // Clamp strength
  strength = Math.max(0, Math.min(100, strength));

  // Determine strategy recommendation
  let strategy: 'momentum' | 'mean-reversion' | 'avoid';
  let positionSizeAdjustment: number;
  let bias: 'long' | 'short' | 'neutral';

  if (regime === 'strong-bull' || regime === 'bull') {
    strategy = trending ? 'momentum' : 'mean-reversion';
    positionSizeAdjustment = volatilityLevel === 'high' ? 0.75 : 1.0;
    bias = 'long';
  } else if (regime === 'strong-bear' || regime === 'bear') {
    strategy = trending ? 'momentum' : 'avoid';
    positionSizeAdjustment = volatilityLevel === 'high' ? 0.5 : 0.75;
    bias = regime === 'strong-bear' ? 'short' : 'neutral';
  } else {
    strategy = trending ? 'momentum' : 'mean-reversion';
    positionSizeAdjustment = volatilityLevel === 'high' ? 0.5 : 0.75;
    bias = 'neutral';
  }

  // Generate summary
  const summary = generateRegimeSummary(regime, trendStrength, volatilityLevel, strategy);

  return {
    regime,
    strength,
    trend: {
      direction: trendDirection,
      strength: trendStrength,
      ema50Above200,
      priceAbove200,
      priceAbove50,
    },
    volatility: {
      level: volatilityLevel,
      atrPercent,
      expanding: volatilityExpanding,
    },
    momentum: {
      adx: currentADX,
      trending,
    },
    recommendation: {
      strategy,
      positionSizeAdjustment,
      bias,
    },
    summary,
  };
}

function generateRegimeSummary(
  regime: MarketRegime,
  trendStrength: TrendStrength,
  volatility: Volatility,
  strategy: string
): string {
  const regimeDescriptions: Record<MarketRegime, string> = {
    'strong-bull': 'Strong uptrend with significant momentum',
    'bull': 'Bullish trend with positive momentum',
    'neutral': 'Range-bound/sideways market',
    'bear': 'Bearish trend with negative momentum',
    'strong-bear': 'Strong downtrend with significant selling pressure',
  };

  const strategyAdvice: Record<string, string> = {
    'momentum': 'Follow the trend - look for pullback entries in trend direction',
    'mean-reversion': 'Look for oversold bounces and overbought reversals',
    'avoid': 'Consider staying in cash or reducing exposure',
  };

  const volatilityAdvice: Record<Volatility, string> = {
    'high': 'Use wider stops and smaller position sizes',
    'normal': 'Standard position sizing appropriate',
    'low': 'Tighter stops possible, watch for breakouts',
  };

  return `${regimeDescriptions[regime]}. Trend strength: ${trendStrength}. ` +
    `${strategyAdvice[strategy]}. Volatility: ${volatility} - ${volatilityAdvice[volatility]}`;
}

/**
 * Get simple regime score for signal filtering
 * Returns: 1 = bullish, 0 = neutral, -1 = bearish
 */
export function getRegimeBias(candles: NormalizedOHLCV[]): number {
  const result = detectMarketRegime(candles);
  if (!result) return 0;

  if (result.regime === 'strong-bull' || result.regime === 'bull') {
    return 1;
  } else if (result.regime === 'strong-bear' || result.regime === 'bear') {
    return -1;
  }
  return 0;
}

/**
 * Check if market conditions favor taking long trades
 */
export function isLongFavorable(candles: NormalizedOHLCV[]): boolean {
  const result = detectMarketRegime(candles);
  if (!result) return true; // Default to allowing trades

  return result.regime !== 'strong-bear' && result.regime !== 'bear';
}

/**
 * Get position size multiplier based on market regime
 */
export function getRegimePositionMultiplier(candles: NormalizedOHLCV[]): number {
  const result = detectMarketRegime(candles);
  if (!result) return 1.0;

  return result.recommendation.positionSizeAdjustment;
}

export interface MarketRegimeGate {
  allowLongs: boolean;
  positionSizeMultiplier: number; // 0.5 = half size, 1.0 = full size
  warningLevel: 'none' | 'caution' | 'warning' | 'danger';
  reason: string;
  regime: MarketRegime | null;
}

/**
 * Gate function that evaluates whether market conditions are suitable for new long entries.
 *
 * Uses SPY candles to assess the broad market trend. Checks price relative to
 * the 5-day, 20-day, and 50-day EMAs to detect corrections and downtrends.
 * Returns a warning level and recommended position size multiplier so callers
 * can reduce exposure or pause trading in unfavorable conditions.
 */
export function checkMarketRegimeGate(spyCandles: NormalizedOHLCV[]): MarketRegimeGate {
  if (spyCandles.length < 50) {
    return {
      allowLongs: true,
      positionSizeMultiplier: 1.0,
      warningLevel: 'none',
      reason: 'Insufficient SPY data for regime assessment — proceeding with full size',
      regime: null,
    };
  }

  const closes = spyCandles.map(c => c.close);
  const latest = closes[closes.length - 1];

  const ema5Values = ema(closes, 5);
  const ema20Values = ema(closes, 20);
  const ema50Values = ema(closes, 50);

  const ema5 = ema5Values[ema5Values.length - 1];
  const ema20 = ema20Values[ema20Values.length - 1];
  const ema50 = ema50Values[ema50Values.length - 1];

  // 5-day price change as a quick momentum signal
  const price5DaysAgo = closes[closes.length - 6] || closes[0];
  const change5D = ((latest - price5DaysAgo) / price5DaysAgo) * 100;

  const regime = detectMarketRegime(spyCandles);

  // Strong bear / downtrend: SPY below 50-day EMA and falling
  // Still allow intraday mean-reversion trades (gap fade, VWAP) — they don't need a bull regime.
  // Use 0.25× position size to limit exposure during drawdowns.
  if (latest < ema50 && latest < ema20 && change5D < -1.5) {
    return {
      allowLongs: true,
      positionSizeMultiplier: 0.25,
      warningLevel: 'danger',
      reason: `SPY is in a downtrend (below 20- and 50-day EMA, down ${Math.abs(change5D).toFixed(1)}% in 5 days). Trading at 25% position size.`,
      regime: regime?.regime ?? null,
    };
  }

  // Moderate correction: SPY below 20-day EMA
  if (latest < ema20) {
    return {
      allowLongs: true,
      positionSizeMultiplier: 0.5,
      warningLevel: 'warning',
      reason: `SPY is below its 20-day EMA — market in correction. Reduce position sizes to 50% until trend recovers.`,
      regime: regime?.regime ?? null,
    };
  }

  // Mild weakness: SPY below 5-day EMA but above 20-day (short-term pullback)
  if (latest < ema5 && change5D < -0.5) {
    return {
      allowLongs: true,
      positionSizeMultiplier: 0.75,
      warningLevel: 'caution',
      reason: `SPY is in a short-term pullback (below 5-day EMA, down ${Math.abs(change5D).toFixed(1)}% in 5 days). Consider reducing position sizes to 75%.`,
      regime: regime?.regime ?? null,
    };
  }

  // Healthy uptrend
  return {
    allowLongs: true,
    positionSizeMultiplier: 1.0,
    warningLevel: 'none',
    reason: `Market conditions favorable — SPY above 5-, 20-, and 50-day EMAs.`,
    regime: regime?.regime ?? null,
  };
}
