// src/app/api/trading/orders/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { OrderRequest, BracketOrder } from '@/types/trading';

export async function GET() {
  try {
    const account = await alpacaExecutor.getAccount();
    return NextResponse.json(account);
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
    const body = await request.json();
    
    // Check if it's a bracket order
    if (body.takeProfit && body.stopLoss) {
      const bracketOrder: BracketOrder = {
        entry: body.entry,
        takeProfit: body.takeProfit,
        stopLoss: body.stopLoss,
      };
      const order = await alpacaExecutor.submitBracketOrder(bracketOrder);
      return NextResponse.json(order);
    }
    
    // Regular order
    const orderRequest: OrderRequest = body;
    const order = await alpacaExecutor.submitOrder(orderRequest);
    return NextResponse.json(order);
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
    const searchParams = request.nextUrl.searchParams;
    const orderId = searchParams.get('orderId');
    
    if (orderId) {
      await alpacaExecutor.cancelOrder(orderId);
    } else {
      await alpacaExecutor.cancelAllOrders();
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Orders DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel order(s)' },
      { status: 500 }
    );
  }
}
