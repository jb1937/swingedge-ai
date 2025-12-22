// src/lib/ai/ml-prediction.ts

import Anthropic from '@anthropic-ai/sdk';
import { NormalizedOHLCV } from '@/types/market';
import { calculateTechnicalIndicators } from '@/lib/analysis/technical-analysis';
import { detectMarketRegime, MarketRegimeResult } from '@/lib/analysis/market-regime';
import { quickSentimentCheck } from './sentiment-analysis';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface PricePrediction {
  symbol: string;
  currentPrice: number;
  
  // 5-day prediction
  prediction: {
    direction: 'up' | 'down' | 'sideways';
    targetPrice: number;
    targetPercent: number;
    confidence: number; // 0-100
    timeframe: '5-day';
  };
  
  // Probability distribution
  probabilities: {
    strongUp: number;   // >5% up
    up: number;         // 2-5% up
    sideways: number;   // -2% to +2%
    down: number;       // 2-5% down
    strongDown: number; // >5% down
  };
  
  // Key factors
  bullishFactors: string[];
  bearishFactors: string[];
  
  // Supporting analysis
  technicalBias: 'bullish' | 'bearish' | 'neutral';
  sentimentBias: 'bullish' | 'bearish' | 'neutral';
  regimeFavorable: boolean;
  
  // Model confidence factors
  confidenceFactors: {
    trendClarity: number;      // How clear is the trend
    patternRecognition: number; // Pattern strength
    indicatorAlignment: number; // How aligned are indicators
    volumeConfirmation: number; // Volume supporting move
  };
  
  // Recommendation
  recommendation: string;
  riskLevel: 'low' | 'medium' | 'high';
  
  lastUpdated: Date;
}

/**
 * Generate ML-style price prediction using Claude
 */
export async function generatePrediction(
  symbol: string,
  candles: NormalizedOHLCV[]
): Promise<PricePrediction> {
  // Need at least 200 candles for good analysis
  if (candles.length < 50) {
    throw new Error('Insufficient historical data for prediction');
  }
  
  const currentPrice = candles[candles.length - 1].close;
  
  // Calculate all technical indicators
  const indicators = calculateTechnicalIndicators(candles);
  
  // Detect market regime
  const regime = detectMarketRegime(candles);
  
  // Get sentiment (quick check, no Claude call)
  const sentimentData = await quickSentimentCheck(symbol).catch(() => ({
    score: 50,
    direction: 'neutral' as const,
    articlesThisWeek: 0,
  }));
  
  // Extract key price patterns
  const patterns = extractPricePatterns(candles);
  
  // Use Claude for sophisticated analysis (handle null indicators/regime)
  if (!indicators || !regime) {
    throw new Error('Unable to calculate indicators');
  }
  
  const claudePrediction = await analyzeWithClaude(
    symbol,
    currentPrice,
    candles.slice(-50), // Last 50 candles for recent context
    indicators,
    regime,
    sentimentData,
    patterns
  );
  
  // Determine technical bias
  const technicalBias = indicators.ema9 > indicators.ema21 && indicators.macd.histogram > 0
    ? 'bullish'
    : indicators.ema9 < indicators.ema21 && indicators.macd.histogram < 0
    ? 'bearish'
    : 'neutral';
  
  const sentimentBias = sentimentData.direction;
  
  // Check if regime is favorable for trading
  const regimeFavorable = regime.momentum.trending || 
    (regime.volatility.level === 'high' && indicators.adx > 25);
  
  return {
    symbol: symbol.toUpperCase(),
    currentPrice,
    prediction: {
      direction: claudePrediction.direction,
      targetPrice: claudePrediction.targetPrice,
      targetPercent: ((claudePrediction.targetPrice - currentPrice) / currentPrice) * 100,
      confidence: claudePrediction.confidence,
      timeframe: '5-day',
    },
    probabilities: claudePrediction.probabilities,
    bullishFactors: claudePrediction.bullishFactors,
    bearishFactors: claudePrediction.bearishFactors,
    technicalBias,
    sentimentBias,
    regimeFavorable,
    confidenceFactors: claudePrediction.confidenceFactors,
    recommendation: claudePrediction.recommendation,
    riskLevel: claudePrediction.confidence >= 70 ? 'low' : 
               claudePrediction.confidence >= 50 ? 'medium' : 'high',
    lastUpdated: new Date(),
  };
}

