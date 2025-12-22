// src/app/api/analysis/sentiment/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { analyzeSentiment, quickSentimentCheck } from '@/lib/ai/sentiment-analysis';
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
    const quick = request.nextUrl.searchParams.get('quick') === 'true';
    
    if (!symbol || symbol.length > 10) {
      return NextResponse.json(
        { error: 'Invalid symbol' },
        { status: 400 }
      );
    }

    const upperSymbol = symbol.toUpperCase();
    const cacheKey = `sentiment:${upperSymbol}:${quick ? 'quick' : 'full'}`;
    
    // Check cache (sentiment valid for 30 minutes)
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set('X-Cache', 'HIT');
      return addRateLimitHeaders(response, getClientIP(request), 'analysis');
    }

    let sentiment;
    if (quick) {
      sentiment = await quickSentimentCheck(upperSymbol);
    } else {
      sentiment = await analyzeSentiment(upperSymbol);
    }

    // Cache for 30 minutes
    analysisCache.set(cacheKey, sentiment, 30 * 60 * 1000);

    const response = NextResponse.json(sentiment);
    response.headers.set('X-Cache', 'MISS');
    return addRateLimitHeaders(response, getClientIP(request), 'analysis');
  } catch (error) {
    console.error('Sentiment API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sentiment analysis failed' },
      { status: 500 }
    );
  }
}
