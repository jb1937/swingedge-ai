// src/lib/ai/claude-thesis.ts

import Anthropic from '@anthropic-ai/sdk';
import { TechnicalIndicators, TradeThesis } from '@/types/analysis';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ThesisInput {
  symbol: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  indicators: TechnicalIndicators;
  technicalScore: number;
  signalDirection: 'long' | 'short' | 'neutral';
  // Optional prediction input to inform target price
  prediction?: {
    targetPrice: number;
    targetPercent: number;
    confidence: number;
    direction: 'up' | 'down' | 'sideways';
  };
}

interface PreCalculatedLevels {
  entry: number;
  stop: number;
  target: number;
  riskRewardRatio: number;
  tradeQuality: 'excellent' | 'good' | 'fair' | 'poor';
  atResistance: boolean;
  atSupport: boolean;
  // Prediction integration
  predictionTarget?: number;
  predictionConfidence?: number;
  predictionDirection?: 'up' | 'down' | 'sideways';
  signalConflict?: boolean;
  targetCappedByPrediction?: boolean;
}

interface PredictionInput {
  targetPrice: number;
  targetPercent: number;
  confidence: number;
  direction: 'up' | 'down' | 'sideways';
}

/**
 * Calculate risk/reward using support/resistance levels
 * When prediction is provided, targets are capped at the prediction price
 * to ensure realistic expectations for the holding period
 */
