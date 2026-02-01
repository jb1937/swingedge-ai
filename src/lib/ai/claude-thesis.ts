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
 * IMPORTANT: Always uses tight ATR-based stops for consistency with screener
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
  const bollingerBands = indicators.bollingerBands;
  const supportLevels = indicators.supportLevels;
  const resistanceLevels = indicators.resistanceLevels;
  
  // Realistic target cap based on ATR (same as screener for consistency)
  // For a 5-day swing trade, 2x ATR is more achievable (~3-5% for most stocks)
  // Previously 3x ATR which resulted in targets rarely being hit
  const realisticTargetCap = currentPrice + (atr * 2);
  const realisticTargetFloor = currentPrice - (atr * 2);
  
  // Tight stop multiplier (1.5x ATR)
  const tightStopMultiplier = 1.5;
  
  // Find relevant support/resistance levels
  const supportsBelow = supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  
  let suggestedStop: number;
  let suggestedTarget: number;
  let targetCapped = false;  // Track if target was capped by any method
  
  // Check if price is near Bollinger Band boundaries (within 1.5%)
  const bbUpperDistance = (bollingerBands.upper - currentPrice) / currentPrice;
  const bbLowerDistance = (currentPrice - bollingerBands.lower) / currentPrice;
  const atResistance = bbUpperDistance < 0.015; // Within 1.5% of upper BB
  const atSupport = bbLowerDistance < 0.015; // Within 1.5% of lower BB
  
  if (signalDirection === 'long' || signalDirection === 'neutral') {
    // Use support-based stop by default (same as screener)
    const atrBuffer = atr * 0.5;
    if (supportsBelow.length > 0) {
      suggestedStop = supportsBelow[0] - atrBuffer;
    } else {
      // Fallback: use ATR-based stop (1.5x ATR for tighter risk management)
      suggestedStop = currentPrice - atr * 1.5;
    }
    
    // Target: Use resistance level if available
    if (resistanceAbove.length > 0) {
      suggestedTarget = resistanceAbove[0];
    } else {
      // No resistance found - use 1.5x risk as target (more achievable)
      const risk = currentPrice - suggestedStop;
      suggestedTarget = currentPrice + risk * 1.5;
    }
    
    // Cap target at realistic ATR-based expectation for 5-day timeframe
    if (suggestedTarget > realisticTargetCap) {
      suggestedTarget = realisticTargetCap;
      targetCapped = true;
    }
    
    // Cap at BB if price is already AT the ceiling (within 2% of upper BB)
    if (atResistance && suggestedTarget > bollingerBands.upper) {
      suggestedTarget = bollingerBands.upper;
      targetCapped = true;
    }
    
    // Edge case: if target is still at or below current price, use 2x risk
    if (suggestedTarget <= currentPrice) {
      const risk = currentPrice - suggestedStop;
      suggestedTarget = Math.min(currentPrice + risk * 2, realisticTargetCap);
    }
    
    // IMPORTANT: When target is capped, also use tighter ATR-based stop
    // This ensures consistent R:R calculation (same as screener)
    if (targetCapped) {
      suggestedStop = currentPrice - (atr * tightStopMultiplier);
    }
  } else {
    // Short trade - use resistance-based stop by default
    const atrBuffer = atr * 0.5;
    if (resistanceAbove.length > 0) {
      suggestedStop = resistanceAbove[0] + atrBuffer;
    } else {
      // Fallback: use ATR-based stop (1.5x ATR for tighter risk management)
      suggestedStop = currentPrice + atr * 1.5;
    }
    
    // Target: Use support level if available
    if (supportsBelow.length > 0) {
      suggestedTarget = supportsBelow[0];
    } else {
      const risk = suggestedStop - currentPrice;
      suggestedTarget = currentPrice - risk * 2;
    }
    
    // Cap target at realistic ATR-based expectation
    if (suggestedTarget < realisticTargetFloor) {
      suggestedTarget = realisticTargetFloor;
      targetCapped = true;
    }
    
    // Floor at BB if price is already at the floor
    if (atSupport && suggestedTarget < bollingerBands.lower) {
      suggestedTarget = bollingerBands.lower;
      targetCapped = true;
    }
    
    // Edge case: if target is still at or above current price, use 2x risk
    if (suggestedTarget >= currentPrice) {
      const risk = suggestedStop - currentPrice;
      suggestedTarget = Math.max(currentPrice - risk * 2, realisticTargetFloor);
    }
    
    // When target is capped, use tighter ATR-based stop
    if (targetCapped) {
      suggestedStop = currentPrice + (atr * tightStopMultiplier);
    }
  }
  
  // Track prediction conflict (for informational purposes only - does NOT affect R:R calculation)
  let signalConflict = false;
  
  // If prediction is provided, only use it to detect signal conflicts for warnings
  // DO NOT use prediction to cap targets - this ensures R:R matches the screener
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
    
    // NOTE: We intentionally do NOT cap targets based on prediction anymore
    // This ensures the R:R calculation matches the screener exactly
    // The prediction info is still available for thesis narrative and warnings
  }
  
  // Calculate risk/reward ratio (recalculate after potential prediction cap)
  const risk = Math.abs(currentPrice - suggestedStop);
  const reward = Math.abs(suggestedTarget - currentPrice);
  const ratio = risk > 0 ? reward / risk : 0;
  
  // Determine trade quality based on R:R
  // Thresholds lowered for swing trading with tighter, achievable targets
  let tradeQuality: 'excellent' | 'good' | 'fair' | 'poor';
  if (ratio >= 2) {
    tradeQuality = 'excellent';
  } else if (ratio >= 1.5) {
    tradeQuality = 'good';
  } else if (ratio >= 1.2) {
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
    targetCappedByPrediction: false, // No longer capping by prediction - R:R matches screener
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
  
  // Pre-calculated levels info for Claude to reference
  const preCalcInfo = `
PRE-CALCULATED TRADE LEVELS (USE THESE EXACT VALUES):
- Entry: $${preCalcLevels.entry.toFixed(2)}
- Stop Loss: $${preCalcLevels.stop.toFixed(2)}
- Target: $${preCalcLevels.target.toFixed(2)}
- Risk/Reward Ratio: ${preCalcLevels.riskRewardRatio.toFixed(2)}:1
- Trade Quality: ${preCalcLevels.tradeQuality.toUpperCase()}
${preCalcLevels.atResistance ? '- ⚠️ Price is near resistance (upper Bollinger Band)' : ''}
${preCalcLevels.atSupport ? '- Price is near support (lower Bollinger Band)' : ''}
${positionGuidance}

IMPORTANT: When mentioning risk/reward ratio in your thesis or keyRisks, you MUST use the exact calculated value of ${preCalcLevels.riskRewardRatio.toFixed(2)}:1. Do NOT make up different ratios.
`;

  return `You are a professional swing trader analyzing ${symbol} for a potential trade. Based on the following technical data, provide a concise trade thesis.
${preCalcInfo}
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

/**
 * Sanitize keyRisks to replace any incorrect R:R mentions with the actual calculated value
 * This ensures consistency between the displayed R:R and any text mentioning it
 */
function sanitizeKeyRisks(keyRisks: string[], actualRR: number): string[] {
  const actualRRStr = actualRR.toFixed(2);
  
  return keyRisks.map(risk => {
    // Pattern to match various R:R formats like "1:4", "1:2", "2:1", "1.5:1", etc.
    // Also matches "risk/reward ratio" or "risk-reward" followed by a ratio
    const rrPatterns = [
      /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:risk[\/\-]?reward|r[\/\-]?r)/gi,
      /(?:risk[\/\-]?reward|r[\/\-]?r)\s*(?:ratio)?\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:ratio)/gi,
      // Match standalone ratios in context of risk/reward discussion
      /unfavorable\s+(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/gi,
      /favorable\s+(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/gi,
    ];
    
    let sanitized = risk;
    for (const pattern of rrPatterns) {
      sanitized = sanitized.replace(pattern, (match) => {
        // Replace the ratio portion with the actual R:R
        return match.replace(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/, `${actualRRStr}:1`);
      });
    }
    
    return sanitized;
  });
}

/**
 * Add R:R-specific risk if trade quality is poor and not already mentioned
 */
function addRRRiskIfNeeded(keyRisks: string[], preCalcLevels: PreCalculatedLevels): string[] {
  if (preCalcLevels.tradeQuality !== 'poor') {
    return keyRisks;
  }
  
  // Check if any risk already mentions R:R
  const hasRRMention = keyRisks.some(risk => 
    /risk[\/\-]?reward|r:r|r\/r|\d+:\d+/i.test(risk)
  );
  
  if (!hasRRMention) {
    // Add a proper R:R risk at the beginning
    const rrRisk = `Unfavorable ${preCalcLevels.riskRewardRatio.toFixed(2)}:1 risk/reward ratio limits upside potential`;
    return [rrRisk, ...keyRisks];
  }
  
  return keyRisks;
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
    
    // Build key risks: sanitize R:R mentions, add conflict warning, add R:R risk if needed
    let keyRisks = parsed.keyRisks || ['Market volatility', 'Sector rotation'];
    
    // Sanitize any incorrect R:R mentions in Claude's response
    keyRisks = sanitizeKeyRisks(keyRisks, preCalcLevels.riskRewardRatio);
    
    // Add R:R risk if poor quality and not already mentioned
    keyRisks = addRRRiskIfNeeded(keyRisks, preCalcLevels);
    
    // Add conflict warning at the top if applicable
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
