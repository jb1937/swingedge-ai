// src/app/api/analysis/options/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { analyzeOptionsFlow } from '@/lib/analysis/options-flow';
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
    const cacheKey = `options-flow:${upperSymbol}`;
    
    // Check cache (options data valid for 15 minutes during market hours)
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set('X-Cache', 'HIT');
      return addRateLimitHeaders(response, getClientIP(request), 'analysis');
    }

    // Analyze options flow
    const optionsAnalysis = await analyzeOptionsFlow(upperSymbol);

    // Cache for 15 minutes
    analysisCache.set(cacheKey, optionsAnalysis, 15 * 60 * 1000);

    const response = NextResponse.json(optionsAnalysis);
    response.headers.set('X-Cache', 'MISS');
    return addRateLimitHeaders(response, getClientIP(request), 'analysis');
  } catch (error) {
    console.error('Options flow API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Options analysis failed' },
      { status: 500 }
    );
  }
}
