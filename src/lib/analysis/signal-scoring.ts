// src/lib/analysis/signal-scoring.ts

import { NormalizedOHLCV } from '@/types/market';
import { TechnicalIndicators } from '@/types/analysis';
import { detectMarketRegime, MarketRegimeResult } from './market-regime';
import { calculateTechnicalIndicators } from './technical-analysis';

export interface SignalScoreComponents {
  trend: number;        // 0-25 (EMA alignment, weekly bias)
  momentum: number;     // 0-20 (RSI, MACD, rate of change)
  volume: number;       // 0-15 (volume confirmation, OBV trend)
  structure: number;    // 0-15 (support/resistance proximity)
  context: number;      // 0-15 (market regime, volatility)
  relative: number;     // 0-10 (vs SPY benchmark if available)
}

export interface SignalScore {
  total: number;         // 0-100
  components: SignalScoreComponents;
  confidence: 'high' | 'medium' | 'low';
  recommendation: 'strong-buy' | 'buy' | 'hold' | 'sell' | 'strong-sell';
  direction: 'long' | 'short' | 'neutral';
  reasons: string[];
  risks: string[];
}

/**
 * Calculate comprehensive signal score for a stock
 */
export function calculateSignalScore(
  candles: NormalizedOHLCV[],
  indicators?: TechnicalIndicators,
  marketRegime?: MarketRegimeResult | null,
  spyCandles?: NormalizedOHLCV[]
): SignalScore | null {
  if (candles.length < 50) {
    return null;
  }

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const latestPrice = closes[closes.length - 1];
  const latestVolume = volumes[volumes.length - 1];

  // Calculate indicators if not provided
  const ind = indicators || calculateTechnicalIndicators(candles);
  if (!ind) return null;

  // Get market regime if not provided
  const regime = marketRegime !== undefined ? marketRegime : 
    candles.length >= 200 ? detectMarketRegime(candles) : null;

  const components: SignalScoreComponents = {
    trend: 0,
    momentum: 0,
    volume: 0,
    structure: 0,
    context: 0,
    relative: 0,
  };

  const reasons: string[] = [];
  const risks: string[] = [];

  // ==================== TREND SCORE (0-25) ====================
  // Price vs EMAs
  if (latestPrice > ind.ema9) { components.trend += 3; reasons.push('Price above EMA9'); }
  if (latestPrice > ind.ema21) { components.trend += 4; reasons.push('Price above EMA21'); }
  if (latestPrice > ind.ema50) { components.trend += 5; reasons.push('Price above EMA50'); }
  if (latestPrice > ind.ema200) { components.trend += 5; reasons.push('Price above EMA200'); }
  
  // EMA alignment (bullish stack)
  if (ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50) {
    components.trend += 5;
    reasons.push('Bullish EMA alignment');
  }
  
  // Golden cross bonus
  if (ind.ema50 > ind.ema200) {
    components.trend += 3;
    reasons.push('Golden cross (50 > 200 EMA)');
  } else {
    risks.push('Below 200 EMA - bearish long-term');
  }

  // ==================== MOMENTUM SCORE (0-20) ====================
  // RSI
  if (ind.rsi14 >= 30 && ind.rsi14 <= 50) {
    components.momentum += 6;
    reasons.push(`RSI ${ind.rsi14.toFixed(0)} - good entry zone`);
  } else if (ind.rsi14 > 50 && ind.rsi14 <= 70) {
    components.momentum += 4;
  } else if (ind.rsi14 < 30) {
    components.momentum += 5;
    reasons.push('RSI oversold - potential bounce');
  } else {
    risks.push('RSI overbought - caution');
  }

  // MACD
  if (ind.macd.histogram > 0) {
    components.momentum += 5;
    if (ind.macd.macd > ind.macd.signal) {
      reasons.push('MACD bullish crossover');
    }
  }
  
  // MACD momentum increasing
  const macdIncreasing = ind.macd.histogram > 0;
  if (macdIncreasing) {
    components.momentum += 3;
  }

  // ADX trend strength
  if (ind.adx > 25) {
    components.momentum += 4;
    reasons.push(`Strong trend (ADX ${ind.adx.toFixed(0)})`);
  } else if (ind.adx > 20) {
    components.momentum += 2;
  }

  // Rate of change (5-day momentum)
  const price5DaysAgo = closes[closes.length - 6] || closes[0];
  const roc5 = ((latestPrice - price5DaysAgo) / price5DaysAgo) * 100;
  if (roc5 > 0 && roc5 < 5) {
    components.momentum += 2;
  }

  // ==================== VOLUME SCORE (0-15) ====================
  // Volume vs average
  const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = latestVolume / avgVolume20;

  if (volumeRatio >= 1.5) {
    components.volume += 8;
    reasons.push('High volume confirmation');
  } else if (volumeRatio >= 1.0) {
    components.volume += 5;
  } else {
    components.volume += 2;
    risks.push('Below average volume');
  }

  // OBV trend (simplified)
  const obvTrend = ind.obv > 0;
  if (obvTrend) {
    components.volume += 4;
  }

  // Volume increasing on up days
  const recentUpDays = candles.slice(-5).filter((c, i, arr) => 
    i > 0 && c.close > arr[i-1].close
  );
  if (recentUpDays.length >= 3) {
    components.volume += 3;
    reasons.push('Buying pressure increasing');
  }

  // ==================== STRUCTURE SCORE (0-15) ====================
  // Support/Resistance proximity
  const nearSupport = ind.supportLevels.some(s => 
    latestPrice >= s * 0.98 && latestPrice <= s * 1.02
  );
  const nearResistance = ind.resistanceLevels.some(r => 
    latestPrice >= r * 0.98 && latestPrice <= r * 1.02
  );

  if (nearSupport) {
    components.structure += 8;
    reasons.push('Near support level');
  }
  
  if (nearResistance) {
    components.structure -= 3;
    risks.push('Near resistance - potential reversal');
  } else {
    components.structure += 4;
  }

  // Bollinger Band position
  const bbPosition = (latestPrice - ind.bollingerBands.lower) / 
    (ind.bollingerBands.upper - ind.bollingerBands.lower);
  
  if (bbPosition < 0.3) {
    components.structure += 5;
    reasons.push('Near lower Bollinger Band');
  } else if (bbPosition > 0.8) {
    risks.push('Near upper Bollinger Band');
  } else {
    components.structure += 3;
  }

  // ==================== CONTEXT SCORE (0-15) ====================
  if (regime) {
    if (regime.regime === 'strong-bull' || regime.regime === 'bull') {
      components.context += 10;
      reasons.push(`Bullish market regime: ${regime.regime}`);
    } else if (regime.regime === 'neutral') {
      components.context += 5;
    } else {
      components.context -= 5;
      risks.push(`Bearish market regime: ${regime.regime}`);
    }

    // Volatility adjustment
    if (regime.volatility.level === 'normal') {
      components.context += 5;
    } else if (regime.volatility.level === 'high') {
      risks.push('High volatility environment');
    }
  } else {
    components.context += 5; // Neutral if no regime data
  }

  // ==================== RELATIVE STRENGTH (0-10) ====================
  // Compare to SPY if available
  if (spyCandles && spyCandles.length >= 20) {
    const spyCloses = spyCandles.map(c => c.close);
    const stockReturn = (latestPrice - closes[closes.length - 20]) / closes[closes.length - 20];
    const spyReturn = (spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 20]) / spyCloses[spyCloses.length - 20];
    
    if (stockReturn > spyReturn * 1.1) {
      components.relative = 10;
      reasons.push('Outperforming SPY');
    } else if (stockReturn > spyReturn) {
      components.relative = 6;
    } else {
      components.relative = 3;
      risks.push('Underperforming market');
    }
  } else {
    components.relative = 5; // Neutral if no benchmark
  }

  // ==================== CALCULATE TOTAL ====================
  const total = Math.max(0, Math.min(100,
    components.trend +
    components.momentum +
    components.volume +
    components.structure +
    components.context +
    components.relative
  ));

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (total >= 70 && risks.length <= 2) {
    confidence = 'high';
  } else if (total >= 50) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Determine recommendation
  let recommendation: SignalScore['recommendation'];
  let direction: SignalScore['direction'];

  if (total >= 75) {
    recommendation = 'strong-buy';
    direction = 'long';
  } else if (total >= 60) {
    recommendation = 'buy';
    direction = 'long';
  } else if (total >= 40) {
    recommendation = 'hold';
    direction = 'neutral';
  } else if (total >= 25) {
    recommendation = 'sell';
    direction = 'short';
  } else {
    recommendation = 'strong-sell';
    direction = 'short';
  }

  return {
    total,
    components,
    confidence,
    recommendation,
    direction,
    reasons: reasons.slice(0, 5),
    risks: risks.slice(0, 3),
  };
}

/**
 * Quick score for screener (faster calculation)
 */
export function calculateQuickScore(
  indicators: TechnicalIndicators,
  currentPrice: number
): number {
  let score = 50;

  // Trend
  if (currentPrice > indicators.ema50) score += 10;
  if (currentPrice > indicators.ema200) score += 10;
  if (indicators.ema9 > indicators.ema21) score += 5;

  // Momentum
  if (indicators.rsi14 < 30) score += 10;
  else if (indicators.rsi14 > 70) score -= 10;
  
  if (indicators.macd.histogram > 0) score += 5;

  // Trend strength
  if (indicators.adx > 25) score += 5;

  return Math.max(0, Math.min(100, score));
}