function calculatePreCalculatedLevels(
  currentPrice: number,
  signalDirection: 'long' | 'short' | 'neutral',
  indicators: TechnicalIndicators,
  prediction?: PredictionInput
): PreCalculatedLevels {
  const atr = indicators.atr14;
  const atrBuffer = atr * 0.5;
  const bollingerBands = indicators.bollingerBands;
  const supportLevels = indicators.supportLevels;
  const resistanceLevels = indicators.resistanceLevels;
  
  // Find relevant support/resistance levels
  const supportsBelow = supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  
  let suggestedStop: number;
  let suggestedTarget: number;
  
  // Check if price is near Bollinger Band boundaries (within 1.5%)
  const bbUpperDistance = (bollingerBands.upper - currentPrice) / currentPrice;
  const bbLowerDistance = (currentPrice - bollingerBands.lower) / currentPrice;
  const atResistance = bbUpperDistance < 0.015; // Within 1.5% of upper BB
  const atSupport = bbLowerDistance < 0.015; // Within 1.5% of lower BB
  
  if (signalDirection === 'long' || signalDirection === 'neutral') {
    // Stop below nearest support (with ATR buffer)
    if (supportsBelow.length > 0) {
      suggestedStop = supportsBelow[0] - atrBuffer;
    } else {
      suggestedStop = currentPrice - atr * 2;
    }
    
    // Target: Prioritize resistance levels, only use BB cap if no resistance found
    // and price is very close to the BB ceiling (within 2%)
    if (resistanceAbove.length > 0) {
      // Use the next resistance level as target
      suggestedTarget = resistanceAbove[0];
    } else {
      // No resistance found - use 2x risk as target OR upper BB (whichever is higher)
      const risk = currentPrice - suggestedStop;
      const riskBasedTarget = currentPrice + risk * 2;
      suggestedTarget = Math.max(riskBasedTarget, bollingerBands.upper);
    }
    
    // Only cap at BB if price is already AT the ceiling (within 2% of upper BB)
    // This prevents recommending entries when there's no room to run
    if (atResistance && suggestedTarget > bollingerBands.upper) {
      // Price is at ceiling - cap target at BB, this will naturally create poor R:R
      suggestedTarget = bollingerBands.upper;
    }
    
    // Edge case: if target is still at or below current price, use 2x risk
    if (suggestedTarget <= currentPrice) {
      const risk = currentPrice - suggestedStop;
      suggestedTarget = currentPrice + risk * 2;
    }
  } else {
    // Short trade
    if (resistanceAbove.length > 0) {
      suggestedStop = resistanceAbove[0] + atrBuffer;
    } else {
      suggestedStop = currentPrice + atr * 2;
    }
    
    // Target: Prioritize support levels, only use BB floor if no support found
    if (supportsBelow.length > 0) {
      suggestedTarget = supportsBelow[0];
    } else {
      const risk = suggestedStop - currentPrice;
      const riskBasedTarget = currentPrice - risk * 2;
      suggestedTarget = Math.min(riskBasedTarget, bollingerBands.lower);
    }
    
    // Only floor at BB if price is already at the floor
    if (atSupport && suggestedTarget < bollingerBands.lower) {
      suggestedTarget = bollingerBands.lower;
    }
    
    // Edge case: if target is still at or above current price, use 2x risk
    if (suggestedTarget >= currentPrice) {
      const risk = suggestedStop - currentPrice;
      suggestedTarget = currentPrice - risk * 2;
    }
  }
  
  // Track if we cap the target based on prediction
  let targetCappedByPrediction = false;
  let signalConflict = false;
  
  // If prediction is provided, use it to cap the target for realistic expectations
  if (prediction) {
    // Detect signal conflict: prediction direction vs signal direction
    const predictionBullish = prediction.direction === 'up';
    const predictionBearish = prediction.direction === 'down';
    const signalBullish = signalDirection === 'long';
    const signalBearish = signalDirection === 'short';
    
    // Conflict occurs when prediction says down but signal says long (or vice versa)
    if ((predictionBearish && signalBullish) || (predictionBullish && signalBearish)) {
      signalConflict = true;
    }
    
    // Cap target at prediction price if prediction is more conservative
    if (signalDirection === 'long' || signalDirection === 'neutral') {
      // For long trades: if prediction target is lower than resistance-based target, cap it
      if (prediction.direction === 'up' && prediction.targetPrice < suggestedTarget && prediction.targetPrice > currentPrice) {
        suggestedTarget = prediction.targetPrice;
        targetCappedByPrediction = true;
      }
      // If prediction says down or sideways, use a very conservative target
      if (prediction.direction === 'down' || prediction.direction === 'sideways') {
        // Use 1x risk as target (conservative) or prediction price, whichever is higher
        const risk = currentPrice - suggestedStop;
        const conservativeTarget = currentPrice + risk;
        suggestedTarget = Math.max(conservativeTarget, prediction.targetPrice);
        targetCappedByPrediction = true;
      }
    } else {
      // For short trades: if prediction target is higher than support-based target, cap it
      if (prediction.direction === 'down' && prediction.targetPrice > suggestedTarget && prediction.targetPrice < currentPrice) {
        suggestedTarget = prediction.targetPrice;
        targetCappedByPrediction = true;
      }
      // If prediction says up or sideways for a short, use conservative target
      if (prediction.direction === 'up' || prediction.direction === 'sideways') {
        const risk = suggestedStop - currentPrice;
        const conservativeTarget = currentPrice - risk;
        suggestedTarget = Math.min(conservativeTarget, prediction.targetPrice);
        targetCappedByPrediction = true;
      }
    }
  }
  
  // Calculate risk/reward ratio (recalculate after potential prediction cap)
  const risk = Math.abs(currentPrice - suggestedStop);
  const reward = Math.abs(suggestedTarget - currentPrice);
  const ratio = risk > 0 ? reward / risk : 0;
  
  // Determine trade quality based on R:R
  let tradeQuality: 'excellent' | 'good' | 'fair' | 'poor';
  if (ratio >= 3) {
    tradeQuality = 'excellent';
  } else if (ratio >= 2) {
    tradeQuality = 'good';
  } else if (ratio >= 1.5) {
    tradeQuality = 'fair';
  } else {
    tradeQuality = 'poor';
  }
  
  // If there's a signal conflict, downgrade trade quality
  if (signalConflict && tradeQuality !== 'poor') {
    // Downgrade by one level due to conflict
    if (tradeQuality === 'excellent') tradeQuality = 'good';
    else if (tradeQuality === 'good') tradeQuality = 'fair';
    else if (tradeQuality === 'fair') tradeQuality = 'poor';
  }
  
  return {
    entry: currentPrice,
    stop: suggestedStop,
    target: suggestedTarget,
    riskRewardRatio: ratio,
    tradeQuality,
    atResistance,
    atSupport,
    // Prediction metadata
    predictionTarget: prediction?.targetPrice,
    predictionConfidence: prediction?.confidence,
    predictionDirection: prediction?.direction,
    signalConflict,
    targetCappedByPrediction,
  };
}

/**
 * Generate a comprehensive trade thesis using Claude
 * Uses PRE-CALCULATED stop/target levels with prediction-based target capping
 * to ensure realistic expectations for the holding period
 */
