// src/app/api/analysis/technical/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
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
    
    // Get latest price info
    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    const priceChange = latestCandle.close - previousCandle.close;
    const priceChangePercent = (priceChange / previousCandle.close) * 100;
    
    // Calculate score and direction
    const technicalScore = calculateTechnicalScore(indicators, latestCandle.close);
    const signalDirection = determineSignalDirection(indicators, latestCandle.close);
    
    const result: TechnicalAnalysisResult & {
      technicalScore: number;
      signalDirection: string;
    } = {
      symbol: upperSymbol,
      indicators,
      latestPrice: latestCandle.close,
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
