// src/app/api/analysis/technical/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { 
  calculateTechnicalIndicators,
  calculateTechnicalScore,
  determineSignalDirection,
  TechnicalAnalysisResult,
} from '@/lib/analysis/technical-analysis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const upperSymbol = symbol.toUpperCase();
    
    // Get historical data (need full output for 200 EMA)
    const candles = await dataRouter.getHistorical(upperSymbol, '1day', 'full');
    
    if (!candles || candles.length < 50) {
      return NextResponse.json(
        { error: `Insufficient data for ${upperSymbol}. Need at least 50 data points.` },
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
    
    // Get REAL-TIME price from Alpaca instead of using stale historical close
    const previousCandle = candles[candles.length - 2];
    let latestPrice: number;
    let priceChange: number;
    let priceChangePercent: number;
    
    try {
      // Fetch real-time quote from Alpaca
      const realTimeQuote = await alpacaDataClient.getLatestQuote(upperSymbol);
      latestPrice = realTimeQuote.price;
      
      // Calculate change from previous day's close to current real-time price
      priceChange = latestPrice - previousCandle.close;
      priceChangePercent = (priceChange / previousCandle.close) * 100;
    } catch (quoteError) {
      // Fallback to historical data if real-time quote fails
      console.warn(`Failed to get real-time quote for ${upperSymbol}, using historical data:`, quoteError);
      const latestCandle = candles[candles.length - 1];
      latestPrice = latestCandle.close;
      priceChange = latestCandle.close - previousCandle.close;
      priceChangePercent = (priceChange / previousCandle.close) * 100;
    }
    
    // Calculate score and direction using real-time price
    const technicalScore = calculateTechnicalScore(indicators, latestPrice);
    const signalDirection = determineSignalDirection(indicators, latestPrice);
    
    const result: TechnicalAnalysisResult & {
      technicalScore: number;
      signalDirection: string;
    } = {
      symbol: upperSymbol,
      indicators,
      latestPrice,
      priceChange,
      priceChangePercent,
      technicalScore,
      signalDirection,
      analyzedAt: new Date(),
    };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Technical analysis API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform technical analysis' },
      { status: 500 }
    );
  }
}