export async function generateTradeThesis(input: ThesisInput): Promise<TradeThesis> {
  // PRE-CALCULATE levels using support/resistance AND prediction (if available)
  const preCalcLevels = calculatePreCalculatedLevels(
    input.currentPrice,
    input.signalDirection,
    input.indicators,
    input.prediction  // Pass prediction to cap targets
  );
  
  const prompt = buildThesisPrompt(input, preCalcLevels);
  
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    // Extract text content
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    
    // Parse response but USE PRE-CALCULATED levels (not Claude's)
    return parseThesisResponse(input.symbol, input.currentPrice, input.indicators, content.text, preCalcLevels, input.technicalScore);
  } catch (error) {
    console.error('Claude API error:', error);
    // Return a fallback thesis based on technical data
    return generateFallbackThesis(input, preCalcLevels);
  }
}

function buildThesisPrompt(input: ThesisInput, preCalcLevels: PreCalculatedLevels): string {
  const { symbol, currentPrice, priceChange, priceChangePercent, indicators, technicalScore, signalDirection } = input;
  
  // Find relevant support/resistance levels for reference
  const supportsBelow = indicators.supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = indicators.resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  
  // Determine position recommendation based on pre-calculated R:R
  let positionGuidance = '';
  if (preCalcLevels.tradeQuality === 'poor') {
    positionGuidance = `
⚠️ IMPORTANT: The calculated R:R ratio is ${preCalcLevels.riskRewardRatio.toFixed(2)}:1 which is POOR (<1.5:1).
${preCalcLevels.atResistance ? 'Price is near the upper Bollinger Band ceiling with limited upside room.' : ''}
You MUST recommend "avoid" or "quarter" position size. Explain why this is NOT a good entry point right now.
`;
  } else if (preCalcLevels.tradeQuality === 'fair') {
    positionGuidance = `
The calculated R:R ratio is ${preCalcLevels.riskRewardRatio.toFixed(2)}:1 which is FAIR (1.5-2:1).
Consider recommending "half" or "quarter" position size.
`;
  } else if (preCalcLevels.tradeQuality === 'good') {
    positionGuidance = `
The calculated R:R ratio is ${preCalcLevels.riskRewardRatio.toFixed(2)}:1 which is GOOD (2-3:1).
This setup has favorable risk/reward. Consider "half" or "full" position size.
`;
  } else {
    positionGuidance = `
The calculated R:R ratio is ${preCalcLevels.riskRewardRatio.toFixed(2)}:1 which is EXCELLENT (3:1+).
This is an ideal setup with great risk/reward. "Full" position size may be appropriate.
`;
  }
  
  return `You are a professional swing trader analyzing ${symbol} for a potential trade. Based on the following technical data, provide a concise trade thesis.

CURRENT DATA:
- Symbol: ${symbol}
- Price: $${currentPrice.toFixed(2)}
- Day Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)
- Technical Score: ${technicalScore}/100
- Signal Direction: ${signalDirection.toUpperCase()}

TREND INDICATORS:
- EMA 9: $${indicators.ema9.toFixed(2)} (${currentPrice > indicators.ema9 ? 'Above' : 'Below'})
- EMA 21: $${indicators.ema21.toFixed(2)} (${currentPrice > indicators.ema21 ? 'Above' : 'Below'})
- EMA 50: $${indicators.ema50.toFixed(2)} (${currentPrice > indicators.ema50 ? 'Above' : 'Below'})
- EMA 200: $${indicators.ema200.toFixed(2)} (${currentPrice > indicators.ema200 ? 'Above' : 'Below'})
- MACD: ${indicators.macd.macd.toFixed(3)} | Signal: ${indicators.macd.signal.toFixed(3)} | Histogram: ${indicators.macd.histogram.toFixed(3)}
- ADX: ${indicators.adx.toFixed(2)}

MOMENTUM:
- RSI (14): ${indicators.rsi14.toFixed(2)}
- Stochastic RSI: K=${indicators.stochRsi.k.toFixed(2)}, D=${indicators.stochRsi.d.toFixed(2)}
- Williams %R: ${indicators.williamsR.toFixed(2)}
- MFI: ${indicators.mfi.toFixed(2)}

VOLATILITY:
- ATR (14): $${indicators.atr14.toFixed(2)}
- Bollinger Bands: Upper $${indicators.bollingerBands.upper.toFixed(2)} | Middle $${indicators.bollingerBands.middle.toFixed(2)} | Lower $${indicators.bollingerBands.lower.toFixed(2)}

SUPPORT/RESISTANCE (from recent swing highs/lows):
- Support levels below price: ${supportsBelow.length > 0 ? supportsBelow.map(l => '$' + l.toFixed(2)).join(', ') : 'None identified'}
- Resistance levels above price: ${resistanceAbove.length > 0 ? resistanceAbove.map(l => '$' + l.toFixed(2)).join(', ') : 'None identified'}
- All Support: ${indicators.supportLevels.length > 0 ? indicators.supportLevels.map(l => '$' + l.toFixed(2)).join(', ') : 'None identified'}
- All Resistance: ${indicators.resistanceLevels.length > 0 ? indicators.resistanceLevels.map(l => '$' + l.toFixed(2)).join(', ') : 'None identified'}

IMPORTANT - STOP LOSS AND TARGET METHODOLOGY:
You MUST use the support/resistance levels to determine technically appropriate stop loss and target prices:

FOR LONG TRADES:
- Stop Loss: Place BELOW the nearest support level (subtract 0.5x ATR as buffer for noise)
- Target: Use the NEXT SIGNIFICANT RESISTANCE level above current price
- If no clear resistance exists, use 2x the risk distance as target OR upper Bollinger Band

FOR SHORT TRADES:
- Stop Loss: Place ABOVE the nearest resistance level (add 0.5x ATR as buffer)
- Target: Use the NEXT SIGNIFICANT SUPPORT level below current price
- If no clear support exists, use 2x the risk distance as target OR lower Bollinger Band

This approach means:
- Risk/Reward will naturally vary based on actual market structure
- Some setups will have favorable R:R (2:1+), others will not
- Poor R:R is useful information - it means the setup isn't ideal for entry

Please respond in the following JSON format ONLY (no other text):
{
  "thesis": "2-3 sentence summary of the trade setup and reasoning",
  "conviction": "high" | "medium" | "low",
  "suggestedEntry": <price number>,
  "suggestedStop": <price number based on support/resistance methodology above>,
  "targetPrice": <price number based on support/resistance methodology above>,
  "holdingPeriod": "X-Y days",
  "keyRisks": ["risk1", "risk2", "risk3"],
  "keyCatalysts": ["catalyst1", "catalyst2"],
  "positionSizeRecommendation": "full" | "half" | "quarter" | "avoid"
}`;
}

