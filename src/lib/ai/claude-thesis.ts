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
}

/**
 * Generate a comprehensive trade thesis using Claude
 */
export async function generateTradeThesis(input: ThesisInput): Promise<TradeThesis> {
  const prompt = buildThesisPrompt(input);
  
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
    
    return parseThesisResponse(input.symbol, input.currentPrice, input.indicators, content.text);
  } catch (error) {
    console.error('Claude API error:', error);
    // Return a fallback thesis based on technical data
    return generateFallbackThesis(input);
  }
}

function buildThesisPrompt(input: ThesisInput): string {
  const { symbol, currentPrice, priceChange, priceChangePercent, indicators, technicalScore, signalDirection } = input;
  
  // Find relevant support/resistance levels for stop and target calculations
  const supportsBelow = indicators.supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = indicators.resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  const supportsAbove = indicators.supportLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  const resistanceBelow = indicators.resistanceLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  
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
  responseText: string
): TradeThesis {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Calculate risk/reward ratio
    const entryPrice = parsed.suggestedEntry || currentPrice;
    const stopLoss = parsed.suggestedStop || (currentPrice - indicators.atr14 * 2);
    const target = parsed.targetPrice || (currentPrice + indicators.atr14 * 3);
    const riskRewardRatio = (target - entryPrice) / (entryPrice - stopLoss);
    
    return {
      symbol,
      thesis: parsed.thesis || 'Technical setup identified.',
      conviction: parsed.conviction || 'medium',
      technicalScore: Math.round((currentPrice > indicators.ema50 ? 60 : 40) + (indicators.rsi14 < 30 ? 20 : indicators.rsi14 > 70 ? -10 : 10)),
      suggestedEntry: entryPrice,
      suggestedStop: stopLoss,
      targetPrice: target,
      holdingPeriod: parsed.holdingPeriod || '3-7 days',
      riskRewardRatio,
      keyRisks: parsed.keyRisks || ['Market volatility', 'Sector rotation'],
      keyCatalysts: parsed.keyCatalysts || ['Technical breakout', 'Momentum continuation'],
      positionSizeRecommendation: parsed.positionSizeRecommendation || 'half',
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Failed to parse Claude response:', error);
    throw error;
  }
}

function generateFallbackThesis(input: ThesisInput): TradeThesis {
  const { symbol, currentPrice, indicators, technicalScore, signalDirection } = input;
  
  // Find relevant support/resistance levels
  const supportsBelow = indicators.supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = indicators.resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  const resistanceBelow = indicators.resistanceLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const supportsAbove = indicators.supportLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  
  const atrBuffer = indicators.atr14 * 0.5;
  
  let suggestedStop: number;
  let targetPrice: number;
  
  if (signalDirection === 'long') {
    // Stop below nearest support (with ATR buffer)
    if (supportsBelow.length > 0) {
      suggestedStop = supportsBelow[0] - atrBuffer;
    } else {
      // Fallback: use ATR-based stop
      suggestedStop = currentPrice - indicators.atr14 * 2;
    }
    
    // Target at next resistance
    if (resistanceAbove.length > 0) {
      targetPrice = resistanceAbove[0];
    } else {
      // Fallback: use upper Bollinger Band or 2x risk
      const risk = currentPrice - suggestedStop;
      targetPrice = Math.max(indicators.bollingerBands.upper, currentPrice + risk * 2);
    }
  } else {
    // Short trade: stop above nearest resistance (with ATR buffer)
    if (resistanceBelow.length > 0 || indicators.resistanceLevels.length > 0) {
      const nearestResistance = resistanceBelow[0] || Math.min(...indicators.resistanceLevels);
      suggestedStop = nearestResistance + atrBuffer;
    } else {
      // Fallback: use ATR-based stop
      suggestedStop = currentPrice + indicators.atr14 * 2;
    }
    
    // Target at next support
    if (supportsBelow.length > 0) {
      targetPrice = supportsBelow[0];
    } else {
      // Fallback: use lower Bollinger Band or 2x risk
      const risk = suggestedStop - currentPrice;
      targetPrice = Math.min(indicators.bollingerBands.lower, currentPrice - risk * 2);
    }
  }
  
  let thesis = '';
  let conviction: 'high' | 'medium' | 'low' = 'medium';
  let positionSize: 'full' | 'half' | 'quarter' | 'avoid' = 'half';
  
  if (signalDirection === 'long' && technicalScore >= 70) {
    thesis = `${symbol} shows strong bullish momentum with price above key EMAs and positive MACD histogram. RSI at ${indicators.rsi14.toFixed(0)} suggests room for upside. Consider entry near current levels with stop below recent support.`;
    conviction = 'high';
    positionSize = 'full';
  } else if (signalDirection === 'long' && indicators.rsi14 < 30) {
    thesis = `${symbol} is oversold with RSI at ${indicators.rsi14.toFixed(0)}, presenting a potential mean reversion opportunity. Wait for confirmation of reversal before entering.`;
    conviction = 'medium';
    positionSize = 'half';
  } else if (signalDirection === 'short') {
    thesis = `${symbol} shows bearish technical structure with price below key EMAs. Consider avoiding long positions until momentum improves.`;
    conviction = 'low';
    positionSize = 'avoid';
  } else {
    thesis = `${symbol} is in a neutral technical position. Wait for clearer directional signals before establishing a position.`;
    conviction = 'low';
    positionSize = 'quarter';
  }
  
  const riskRewardRatio = signalDirection === 'long' 
    ? (targetPrice - currentPrice) / (currentPrice - suggestedStop)
    : (currentPrice - targetPrice) / (suggestedStop - currentPrice);
  
  return {
    symbol,
    thesis,
    conviction,
    technicalScore,
    suggestedEntry: currentPrice,
    suggestedStop,
    targetPrice,
    holdingPeriod: '3-7 days',
    riskRewardRatio: Math.abs(riskRewardRatio),
    keyRisks: [
      'Overall market conditions',
      'Earnings announcements',
      'Sector-specific news',
    ],
    keyCatalysts: [
      signalDirection === 'long' ? 'Break above resistance' : 'Break below support',
      'Volume confirmation',
    ],
    positionSizeRecommendation: positionSize,
    generatedAt: new Date(),
  };
}
