// src/app/api/analysis/market-regime/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
import { detectMarketRegime } from '@/lib/analysis/market-regime';
import { calculateSignalScore } from '@/lib/analysis/signal-scoring';
import { calculateTechnicalIndicators } from '@/lib/analysis/technical-analysis';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol')?.toUpperCase() || 'SPY';
    
    // Fetch historical data
    const candles = await dataRouter.getHistorical(symbol, '1day', 'full');
    
    if (!candles || candles.length < 200) {
      return NextResponse.json(
        { error: `Insufficient historical data for ${symbol}. Need at least 200 trading days.` },
        { status: 400 }
      );
    }

    // Calculate market regime
    const regime = detectMarketRegime(candles);
    
    // Calculate technical indicators
    const indicators = calculateTechnicalIndicators(candles);
    
    // Calculate signal score
    const signalScore = indicators ? calculateSignalScore(candles, indicators, regime) : null;
    
    const latestPrice = candles[candles.length - 1].close;
    
    return NextResponse.json({
      symbol,
      price: latestPrice,
      regime,
      signalScore,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Market regime API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze market regime' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbols = body.symbols || ['SPY'];
    
    const results = await Promise.all(
      symbols.slice(0, 10).map(async (symbol: string) => {
        try {
          const candles = await dataRouter.getHistorical(symbol.toUpperCase(), '1day', 'full');
          
          if (!candles || candles.length < 200) {
            return { symbol, error: 'Insufficient data' };
          }

          const regime = detectMarketRegime(candles);
          const indicators = calculateTechnicalIndicators(candles);
          const signalScore = indicators ? calculateSignalScore(candles, indicators, regime) : null;
          
          return {
            symbol: symbol.toUpperCase(),
            price: candles[candles.length - 1].close,
            regime: regime ? {
              type: regime.regime,
              strength: regime.strength,
              trend: regime.trend.direction,
              volatility: regime.volatility.level,
              recommendation: regime.recommendation,
            } : null,
            signalScore: signalScore ? {
              total: signalScore.total,
              confidence: signalScore.confidence,
              recommendation: signalScore.recommendation,
              direction: signalScore.direction,
              reasons: signalScore.reasons,
              risks: signalScore.risks,
            } : null,
          };
        } catch (err) {
          return { symbol, error: 'Analysis failed' };
        }
      })
    );
    
    return NextResponse.json({
      count: results.length,
      results,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Market regime API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze market regimes' },
      { status: 500 }
    );
  }
}