function parseThesisResponse(
  symbol: string,
  currentPrice: number,
  indicators: TechnicalIndicators,
  responseText: string,
  preCalcLevels: PreCalculatedLevels,
  technicalScore: number
): TradeThesis {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // USE PRE-CALCULATED levels (NOT Claude's) for consistency with screener
    // Claude provides thesis text and conviction, but levels are deterministic
    
    // Override position size based on R:R quality
    let positionSize = parsed.positionSizeRecommendation || 'half';
    if (preCalcLevels.tradeQuality === 'poor') {
      positionSize = 'avoid';
    } else if (preCalcLevels.tradeQuality === 'fair' && positionSize === 'full') {
      positionSize = 'half';
    }
    
    // Override conviction based on R:R quality
    let conviction = parsed.conviction || 'medium';
    if (preCalcLevels.tradeQuality === 'poor') {
      conviction = 'low';
    }
    
    // Build key risks, including conflict warning if applicable
    let keyRisks = parsed.keyRisks || ['Market volatility', 'Sector rotation'];
    if (preCalcLevels.signalConflict) {
      keyRisks = ['⚠️ Signal conflict: prediction direction differs from technical signal', ...keyRisks];
    }
    
    return {
      symbol,
      thesis: parsed.thesis || 'Technical setup identified.',
      conviction,
      technicalScore,
      suggestedEntry: preCalcLevels.entry,
      suggestedStop: preCalcLevels.stop,
      targetPrice: preCalcLevels.target,
      holdingPeriod: parsed.holdingPeriod || '3-7 days',
      riskRewardRatio: preCalcLevels.riskRewardRatio,
      keyRisks,
      keyCatalysts: parsed.keyCatalysts || ['Technical breakout', 'Momentum continuation'],
      positionSizeRecommendation: positionSize,
      generatedAt: new Date(),
      // Include prediction metadata
      predictionTarget: preCalcLevels.predictionTarget,
      predictionConfidence: preCalcLevels.predictionConfidence,
      predictionDirection: preCalcLevels.predictionDirection,
      signalConflict: preCalcLevels.signalConflict,
    };
  } catch (error) {
    console.error('Failed to parse Claude response:', error);
    throw error;
  }
}

