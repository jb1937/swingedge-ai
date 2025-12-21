// src/app/api/trading/account/route.ts

import { NextResponse } from 'next/server';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';

export async function GET() {
  try {
    const account = await alpacaExecutor.getAccount();
    return NextResponse.json(account);
  } catch (error) {
    console.error('Account API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch account' },
      { status: 500 }
    );
  }
}
