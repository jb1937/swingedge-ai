// src/app/api/trading/orders/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { orderRequestSchema, bracketOrderSchema, symbolSchema } from '@/lib/validation/schemas';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { checkIncomingSymbolCorrelation } from '@/lib/trading/sector-mapping';
import { z } from 'zod';

/**
 * Returns true if the current time is outside regular market hours (9:30–16:00 ET).
 * Buy limit orders placed during pre-market should use 'day' time-in-force so they
 * only fill during regular session, avoiding the poor fills that happen at the open
 * gap when spreads are widest.
 */
function isPreMarketHours(): boolean {
  const now = new Date();
  // Use Intl API with America/New_York to correctly handle DST (UTC-5 winter, UTC-4 summer)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hours = parseInt(parts.find((p) => p.type === 'hour')!.value);
  const minutes = parseInt(parts.find((p) => p.type === 'minute')!.value);
  const etHoursMins = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30;   // 9:30 AM ET
  const marketClose = 16 * 60;       // 4:00 PM ET
  return etHoursMins < marketOpen || etHoursMins >= marketClose;
}

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

    // Determine the symbol and side for pre-order checks
    const incomingSymbol: string = (body.entry?.symbol ?? body.symbol ?? '').toUpperCase();
    const incomingSide: string = body.entry?.side ?? body.side ?? 'buy';

    // --- Correlation check (buy orders only) ---
    if (incomingSide === 'buy' && incomingSymbol) {
      let currentSymbols: string[] = [];
      try {
        const positions = await alpacaExecutor.getPositions();
        currentSymbols = positions.map(p => p.symbol);
      } catch {
        // Non-fatal — skip correlation check if positions can't be fetched
      }
      const correlationResult = checkIncomingSymbolCorrelation(incomingSymbol, currentSymbols);
      if (!correlationResult.allowed) {
        return NextResponse.json(
          { error: correlationResult.message, code: 'CORRELATION_BLOCK', correlationCheck: correlationResult },
          { status: 409 }
        );
      }
    }

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

      // Override timeInForce to 'day' for limit buy orders submitted outside market hours
      // so they only fill during regular session when price discovery is better
      const isLimitBuy = bracketOrder.entry.side === 'buy' && bracketOrder.entry.type === 'limit';
      const effectiveTIF = isLimitBuy && isPreMarketHours() ? 'day' : bracketOrder.entry.timeInForce;

      const order = await alpacaExecutor.submitBracketOrder({
        entry: {
          symbol: bracketOrder.entry.symbol,
          qty: bracketOrder.entry.qty,
          side: bracketOrder.entry.side,
          type: bracketOrder.entry.type,
          timeInForce: effectiveTIF as 'day' | 'gtc' | 'ioc',
          limitPrice: bracketOrder.entry.limitPrice,
          stopPrice: bracketOrder.entry.stopPrice,
          extendedHours: bracketOrder.entry.extendedHours,
        },
        takeProfit: bracketOrder.takeProfit,
        stopLoss: bracketOrder.stopLoss,
      });

      const submittedForNextSession = isLimitBuy && isPreMarketHours();
      const response = NextResponse.json({ ...order, submittedForNextSession });
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

    // Override timeInForce for limit buy orders outside market hours
    const isLimitBuy = orderRequest.side === 'buy' && orderRequest.type === 'limit';
    const effectiveTIF = isLimitBuy && isPreMarketHours() ? 'day' : orderRequest.timeInForce;

    const order = await alpacaExecutor.submitOrder({
      symbol: orderRequest.symbol,
      qty: orderRequest.qty,
      side: orderRequest.side,
      type: orderRequest.type,
      timeInForce: effectiveTIF as 'day' | 'gtc' | 'ioc',
      limitPrice: orderRequest.limitPrice,
      stopPrice: orderRequest.stopPrice,
      extendedHours: orderRequest.extendedHours,
    });

    const submittedForNextSession = isLimitBuy && isPreMarketHours();
    const response = NextResponse.json({ ...order, submittedForNextSession });
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Orders POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit order' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimitResponse = rateLimitMiddleware(request, 'trading');
    if (rateLimitResponse) return rateLimitResponse;

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { orderId, limitPrice, stopPrice, qty } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json(
        { error: 'orderId is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    if (limitPrice === undefined && stopPrice === undefined && qty === undefined) {
      return NextResponse.json(
        { error: 'At least one of limitPrice, stopPrice, or qty is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const order = await alpacaExecutor.replaceOrder(orderId, { limitPrice, stopPrice, qty });
    const response = NextResponse.json(order);
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Orders PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to replace order' },
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
