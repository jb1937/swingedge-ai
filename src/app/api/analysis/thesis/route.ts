// src/app/api/analysis/thesis/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { 
  calculateTechnicalIndicators,
  calculateTechnicalScore,
  determineSignalDirection,
} from '@/lib/analysis/technical-analysis';
import { generateTradeThesis } from '@/lib/ai/claude-thesis';
import { generatePrediction } from '@/lib/ai/ml-prediction';
import { analysisCache } from '@/lib/cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = body.symbol?.toUpperCase();
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }
    
    // Get historical data
    const candles = await dataRouter.getHistorical(symbol, '1day', 'full');
    
    if (!candles || candles.length < 50) {
      return NextResponse.json(
        { error: `Insufficient data for ${symbol}` },
        { status: 400 }
      );
    }
    
    // Calculate indicators
    const indicators = calculateTechnicalIndicators(candles);
    
    if (!indicators) {
      return NextResponse.json(
        { error: 'Failed to calculate technical indicators' },
        { status: 500 }
      );
    }
    
    // Get REAL-TIME price from Alpaca for consistency with screener and analysis
    const previousCandle = candles[candles.length - 2];
    let currentPrice: number;
    let priceChange: number;
    let priceChangePercent: number;
    
    try {
      // Fetch real-time quote from Alpaca
      const realTimeQuote = await alpacaDataClient.getLatestQuote(symbol);
      currentPrice = realTimeQuote.price;
      
      // Calculate change from previous day's close to current real-time price
      priceChange = currentPrice - previousCandle.close;
      priceChangePercent = (priceChange / previousCandle.close) * 100;
    } catch (quoteError) {
      // Fallback to historical data if real-time quote fails
      console.warn(`Failed to get real-time quote for ${symbol}, using historical data:`, quoteError);
      const latestCandle = candles[candles.length - 1];
      currentPrice = latestCandle.close;
      priceChange = latestCandle.close - previousCandle.close;
      priceChangePercent = (priceChange / previousCandle.close) * 100;
    }
    
    // Use real-time price for score and direction calculations
    const technicalScore = calculateTechnicalScore(indicators, currentPrice);
    const signalDirection = determineSignalDirection(indicators, currentPrice);
    
    // Generate AI prediction first (or use cached version)
    // This prediction will be used to cap the thesis target for realistic expectations
    let prediction: {
      targetPrice: number;
      targetPercent: number;
      confidence: number;
      direction: 'up' | 'down' | 'sideways';
    } | undefined;
    
    // Type for cached prediction data
    interface CachedPrediction {
      prediction: {
        targetPrice: number;
        targetPercent: number;
        confidence: number;
        direction: 'up' | 'down' | 'sideways';
      };
    }
    
    try {
      const cacheKey = `prediction:${symbol}`;
      const cached = analysisCache.get(cacheKey) as CachedPrediction | undefined;
      
      if (cached && cached.prediction) {
        // Use cached prediction
        prediction = {
          targetPrice: cached.prediction.targetPrice,
          targetPercent: cached.prediction.targetPercent,
          confidence: cached.prediction.confidence,
          direction: cached.prediction.direction,
        };
        console.log(`Using cached prediction for ${symbol}: ${prediction.direction} to $${prediction.targetPrice.toFixed(2)}`);
      } else if (candles.length >= 200) {
        // Generate new prediction if we have enough data
        console.log(`Generating AI prediction for ${symbol}...`);
        const predictionResult = await generatePrediction(symbol, candles);
        
        prediction = {
          targetPrice: predictionResult.prediction.targetPrice,
          targetPercent: predictionResult.prediction.targetPercent,
          confidence: predictionResult.prediction.confidence,
          direction: predictionResult.prediction.direction,
        };
        
        // Cache the prediction for 1 hour
        analysisCache.set(cacheKey, predictionResult, 60 * 60 * 1000);
        console.log(`AI prediction for ${symbol}: ${prediction.direction} to $${prediction.targetPrice.toFixed(2)} (${prediction.confidence}% confidence)`);
      } else {
        console.log(`Insufficient data for AI prediction (${candles.length} candles, need 200+), using support/resistance only`);
      }
    } catch (predictionError) {
      // Log error but continue without prediction - thesis will use support/resistance only
      console.warn(`Failed to generate prediction for ${symbol}, using support/resistance only:`, predictionError);
      prediction = undefined;
    }
    
    // Generate thesis with Claude using real-time price AND prediction (if available)
    const thesis = await generateTradeThesis({
      symbol,
      currentPrice,
      priceChange,
      priceChangePercent,
      indicators,
      technicalScore,
      signalDirection,
      prediction,  // Pass prediction to cap targets for realistic expectations
    });
    
    return NextResponse.json(thesis);
  } catch (error) {
    console.error('Thesis API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate thesis' },
      { status: 500 }
    );
  }
}
