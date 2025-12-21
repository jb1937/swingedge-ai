// src/app/api/data/historical/[symbol]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { dataRouter } from '@/lib/data/data-router';
import { Timeframe } from '@/types/market';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const searchParams = request.nextUrl.searchParams;
    
    const timeframe = (searchParams.get('timeframe') || '1day') as Timeframe;
    const outputSize = (searchParams.get('outputSize') || 'compact') as 'compact' | 'full';
    
    const data = await dataRouter.getHistorical(
      symbol.toUpperCase(),
      timeframe,
      outputSize
    );
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Historical API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}
