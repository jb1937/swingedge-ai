// src/lib/backtest/strategies.ts

import { NormalizedOHLCV } from '@/types/market';
import { ema, rsi, atr, bollingerBands, macd } from '@/lib/analysis/indicators';
import { calculateSignalScore } from '@/lib/analysis/signal-scoring';
import { detectMarketRegime } from '@/lib/analysis/market-regime';
import { calculateTechnicalIndicators } from '@/lib/analysis/technical-analysis';

export type StrategyType = 
  | 'ema_crossover' 
  | 'rsi_mean_reversion' 
  | 'signal_score'
  | 'macd_momentum'
  | 'bollinger_breakout'
  | 'ai_prediction';

export interface Signal {
  type: 'buy' | 'sell' | 'hold';
  strength: number;
  reason?: string;
}

export interface StrategyConfig {
  // EMA Crossover params
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  entryRsiThreshold?: number;
  exitRsiThreshold?: number;
  volumeThreshold?: number;
  
  // RSI Mean Reversion params
  rsiOversold?: number;
  rsiOverbought?: number;
  
  // Signal Score params
  buyScoreThreshold?: number;
  sellScoreThreshold?: number;
  
  // MACD params
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  
  // Bollinger params
  bollingerPeriod?: number;
  bollingerStdDev?: number;
  
  // General
  atrMultiplier?: number;
  minHoldingDays?: number;
  maxHoldingDays?: number;
}

export const STRATEGY_DEFAULTS: Record<StrategyType, StrategyConfig> = {
  ai_prediction: {
    buyScoreThreshold: 60,
    sellScoreThreshold: 45,
    atrMultiplier: 2,
    minHoldingDays: 3,
    maxHoldingDays: 7,
  },
  ema_crossover: {
    emaFastPeriod: 9,
    emaSlowPeriod: 21,
    entryRsiThreshold: 60,
    exitRsiThreshold: 75,
    volumeThreshold: 1.0,
    atrMultiplier: 2,
    minHoldingDays: 2,
    maxHoldingDays: 10,
  },
  rsi_mean_reversion: {
    rsiOversold: 30,
    rsiOverbought: 70,
    emaSlowPeriod: 50,
    atrMultiplier: 1.5,
    minHoldingDays: 1,
    maxHoldingDays: 5,
  },
  signal_score: {
    buyScoreThreshold: 65,
    sellScoreThreshold: 40,
    atrMultiplier: 2,
    minHoldingDays: 3,
    maxHoldingDays: 10,
  },
  macd_momentum: {
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    entryRsiThreshold: 70,
    exitRsiThreshold: 30,
    atrMultiplier: 2,
    minHoldingDays: 2,
    maxHoldingDays: 8,
  },
  bollinger_breakout: {
    bollingerPeriod: 20,
    bollingerStdDev: 2,
    volumeThreshold: 1.5,
    atrMultiplier: 2.5,
    minHoldingDays: 1,
    maxHoldingDays: 7,
  },
};

export const STRATEGY_DESCRIPTIONS: Record<StrategyType, { name: string; description: string }> = {
  ai_prediction: {
    name: 'AI Price Prediction',
    description: 'Uses ML-style multi-factor analysis (technical, trend, sentiment proxy, patterns) to predict 5-day price direction',
  },
  ema_crossover: {
    name: 'EMA Crossover',
    description: 'Buy when fast EMA crosses above slow EMA with RSI and volume confirmation',
  },
  rsi_mean_reversion: {
    name: 'RSI Mean Reversion',
    description: 'Buy oversold conditions (RSI < 30), sell when RSI normalizes or becomes overbought',
  },
  signal_score: {
    name: 'AI Signal Score',
    description: 'Uses comprehensive signal scoring (trend, momentum, volume, structure, context) for entries/exits',
  },
  macd_momentum: {
    name: 'MACD Momentum',
    description: 'Trade MACD crossovers with histogram confirmation and RSI filter',
  },
  bollinger_breakout: {
    name: 'Bollinger Breakout',
    description: 'Enter on breakouts above upper band with volume, exit at middle band or lower band',
  },
};

/**
 * Generate signal based on selected strategy
 */
