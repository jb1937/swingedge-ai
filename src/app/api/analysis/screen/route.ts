// src/app/api/analysis/screen/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { runScreener, DEFAULT_WATCHLIST } from '@/lib/analysis/screener';
import { ScreenerFilters } from '@/types/analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get all symbols to scan (don't pre-limit)
    const symbols = body.symbols || DEFAULT_WATCHLIST.slice(0, 10);
    // Limit is applied AFTER scanning to return top N results
    const limit = body.limit || symbols.length;
    
    const filters: ScreenerFilters = {
      minPrice: body.minPrice,
      maxPrice: body.maxPrice,
      minSignalStrength: body.minSignalStrength,
      minVolume: body.minVolume,
      sectors: body.sectors,
      technicalSetup: body.technicalSetup,
    };
    
    // Scan all symbols
    const allResults = await runScreener(symbols, filters);
    
    // Apply limit AFTER scanning (results are already sorted by signal strength)
    const results = allResults.slice(0, limit);
    
    return NextResponse.json({
      count: results.length,
      totalScanned: symbols.length,
      totalSuccessful: allResults.length,
      results,
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Screener API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run screener' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const preset = searchParams.get('preset') || 'bullish';
    const limit = parseInt(searchParams.get('limit') || '5');
    
    // Use a small set for quick scanning
    const quickScanSymbols = DEFAULT_WATCHLIST.slice(0, limit);
    
    let filters: ScreenerFilters = {};
    
    switch (preset) {
      case 'bullish':
        filters = { minSignalStrength: 0.5 };
        break;
      case 'oversold':
        filters = {}; // RSI filter handled in post-processing
        break;
      case 'momentum':
        filters = { minSignalStrength: 0.6 };
        break;
      default:
        break;
    }
    
    const results = await runScreener(quickScanSymbols, filters);
    
    return NextResponse.json({
      preset,
      count: results.length,
      results: results.slice(0, limit),
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Screener API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run screener' },
      { status: 500 }
    );
  }
}
