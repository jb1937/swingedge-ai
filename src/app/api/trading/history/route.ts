// src/app/api/trading/history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { alpacaExecutor } from '@/lib/trading/alpaca-executor';
import { rateLimitMiddleware, getClientIP, addRateLimitHeaders } from '@/lib/rate-limit';
import { Order } from '@/types/trading';

export interface CompletedTrade {
  symbol: string;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  side: 'long' | 'short';
  pnl: number;
  pnlPercent: number;
  holdingDays: number;
  exitReason: 'stop' | 'target' | 'manual';
}

export interface TradeHistoryResponse {
  trades: CompletedTrade[];
  stats: {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    totalPnl: number;
    bestTrade: number;
    worstTrade: number;
    avgHoldingDays: number;
  };
}

/**
 * Reconstruct round-trip trades from filled order history.
 * Matches buy fills to subsequent sell fills for each symbol using FIFO logic.
 */
function reconstructTrades(orders: Order[]): CompletedTrade[] {
  const trades: CompletedTrade[] = [];

  // Only consider filled orders with price data, sorted oldest-first
  const filled = orders
    .filter(o => o.status === 'filled' && o.filledAvgPrice && o.filledQty > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Group by symbol
  const bySymbol: Record<string, Order[]> = {};
  for (const order of filled) {
    if (!bySymbol[order.symbol]) bySymbol[order.symbol] = [];
    bySymbol[order.symbol].push(order);
  }

  for (const [symbol, symbolOrders] of Object.entries(bySymbol)) {
    // Queue of open buy lots: [{ price, qty, date }]
    const buyQueue: Array<{ price: number; qty: number; date: Date }> = [];

    for (const order of symbolOrders) {
      if (order.side === 'buy') {
        buyQueue.push({
          price: order.filledAvgPrice!,
          qty: order.filledQty,
          date: order.createdAt,
        });
      } else {
        // Sell: match against oldest buys (FIFO)
        let remainingSellQty = order.filledQty;
        const sellPrice = order.filledAvgPrice!;
        const sellDate = order.createdAt;

        // Determine exit reason from order type
        const exitReason: 'stop' | 'target' | 'manual' =
          order.type === 'stop' || order.type === 'stop_limit' ? 'stop'
          : order.type === 'limit' ? 'target'
          : 'manual';

        while (remainingSellQty > 0 && buyQueue.length > 0) {
          const buy = buyQueue[0];
          const matchedQty = Math.min(buy.qty, remainingSellQty);

          const pnl = (sellPrice - buy.price) * matchedQty;
          const pnlPercent = ((sellPrice - buy.price) / buy.price) * 100;
          const holdingDays = Math.round(
            (sellDate.getTime() - buy.date.getTime()) / (1000 * 60 * 60 * 24)
          );

          trades.push({
            symbol,
            entryDate: buy.date,
            exitDate: sellDate,
            entryPrice: buy.price,
            exitPrice: sellPrice,
            qty: matchedQty,
            side: 'long',
            pnl,
            pnlPercent,
            holdingDays,
            exitReason,
          });

          buy.qty -= matchedQty;
          remainingSellQty -= matchedQty;
          if (buy.qty === 0) buyQueue.shift();
        }
      }
    }
  }

  // Sort most recent first
  return trades.sort((a, b) => b.exitDate.getTime() - a.exitDate.getTime());
}

function calculateStats(trades: CompletedTrade[]): TradeHistoryResponse['stats'] {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, avgWin: 0, avgLoss: 0,
      profitFactor: 0, totalPnl: 0, bestTrade: 0, worstTrade: 0, avgHoldingDays: 0,
    };
  }

  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl < 0);
  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  return {
    totalTrades: trades.length,
    winRate: (winners.length / trades.length) * 100,
    avgWin: winners.length ? grossProfit / winners.length : 0,
    avgLoss: losers.length ? grossLoss / losers.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    totalPnl: trades.reduce((s, t) => s + t.pnl, 0),
    bestTrade: Math.max(...trades.map(t => t.pnl)),
    worstTrade: Math.min(...trades.map(t => t.pnl)),
    avgHoldingDays: trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = rateLimitMiddleware(request, 'trading');
    if (rateLimitResponse) return rateLimitResponse;

    // Fetch all closed/filled orders from Alpaca
    const orders = await alpacaExecutor.getOrders('all');
    const trades = reconstructTrades(orders);
    const stats = calculateStats(trades);

    const response = NextResponse.json({ trades, stats } satisfies TradeHistoryResponse);
    return addRateLimitHeaders(response, getClientIP(request), 'trading');
  } catch (error) {
    console.error('Trade history error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch trade history' },
      { status: 500 }
    );
  }
}
