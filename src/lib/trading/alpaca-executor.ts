// src/lib/trading/alpaca-executor.ts

import Alpaca from '@alpacahq/alpaca-trade-api';
import { OrderRequest, BracketOrder, Order, Position, Account } from '@/types/trading';

export class AlpacaExecutor {
  private client: Alpaca;

  constructor() {
    const apiKey = process.env.ALPACA_API_KEY;
    const secretKey = process.env.ALPACA_SECRET_KEY;

    if (!apiKey || !secretKey) {
      throw new Error('Alpaca API credentials not set');
    }

    this.client = new Alpaca({
      keyId: apiKey,
      secretKey: secretKey,
      paper: true,  // Always paper trading
    });
  }

  async submitOrder(order: OrderRequest): Promise<Order> {
    try {
      const result = await this.client.createOrder({
        symbol: order.symbol,
        qty: order.qty,
        side: order.side,
        type: order.type,
        time_in_force: order.timeInForce,
        limit_price: order.limitPrice,
        stop_price: order.stopPrice,
        extended_hours: order.extendedHours,
      });

      return this.normalizeOrder(result as unknown as Record<string, unknown>);
    } catch (error) {
      console.error('Failed to submit order:', error);
      throw error;
    }
  }

  async submitBracketOrder(bracket: BracketOrder): Promise<Order> {
    try {
      const result = await this.client.createOrder({
        symbol: bracket.entry.symbol,
        qty: bracket.entry.qty,
        side: bracket.entry.side,
        type: bracket.entry.type,
        time_in_force: 'gtc',
        order_class: 'bracket',
        limit_price: bracket.entry.limitPrice,
        take_profit: { limit_price: bracket.takeProfit },
        stop_loss: { stop_price: bracket.stopLoss },
      });

      return this.normalizeOrder(result as unknown as Record<string, unknown>);
    } catch (error) {
      console.error('Failed to submit bracket order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.client.cancelOrder(orderId);
    } catch (error) {
      console.error(`Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }

  async cancelAllOrders(): Promise<void> {
    try {
      await this.client.cancelAllOrders();
    } catch (error) {
      console.error('Failed to cancel all orders:', error);
      throw error;
    }
  }

  async closePosition(symbol: string): Promise<Order> {
    try {
      const result = await this.client.closePosition(symbol);
      return this.normalizeOrder(result as unknown as Record<string, unknown>);
    } catch (error) {
      console.error(`Failed to close position for ${symbol}:`, error);
      throw error;
    }
  }

  async closeAllPositions(): Promise<Order[]> {
    try {
      const results = await this.client.closeAllPositions();
      return results.map((r: unknown) => this.normalizeOrder(r as Record<string, unknown>));
    } catch (error) {
      console.error('Failed to close all positions:', error);
      throw error;
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const positions = await this.client.getPositions();
      return positions.map((p: unknown) => this.normalizePosition(p as Record<string, unknown>));
    } catch (error) {
      console.error('Failed to get positions:', error);
      throw error;
    }
  }

  async getAccount(): Promise<Account> {
    try {
      const account = await this.client.getAccount();
      return {
        id: account.id,
        cash: parseFloat(account.cash),
        portfolioValue: parseFloat(account.portfolio_value),
        buyingPower: parseFloat(account.buying_power),
        equity: parseFloat(account.equity),
        lastEquity: parseFloat(account.last_equity),
        dayTradeCount: account.daytrade_count,
        status: account.status,
      };
    } catch (error) {
      console.error('Failed to get account:', error);
      throw error;
    }
  }

  async getOrders(status?: string): Promise<Order[]> {
    try {
      // Fetch open orders by default, or all orders based on status
      const orders = await this.client.getOrders({
        status: status || 'open',  // 'open', 'closed', 'all'
        limit: 500,
        until: undefined,
        after: undefined,
        direction: 'desc',
        nested: true,  // Include child orders (stop loss, take profit)
        symbols: undefined,
      });
      return orders.map((o: unknown) => this.normalizeOrder(o as Record<string, unknown>));
    } catch (error) {
      console.error('Failed to get orders:', error);
      throw error;
    }
  }

  private normalizeOrder(order: Record<string, unknown>): Order {
    return {
      id: order.id as string,
      symbol: order.symbol as string,
      qty: parseInt(order.qty as string),
      side: order.side as 'buy' | 'sell',
      type: order.type as Order['type'],
      status: order.status as Order['status'],
      limitPrice: order.limit_price ? parseFloat(order.limit_price as string) : undefined,
      stopPrice: order.stop_price ? parseFloat(order.stop_price as string) : undefined,
      filledQty: parseInt(order.filled_qty as string),
      filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price as string) : undefined,
      createdAt: new Date(order.created_at as string),
      updatedAt: new Date(order.updated_at as string),
    };
  }

  private normalizePosition(position: Record<string, unknown>): Position {
    return {
      symbol: position.symbol as string,
      qty: parseInt(position.qty as string),
      side: parseInt(position.qty as string) > 0 ? 'long' : 'short',
      avgEntryPrice: parseFloat(position.avg_entry_price as string),
      currentPrice: parseFloat(position.current_price as string),
      marketValue: parseFloat(position.market_value as string),
      unrealizedPL: parseFloat(position.unrealized_pl as string),
      unrealizedPLPercent: parseFloat(position.unrealized_plpc as string) * 100,
      costBasis: parseFloat(position.cost_basis as string),
    };
  }
}

export const alpacaExecutor = new AlpacaExecutor();
