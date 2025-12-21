// src/lib/data/alpaca-data-client.ts

import Alpaca from '@alpacahq/alpaca-trade-api';
import { NormalizedQuote } from '@/types/market';
import { Position, Account, Order } from '@/types/trading';

// Define internal quote interface matching Alpaca's response
interface AlpacaQuoteResponse {
  BidPrice?: number;
  AskPrice?: number;
  BidSize?: number;
  AskSize?: number;
  Timestamp?: string;
  // Alternative field names
  bp?: number;
  ap?: number;
  bs?: number;
  as?: number;
  t?: string;
  v?: number;
}

export class AlpacaDataClient {
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
      paper: true,
      feed: 'iex',  // Free real-time data
    });
  }

  async getLatestQuote(symbol: string): Promise<NormalizedQuote> {
    try {
      const quote = await this.client.getLatestQuote(symbol) as unknown as AlpacaQuoteResponse;
      return this.normalizeQuote(symbol, quote);
    } catch (error) {
      console.error(`Failed to get quote for ${symbol}:`, error);
      throw error;
    }
  }

  async getLatestQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    try {
      const quotesMap = await this.client.getLatestQuotes(symbols) as unknown as Map<string, AlpacaQuoteResponse>;
      return symbols.map(symbol => {
        const quote = quotesMap.get(symbol);
        if (!quote) {
          throw new Error(`No quote returned for ${symbol}`);
        }
        return this.normalizeQuote(symbol, quote);
      });
    } catch (error) {
      console.error('Failed to get batch quotes:', error);
      throw error;
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      const positions = await this.client.getPositions();
      return positions.map((p: Record<string, unknown>) => this.normalizePosition(p));
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

  async getOrders(status: 'open' | 'closed' | 'all' = 'all'): Promise<Order[]> {
    try {
      const orders = await this.client.getOrders({ 
        status,
        until: undefined,
        after: undefined,
        limit: undefined,
        direction: undefined,
        nested: undefined,
        symbols: undefined,
      } as unknown as Parameters<typeof this.client.getOrders>[0]);
      return orders.map((o: Record<string, unknown>) => this.normalizeOrder(o));
    } catch (error) {
      console.error('Failed to get orders:', error);
      throw error;
    }
  }

  private normalizeQuote(symbol: string, quote: AlpacaQuoteResponse): NormalizedQuote {
    // Handle both naming conventions
    const bidPrice = quote.BidPrice ?? quote.bp ?? 0;
    const askPrice = quote.AskPrice ?? quote.ap ?? 0;
    const timestamp = quote.Timestamp ?? quote.t ?? new Date().toISOString();
    const volume = quote.v ?? 0;
    
    return {
      symbol,
      price: (bidPrice + askPrice) / 2,
      bid: bidPrice,
      ask: askPrice,
      volume: volume,
      timestamp: new Date(timestamp),
      source: 'alpaca',
      isRealTime: true,
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
}

export const alpacaDataClient = new AlpacaDataClient();
