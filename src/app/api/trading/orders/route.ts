// src/app/api/trading/orders/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { orderRequestSchema, bracketOrderSchema, symbolSchema } from '@/lib/validation/schemas';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResponse = rateLimitMiddleware(request, 'trading');
    if (rateLimitResponse) return rateLimitResponse;

    // Get session (auth is handled by middleware, but we can get user info here)
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Get status from query params (default to 'open' for pending orders)
    const status = request.nextUrl.searchParams.get('status') || 'open';
    const orders = await alpacaExecutor.getOrders(status);
    
    const response = NextResponse.json(orders);
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Orders GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    
    // Check if it's a bracket order
    if (body.takeProfit !== undefined && body.stopLoss !== undefined) {
      // Validate bracket order
      const validation = bracketOrderSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { 
            error: 'Validation failed', 
            code: 'VALIDATION_ERROR',
            details: validation.error.flatten() 
          },
          { status: 400 }
        );
      }
      
      const bracketOrder = validation.data;
      const order = await alpacaExecutor.submitBracketOrder({
        entry: {
          symbol: bracketOrder.entry.symbol,
          qty: bracketOrder.entry.qty,
          side: bracketOrder.entry.side,
          type: bracketOrder.entry.type,
          timeInForce: bracketOrder.entry.timeInForce,
          limitPrice: bracketOrder.entry.limitPrice,
          stopPrice: bracketOrder.entry.stopPrice,
          extendedHours: bracketOrder.entry.extendedHours,
        },
        takeProfit: bracketOrder.takeProfit,
        stopLoss: bracketOrder.stopLoss,
      });
      
      const response = NextResponse.json(order);
      return addRateLimitHeaders(response, getClientIP(request), 'trading');
    }
    
    // Validate regular order
    const validation = orderRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          code: 'VALIDATION_ERROR',
          details: validation.error.flatten() 
        },
        { status: 400 }
      );
    }
    
    const orderRequest = validation.data;
    const order = await alpacaExecutor.submitOrder({
      symbol: orderRequest.symbol,
      qty: orderRequest.qty,
      side: orderRequest.side,
      type: orderRequest.type,
      timeInForce: orderRequest.timeInForce,
      limitPrice: orderRequest.limitPrice,
      stopPrice: orderRequest.stopPrice,
      extendedHours: orderRequest.extendedHours,
    });
    
    const response = NextResponse.json(order);
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Orders POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit order' },
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
    const orderId = searchParams.get('orderId');
    
    if (orderId) {
      // Validate orderId format (UUID)
      const uuidSchema = z.string().uuid('Invalid order ID format');
      const validation = uuidSchema.safeParse(orderId);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid order ID format', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      
      await alpacaExecutor.cancelOrder(orderId);
    } else {
      await alpacaExecutor.cancelAllOrders();
    }
    
    const response = NextResponse.json({ success: true });
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Orders DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel order(s)' },
      { status: 500 }
    );
  }
}
