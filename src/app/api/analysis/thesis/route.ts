// src/app/api/analysis/thesis/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
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
    
    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    const priceChange = latestCandle.close - previousCandle.close;
    const priceChangePercent = (priceChange / previousCandle.close) * 100;
    const technicalScore = calculateTechnicalScore(indicators, latestCandle.close);
    const signalDirection = determineSignalDirection(indicators, latestCandle.close);
    
    // Generate thesis with Claude
    const thesis = await generateTradeThesis({
      symbol,
      currentPrice: latestCandle.close,
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