function generateFallbackThesis(input: ThesisInput, preCalcLevels: PreCalculatedLevels): TradeThesis {
  const { symbol, indicators, technicalScore, signalDirection } = input;
  
  // USE PRE-CALCULATED levels for consistency with screener
  let thesis = '';
  let conviction: 'high' | 'medium' | 'low' = 'medium';
  let positionSize: 'full' | 'half' | 'quarter' | 'avoid' = 'half';
  
  // Determine thesis based on R:R quality and technicals
  if (preCalcLevels.signalConflict) {
    thesis = `${symbol} shows conflicting signals: technical indicators suggest ${signalDirection} but the AI prediction suggests ${preCalcLevels.predictionDirection}. Exercise caution and consider waiting for clearer alignment.`;
    conviction = 'low';
    positionSize = 'avoid';
  } else if (preCalcLevels.tradeQuality === 'poor') {
    thesis = `${symbol} has limited upside potential with an unfavorable risk/reward ratio of ${preCalcLevels.riskRewardRatio.toFixed(2)}:1. ${preCalcLevels.atResistance ? 'Price is near the upper Bollinger Band ceiling. ' : ''}Wait for a pullback to support before considering entry.`;
    conviction = 'low';
    positionSize = 'avoid';
  } else if (signalDirection === 'long' && technicalScore >= 70) {
    thesis = `${symbol} shows strong bullish momentum with price above key EMAs. RSI at ${indicators.rsi14.toFixed(0)} suggests room for upside. Risk/reward ratio of ${preCalcLevels.riskRewardRatio.toFixed(2)}:1 supports entry.`;
    conviction = preCalcLevels.tradeQuality === 'excellent' ? 'high' : 'medium';
    positionSize = preCalcLevels.tradeQuality === 'excellent' ? 'full' : 'half';
  } else if (signalDirection === 'long' && indicators.rsi14 < 30) {
    thesis = `${symbol} is oversold with RSI at ${indicators.rsi14.toFixed(0)}, presenting a potential mean reversion opportunity. R:R of ${preCalcLevels.riskRewardRatio.toFixed(2)}:1.`;
    conviction = 'medium';
    positionSize = 'half';
  } else if (signalDirection === 'short') {
    thesis = `${symbol} shows bearish technical structure with price below key EMAs. Consider avoiding long positions until momentum improves.`;
    conviction = 'low';
    positionSize = 'avoid';
  } else {
    thesis = `${symbol} is in a neutral technical position with R:R of ${preCalcLevels.riskRewardRatio.toFixed(2)}:1. Wait for clearer directional signals before establishing a position.`;
    conviction = 'low';
    positionSize = 'quarter';
  }
  
  // Build key risks, including conflict warning if applicable
  const keyRisks: string[] = [];
  if (preCalcLevels.signalConflict) {
    keyRisks.push('⚠️ Signal conflict: prediction direction differs from technical signal');
  }
  keyRisks.push(
    preCalcLevels.tradeQuality === 'poor' ? 'Poor risk/reward ratio limits upside potential' : 'Overall market conditions',
    'Earnings announcements',
    'Sector-specific news'
  );
  
  return {
    symbol,
    thesis,
    conviction,
    technicalScore,
    suggestedEntry: preCalcLevels.entry,
    suggestedStop: preCalcLevels.stop,
    targetPrice: preCalcLevels.target,
    holdingPeriod: '3-7 days',
    riskRewardRatio: preCalcLevels.riskRewardRatio,
    keyRisks,
    keyCatalysts: [
      signalDirection === 'long' ? 'Break above resistance' : 'Break below support',
      'Volume confirmation',
    ],
    positionSizeRecommendation: positionSize,
    generatedAt: new Date(),
    // Include prediction metadata
    predictionTarget: preCalcLevels.predictionTarget,
    predictionConfidence: preCalcLevels.predictionConfidence,
    predictionDirection: preCalcLevels.predictionDirection,
    signalConflict: preCalcLevels.signalConflict,
  };
}