interface PricePattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
}

function extractPricePatterns(candles: NormalizedOHLCV[]): PricePattern[] {
  const patterns: PricePattern[] = [];
  const recent = candles.slice(-20);
  
  // Higher highs and higher lows (uptrend)
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  
  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;
  
  for (let i = 1; i < recent.length; i++) {
    if (highs[i] > highs[i-1]) higherHighs++;
    else if (highs[i] < highs[i-1]) lowerHighs++;
    if (lows[i] > lows[i-1]) higherLows++;
    else if (lows[i] < lows[i-1]) lowerLows++;
  }
  
  if (higherHighs > lowerHighs && higherLows > lowerLows) {
    patterns.push({
      name: 'Uptrend (HH/HL)',
      type: 'bullish',
      strength: (higherHighs + higherLows) / (recent.length * 2),
    });
  } else if (lowerHighs > higherHighs && lowerLows > higherLows) {
    patterns.push({
      name: 'Downtrend (LH/LL)',
      type: 'bearish',
      strength: (lowerHighs + lowerLows) / (recent.length * 2),
    });
  }
  
  // Check for consolidation (tight range)
  const priceRange = Math.max(...recent.map(c => c.high)) - Math.min(...recent.map(c => c.low));
  const avgPrice = recent.reduce((sum, c) => sum + c.close, 0) / recent.length;
  const rangePercent = (priceRange / avgPrice) * 100;
  
  if (rangePercent < 5) {
    patterns.push({
      name: 'Consolidation',
      type: 'neutral',
      strength: 1 - (rangePercent / 5),
    });
  }
  
  // Volume trend
  const volumes = recent.map(c => c.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  
  if (recentVolume > avgVolume * 1.5) {
    const lastCandle = recent[recent.length - 1];
    patterns.push({
      name: 'Volume Surge',
      type: lastCandle.close > lastCandle.open ? 'bullish' : 'bearish',
      strength: Math.min(1, recentVolume / avgVolume - 1),
    });
  }
  
  return patterns;
}

// Define indicator types inline since not exported
interface IndicatorData {
  ema9: number;
  ema21: number;
  ema50: number;
  rsi14: number;
  macd: { macd: number; signal: number; histogram: number };
  adx: number;
  atr14: number;
  bollingerBands: { upper: number; lower: number };
}

interface ClaudePredictionResult {
  direction: 'up' | 'down' | 'sideways';
  targetPrice: number;
  confidence: number;
  probabilities: {
    strongUp: number;
    up: number;
    sideways: number;
    down: number;
    strongDown: number;
  };
  bullishFactors: string[];
  bearishFactors: string[];
  confidenceFactors: {
    trendClarity: number;
    patternRecognition: number;
    indicatorAlignment: number;
    volumeConfirmation: number;
  };
  recommendation: string;
}

async function analyzeWithClaude(
  symbol: string,
  currentPrice: number,
  recentCandles: NormalizedOHLCV[],
  indicators: IndicatorData,
  regime: MarketRegimeResult,
  sentiment: { score: number; direction: string; articlesThisWeek: number },
  patterns: PricePattern[]
): Promise<ClaudePredictionResult> {
  // Format recent price action
  const priceAction = recentCandles.slice(-10).map(c => ({
    date: new Date(c.timestamp).toISOString().split('T')[0],
    o: c.open.toFixed(2),
    h: c.high.toFixed(2),
    l: c.low.toFixed(2),
    c: c.close.toFixed(2),
    vol: (c.volume / 1000000).toFixed(2) + 'M',
  }));
  
  const prompt = `You are a quantitative analyst. Predict the 5-day price direction for ${symbol} stock.

Current Price: $${currentPrice.toFixed(2)}

Recent Price Action (last 10 days):
${priceAction.map(p => `${p.date}: O:${p.o} H:${p.h} L:${p.l} C:${p.c} Vol:${p.vol}`).join('\n')}

Technical Indicators:
- EMA 9: ${indicators.ema9.toFixed(2)} (${currentPrice > indicators.ema9 ? 'above' : 'below'})
- EMA 21: ${indicators.ema21.toFixed(2)} (${currentPrice > indicators.ema21 ? 'above' : 'below'})
- EMA 50: ${indicators.ema50.toFixed(2)} (${currentPrice > indicators.ema50 ? 'above' : 'below'})
- RSI(14): ${indicators.rsi14.toFixed(1)} (${indicators.rsi14 < 30 ? 'oversold' : indicators.rsi14 > 70 ? 'overbought' : 'neutral'})
- MACD: ${indicators.macd.macd.toFixed(3)}, Signal: ${indicators.macd.signal.toFixed(3)}, Histogram: ${indicators.macd.histogram.toFixed(3)}
- ADX: ${indicators.adx.toFixed(1)} (${indicators.adx > 25 ? 'strong trend' : 'weak trend'})
- ATR: ${indicators.atr14.toFixed(2)} (${(indicators.atr14 / currentPrice * 100).toFixed(1)}% of price)
- Bollinger: Upper ${indicators.bollingerBands.upper.toFixed(2)}, Lower ${indicators.bollingerBands.lower.toFixed(2)}

Market Regime:
- Regime: ${regime.regime}
- Trend: ${regime.trend.direction} (${regime.trend.strength})
- Volatility: ${regime.volatility.level} (ATR: ${regime.volatility.atrPercent.toFixed(2)}%)
- Recommendation: ${regime.recommendation.strategy} strategy, ${regime.recommendation.bias} bias

Detected Patterns:
${patterns.length > 0 ? patterns.map(p => `- ${p.name} (${p.type}, strength: ${(p.strength * 100).toFixed(0)}%)`).join('\n') : '- No strong patterns detected'}

News Sentiment: ${sentiment.direction} (score: ${sentiment.score}/100, ${sentiment.articlesThisWeek} articles)

Based on all this data, provide a 5-day price prediction in JSON format:
{
  "direction": "<up|down|sideways>",
  "targetPrice": <predicted price in 5 days>,
  "confidence": <0-100 confidence level>,
  "probabilities": {
    "strongUp": <probability of >5% gain>,
    "up": <probability of 2-5% gain>,
    "sideways": <probability of -2% to +2%>,
    "down": <probability of 2-5% loss>,
    "strongDown": <probability of >5% loss>
  },
  "bullishFactors": ["<up to 3 key bullish factors>"],
  "bearishFactors": ["<up to 3 key bearish factors>"],
  "confidenceFactors": {
    "trendClarity": <0-100>,
    "patternRecognition": <0-100>,
    "indicatorAlignment": <0-100>,
    "volumeConfirmation": <0-100>
  },
  "recommendation": "<1 sentence trade recommendation>"
}

Important:
- Be realistic - most 5-day moves are within ±5%
- Probabilities must sum to 100
- Higher confidence only when multiple indicators align
- Consider both technical and sentiment factors`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    return JSON.parse(jsonMatch[0]) as ClaudePredictionResult;
  } catch (error) {
    console.error('Claude prediction error:', error);
    
    // Return conservative default prediction
    const technicalBias = indicators.ema9 > indicators.ema21 ? 'up' : 
                          indicators.ema9 < indicators.ema21 ? 'down' : 'sideways';
    
    return {
      direction: technicalBias,
      targetPrice: currentPrice * (technicalBias === 'up' ? 1.02 : technicalBias === 'down' ? 0.98 : 1),
      confidence: 40,
      probabilities: { strongUp: 10, up: 25, sideways: 30, down: 25, strongDown: 10 },
      bullishFactors: ['Analysis unavailable'],
      bearishFactors: ['Analysis unavailable'],
      confidenceFactors: {
        trendClarity: 50,
        patternRecognition: 50,
        indicatorAlignment: 50,
        volumeConfirmation: 50,
      },
      recommendation: 'Insufficient data for reliable prediction',
    };
  }
}
