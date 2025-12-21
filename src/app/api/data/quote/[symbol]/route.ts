// src/app/api/data/quote/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
import { QuoteContext } from '@/types/market';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    
    // Parse context from query params
    const searchParams = request.nextUrl.searchParams;
    const context: QuoteContext = {
      isActivePosition: searchParams.get('position') === 'true',
      isPendingOrder: searchParams.get('pending') === 'true',
      isWatchlist: searchParams.get('watchlist') === 'true',
      isScreening: searchParams.get('screening') === 'true',
    };
    
    const quote = await dataRouter.getQuote(symbol.toUpperCase(), context);
    
    return NextResponse.json(quote);
  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}