export function generateStrategySignal(
  candles: NormalizedOHLCV[],
  index: number,
  strategy: StrategyType,
  config: StrategyConfig
): Signal {
  const minBars = Math.max(50, config.emaSlowPeriod || 50);
  if (index < minBars) {
    return { type: 'hold', strength: 0 };
  }

  switch (strategy) {
    case 'ai_prediction':
      return aiPredictionSignal(candles, index, config);
    case 'ema_crossover':
      return emaCrossoverSignal(candles, index, config);
    case 'rsi_mean_reversion':
      return rsiMeanReversionSignal(candles, index, config);
    case 'signal_score':
      return signalScoreSignal(candles, index, config);
    case 'macd_momentum':
      return macdMomentumSignal(candles, index, config);
    case 'bollinger_breakout':
      return bollingerBreakoutSignal(candles, index, config);
    default:
      return { type: 'hold', strength: 0 };
  }
}

function emaCrossoverSignal(candles: NormalizedOHLCV[], index: number, config: StrategyConfig): Signal {
  const closes = candles.slice(0, index + 1).map(c => c.close);
  const volumes = candles.slice(0, index + 1).map(c => c.volume);
  
  const fastEMA = ema(closes, config.emaFastPeriod || 9);
  const slowEMA = ema(closes, config.emaSlowPeriod || 21);
  const rsiValues = rsi(closes, 14);
  
  const currentFastEMA = fastEMA[fastEMA.length - 1];
  const currentSlowEMA = slowEMA[slowEMA.length - 1];
  const prevFastEMA = fastEMA[fastEMA.length - 2];
  const prevSlowEMA = slowEMA[slowEMA.length - 2];
  const currentRSI = rsiValues[rsiValues.length - 1];
  
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = volumes[volumes.length - 1] / avgVolume;
  
  if (
    prevFastEMA <= prevSlowEMA &&
    currentFastEMA > currentSlowEMA &&
    currentRSI < (config.entryRsiThreshold || 60) &&
    volumeRatio >= (config.volumeThreshold || 1.0)
  ) {
    return { type: 'buy', strength: Math.min(1, volumeRatio / 2), reason: 'EMA bullish crossover' };
  }
  
  if (
    (prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA) ||
    currentRSI > (config.exitRsiThreshold || 75)
  ) {
    return { type: 'sell', strength: 1, reason: 'EMA bearish crossover or RSI overbought' };
  }
  
  return { type: 'hold', strength: 0 };
}

function rsiMeanReversionSignal(candles: NormalizedOHLCV[], index: number, config: StrategyConfig): Signal {
  const closes = candles.slice(0, index + 1).map(c => c.close);
  const rsiValues = rsi(closes, 14);
  const emaValues = ema(closes, config.emaSlowPeriod || 50);
  
  const currentRSI = rsiValues[rsiValues.length - 1];
  const currentPrice = closes[closes.length - 1];
  const currentEMA = emaValues[emaValues.length - 1];
  
  // Buy oversold bounces only when above longer-term EMA (trend filter)
  if (currentRSI < (config.rsiOversold || 30) && currentPrice > currentEMA * 0.98) {
    return { type: 'buy', strength: (30 - currentRSI) / 30, reason: `RSI oversold at ${currentRSI.toFixed(0)}` };
  }
  
  // Sell when overbought or RSI normalizes above 50
  if (currentRSI > (config.rsiOverbought || 70)) {
    return { type: 'sell', strength: (currentRSI - 70) / 30, reason: `RSI overbought at ${currentRSI.toFixed(0)}` };
  }
  
  return { type: 'hold', strength: 0 };
}

function signalScoreSignal(candles: NormalizedOHLCV[], index: number, config: StrategyConfig): Signal {
  const slicedCandles = candles.slice(0, index + 1);
  
  // Need at least 200 candles for full analysis
  if (slicedCandles.length < 200) {
    // Fall back to simple EMA crossover for shorter periods
    const closes = slicedCandles.map(c => c.close);
    const fastEMA = ema(closes, 9);
    const slowEMA = ema(closes, 21);
    
    const currentFastEMA = fastEMA[fastEMA.length - 1];
    const currentSlowEMA = slowEMA[slowEMA.length - 1];
    const prevFastEMA = fastEMA[fastEMA.length - 2];
    const prevSlowEMA = slowEMA[slowEMA.length - 2];
    
    if (prevFastEMA <= prevSlowEMA && currentFastEMA > currentSlowEMA) {
      return { type: 'buy', strength: 0.5, reason: 'EMA crossover (insufficient data for signal score)' };
    }
    if (prevFastEMA >= prevSlowEMA && currentFastEMA < currentSlowEMA) {
      return { type: 'sell', strength: 0.5, reason: 'EMA crossunder' };
    }
    return { type: 'hold', strength: 0 };
  }
  
  try {
    const indicators = calculateTechnicalIndicators(slicedCandles);
    if (!indicators) {
      return { type: 'hold', strength: 0 };
    }
    
    const regime = detectMarketRegime(slicedCandles);
    const score = calculateSignalScore(slicedCandles, indicators, regime);
    
    if (!score) {
      return { type: 'hold', strength: 0 };
    }
    
    const buyThreshold = config.buyScoreThreshold || 65;
    const sellThreshold = config.sellScoreThreshold || 40;
    
    if (score.total >= buyThreshold && score.direction === 'long') {
      return { 
        type: 'buy', 
        strength: (score.total - buyThreshold) / (100 - buyThreshold),
        reason: `Signal score ${score.total} (${score.recommendation})`
      };
    }
    
    if (score.total <= sellThreshold || score.direction === 'short') {
      return { 
        type: 'sell', 
        strength: (sellThreshold - score.total) / sellThreshold,
        reason: `Signal score ${score.total} (${score.recommendation})`
      };
    }
  } catch (e) {
    // If signal scoring fails, hold
    return { type: 'hold', strength: 0 };
  }
  
  return { type: 'hold', strength: 0 };
}

