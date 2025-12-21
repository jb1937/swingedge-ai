// src/app/api/analysis/recommendations/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateScreenerRecommendations } from '@/lib/ai/screener-recommendations';
import { ScreenerResult } from '@/types/analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const results: ScreenerResult[] = body.results;
    const scanType: string = body.scanType || 'General Scan';
    
    if (!results || results.length === 0) {
      return NextResponse.json(
        { error: 'No screening results provided' },
        { status: 400 }
      );
    }
    
    const recommendations = await generateScreenerRecommendations(results, scanType);
    
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('Recommendations API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}
