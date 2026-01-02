// src/app/api/trading/positions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { symbolSchema } from '@/lib/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResponse = rateLimitMiddleware(request, 'trading');
    if (rateLimitResponse) return rateLimitResponse;

    const positions = await alpacaExecutor.getPositions();
    
    const response = NextResponse.json(positions);
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Positions API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResponse = rateLimitMiddleware(request, 'trading');
    if (rateLimitResponse) return rateLimitResponse;

    // Get session
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    
    if (symbol) {
      // Validate symbol format
      const validation = symbolSchema.safeParse(symbol);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid symbol format', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      
      // Close specific position using Alpaca's closePosition API
      const order = await alpacaExecutor.closePosition(validation.data);
      const response = NextResponse.json(order);
      return addRateLimitHeaders(response, getClientIP(request), 'trading');
    } else {
      // Close all positions
      const orders = await alpacaExecutor.closeAllPositions();
      const response = NextResponse.json(orders);
      return addRateLimitHeaders(response, getClientIP(request), 'trading');
    }
  } catch (error) {
    console.error('Position close error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to close position(s)' },
      { status: 500 }
    );
  }
}