function macdMomentumSignal(candles: NormalizedOHLCV[], index: number, config: StrategyConfig): Signal {
  const closes = candles.slice(0, index + 1).map(c => c.close);
  const macdResult = macd(closes, config.macdFast || 12, config.macdSlow || 26, config.macdSignal || 9);
  const rsiValues = rsi(closes, 14);
  
  const currentMACD = macdResult.macd[macdResult.macd.length - 1];
  const currentSignal = macdResult.signal[macdResult.signal.length - 1];
  const prevMACD = macdResult.macd[macdResult.macd.length - 2];
  const prevSignal = macdResult.signal[macdResult.signal.length - 2];
  const currentHistogram = macdResult.histogram[macdResult.histogram.length - 1];
  const prevHistogram = macdResult.histogram[macdResult.histogram.length - 2];
  const currentRSI = rsiValues[rsiValues.length - 1];
  
  // Buy on MACD bullish crossover with histogram increasing
  if (
    prevMACD <= prevSignal &&
    currentMACD > currentSignal &&
    currentHistogram > prevHistogram &&
    currentRSI < (config.entryRsiThreshold || 70)
  ) {
    return { type: 'buy', strength: Math.min(1, Math.abs(currentHistogram) / 0.5), reason: 'MACD bullish crossover' };
  }
  
  // Sell on MACD bearish crossover or RSI oversold bounce complete
  if (
    (prevMACD >= prevSignal && currentMACD < currentSignal) ||
    currentRSI < (config.exitRsiThreshold || 30)
  ) {
    return { type: 'sell', strength: 1, reason: 'MACD bearish crossover' };
  }
  
  return { type: 'hold', strength: 0 };
}

/**
 * AI Prediction Signal - simulates Claude's multi-factor analysis
 * Uses the same factors as the ML prediction engine but without API calls
 */
