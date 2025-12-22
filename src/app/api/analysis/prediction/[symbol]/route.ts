// src/app/api/analysis/prediction/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { generatePrediction } from '@/lib/ai/ml-prediction';
import { dataRouter } from '@/lib/data/data-router';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { analysisCache } from '@/lib/cache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const rateLimitResponse = rateLimitMiddleware(request, 'analysis');
    if (rateLimitResponse) return rateLimitResponse;

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { symbol } = await params;
    
    if (!symbol || symbol.length > 10) {
      return NextResponse.json(
        { error: 'Invalid symbol' },
        { status: 400 }
      );
    }

    const upperSymbol = symbol.toUpperCase();
    const cacheKey = `prediction:${upperSymbol}`;
    
    // Check cache (predictions valid for 1 hour)
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set('X-Cache', 'HIT');
      return addRateLimitHeaders(response, getClientIP(request), 'analysis');
    }

    // Fetch historical data
    const candles = await dataRouter.getHistorical(upperSymbol, '1day', 'full');
    
    if (!candles || candles.length < 200) {
      return NextResponse.json(
        { error: `Insufficient historical data for ${upperSymbol}. Need at least 200 trading days.` },
        { status: 400 }
      );
    }

    // Generate prediction
    const prediction = await generatePrediction(upperSymbol, candles);

    // Cache for 1 hour
    analysisCache.set(cacheKey, prediction, 60 * 60 * 1000);

    const response = NextResponse.json(prediction);
    response.headers.set('X-Cache', 'MISS');
    return addRateLimitHeaders(response, getClientIP(request), 'analysis');
  } catch (error) {
    console.error('Prediction API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Prediction generation failed' },
      { status: 500 }
    );
  }
}
