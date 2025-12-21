// src/app/api/trading/positions/route.ts

import { NextResponse } from 'next/server';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';

export async function GET() {
  try {
    const positions = await alpacaExecutor.getPositions();
    return NextResponse.json(positions);
  } catch (error) {
    console.error('Positions API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
