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
    
    // Generate thesis with Claude using real-time price
    const thesis = await generateTradeThesis({
      symbol,
      currentPrice,
      priceChange,
      priceChangePercent,
      indicators,
      technicalScore,
      signalDirection,
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