function aiPredictionSignal(candles: NormalizedOHLCV[], index: number, config: StrategyConfig): Signal {
  const slicedCandles = candles.slice(0, index + 1);
  
  // Need at least 200 candles for full analysis (like the real AI prediction)
  if (slicedCandles.length < 200) {
    return { type: 'hold', strength: 0 };
  }
  
  try {
    const indicators = calculateTechnicalIndicators(slicedCandles);
    if (!indicators) {
      return { type: 'hold', strength: 0 };
    }
    
    const regime = detectMarketRegime(slicedCandles);
    const currentPrice = slicedCandles[slicedCandles.length - 1].close;
    
    // Calculate multi-factor score similar to Claude AI analysis
    let predictionScore = 50; // Start neutral
    const factors: string[] = [];
    
    // 1. Trend Clarity (EMA alignment)
    let trendScore = 0;
    if (currentPrice > indicators.ema9 && indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) {
      trendScore = 25; // Strong uptrend
      factors.push('Strong uptrend');
    } else if (currentPrice > indicators.ema21 && indicators.ema21 > indicators.ema50) {
      trendScore = 15; // Moderate uptrend
      factors.push('Moderate uptrend');
    } else if (currentPrice < indicators.ema9 && indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) {
      trendScore = -25; // Strong downtrend
      factors.push('Strong downtrend');
    } else if (currentPrice < indicators.ema21) {
      trendScore = -10; // Weak/below trend
      factors.push('Below trend');
    }
    predictionScore += trendScore;
    
    // 2. Momentum (RSI + MACD)
    let momentumScore = 0;
    if (indicators.rsi14 < 30) {
      momentumScore += 10; // Oversold - potential bounce
      factors.push('RSI oversold');
    } else if (indicators.rsi14 > 70) {
      momentumScore -= 10; // Overbought - potential pullback
      factors.push('RSI overbought');
    } else if (indicators.rsi14 > 50 && indicators.rsi14 < 65) {
      momentumScore += 5; // Healthy momentum
    }
    
    if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) {
      momentumScore += 10;
      factors.push('MACD bullish');
    } else if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) {
      momentumScore -= 10;
      factors.push('MACD bearish');
    }
    predictionScore += momentumScore;
    
    // 3. Trend Strength (ADX)
    if (indicators.adx > 25) {
      // Strong trend - amplify the trend signal
      if (trendScore > 0) {
        predictionScore += 5;
        factors.push('Strong trend confirmation');
      } else if (trendScore < 0) {
        predictionScore -= 5;
      }
    }
    
    // 4. Volume Confirmation
    const volumes = slicedCandles.map(c => c.volume);
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    
    if (recentVolume > avgVolume * 1.3 && trendScore > 0) {
      predictionScore += 5;
      factors.push('Volume supporting uptrend');
    } else if (recentVolume > avgVolume * 1.3 && trendScore < 0) {
      predictionScore -= 5;
      factors.push('Volume supporting downtrend');
    }
    
    // 5. Market Regime Filter
    if (regime) {
      if (regime.regime === 'strong-bull' || regime.regime === 'bull') {
        predictionScore += 5;
      } else if (regime.regime === 'strong-bear' || regime.regime === 'bear') {
        predictionScore -= 5;
      }
    }
    
    // 6. Pattern Recognition (Higher Highs / Lower Lows)
    const recent = slicedCandles.slice(-10);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    
    let higherHighs = 0;
    let higherLows = 0;
    for (let i = 1; i < recent.length; i++) {
      if (highs[i] > highs[i-1]) higherHighs++;
      if (lows[i] > lows[i-1]) higherLows++;
    }
    
    if (higherHighs >= 6 && higherLows >= 6) {
      predictionScore += 8;
      factors.push('HH/HL pattern');
    } else if (higherHighs <= 3 && higherLows <= 3) {
      predictionScore -= 8;
      factors.push('LH/LL pattern');
    }
    
    // Clamp score
    predictionScore = Math.max(0, Math.min(100, predictionScore));
    
    // Generate signal based on prediction score
    const buyThreshold = config.buyScoreThreshold || 60;
    const sellThreshold = config.sellScoreThreshold || 45;
    
    if (predictionScore >= buyThreshold) {
      return {
        type: 'buy',
        strength: (predictionScore - buyThreshold) / (100 - buyThreshold),
        reason: `AI prediction ${predictionScore}/100: ${factors.slice(0, 2).join(', ')}`
      };
    }
    
    if (predictionScore <= sellThreshold) {
      return {
        type: 'sell',
        strength: (sellThreshold - predictionScore) / sellThreshold,
        reason: `AI prediction ${predictionScore}/100: ${factors.slice(0, 2).join(', ')}`
      };
    }
    
    return { type: 'hold', strength: 0 };
  } catch (e) {
    return { type: 'hold', strength: 0 };
  }
}

function bollingerBreakoutSignal(candles: NormalizedOHLCV[], index: number, config: StrategyConfig): Signal {
  const slice = candles.slice(0, index + 1);
  const closes = slice.map(c => c.close);
  const volumes = slice.map(c => c.volume);
  
  const bb = bollingerBands(closes, config.bollingerPeriod || 20, config.bollingerStdDev || 2);
  
  const currentPrice = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];
  const upperBand = bb.upper[bb.upper.length - 1];
  const middleBand = bb.middle[bb.middle.length - 1];
  const lowerBand = bb.lower[bb.lower.length - 1];
  const prevUpperBand = bb.upper[bb.upper.length - 2];
  
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = volumes[volumes.length - 1] / avgVolume;
  
  // Buy on breakout above upper band with volume
  if (
    prevPrice <= prevUpperBand &&
    currentPrice > upperBand &&
    volumeRatio >= (config.volumeThreshold || 1.5)
  ) {
    return { type: 'buy', strength: volumeRatio / 2, reason: 'Bollinger breakout with volume' };
  }
  
  // Sell at middle band or on breakdown below lower band
  if (currentPrice < middleBand || currentPrice < lowerBand) {
    return { type: 'sell', strength: 1, reason: 'Price returned to middle/lower band' };
  }
  
  return { type: 'hold', strength: 0 };
}
