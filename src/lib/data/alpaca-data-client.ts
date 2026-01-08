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

// Define internal trade interface matching Alpaca's response
interface AlpacaTradeResponse {
  Price?: number;
  Size?: number;
  Timestamp?: string;
  // Alternative field names (from REST API)
  p?: number;
  s?: number;
  t?: string;
  x?: string; // Exchange
  c?: string[]; // Conditions
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

  /**
   * Get the latest trade price for a symbol
   * This is more reliable than bid/ask quotes from IEX feed
   */
  async getLatestTrade(symbol: string): Promise<{ price: number; size: number; timestamp: Date }> {
    try {
      const trade = await this.client.getLatestTrade(symbol) as unknown as AlpacaTradeResponse;
      const price = trade.Price ?? trade.p ?? 0;
      const size = trade.Size ?? trade.s ?? 0;
      const timestamp = trade.Timestamp ?? trade.t ?? new Date().toISOString();
      
      return {
        price,
        size,
        timestamp: new Date(timestamp),
      };
    } catch (error) {
      console.error(`Failed to get latest trade for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get the latest quote for a symbol
   * Uses trade price as primary source since IEX bid/ask can be unreliable
   * Falls back to bid/ask midpoint if trade data unavailable
   */
  async getLatestQuote(symbol: string): Promise<NormalizedQuote> {
    try {
      // Try to get both trade and quote data
      const [trade, quote] = await Promise.all([
        this.client.getLatestTrade(symbol).catch(() => null) as Promise<AlpacaTradeResponse | null>,
        this.client.getLatestQuote(symbol) as Promise<unknown>
      ]);
      
      const quoteData = quote as AlpacaQuoteResponse;
      
      // Use trade price as primary source (more reliable than IEX bid/ask)
      const tradePrice = trade ? (trade.Price ?? (trade as AlpacaTradeResponse).p ?? 0) : 0;
      
      // Fallback to bid/ask midpoint
      const bidPrice = quoteData.BidPrice ?? quoteData.bp ?? 0;
      const askPrice = quoteData.AskPrice ?? quoteData.ap ?? 0;
      const bidAskMid = (bidPrice + askPrice) / 2;
      
      // Prefer trade price if available and valid
      const price = tradePrice > 0 ? tradePrice : bidAskMid;
      
      const timestamp = quoteData.Timestamp ?? quoteData.t ?? new Date().toISOString();
      const volume = quoteData.v ?? 0;
      
      return {
        symbol,
        price,
        bid: bidPrice,
        ask: askPrice,
        volume: volume,
        timestamp: new Date(timestamp),
        source: 'alpaca',
        isRealTime: true,
      };
    } catch (error) {
      console.error(`Failed to get quote for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get the latest quotes for multiple symbols
   * Uses trade prices as primary source since IEX bid/ask can be unreliable
   */
  async getLatestQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    try {
      // Fetch both trades and quotes for all symbols
      const [tradesMap, quotesMap] = await Promise.all([
        this.client.getLatestTrades(symbols).catch(() => new Map()) as Promise<Map<string, AlpacaTradeResponse>>,
        this.client.getLatestQuotes(symbols) as Promise<unknown>
      ]);
      
      const quotes = quotesMap as Map<string, AlpacaQuoteResponse>;
      
      return symbols.map(symbol => {
        const quote = quotes.get(symbol);
        const trade = tradesMap.get(symbol);
        
        if (!quote) {
          throw new Error(`No quote returned for ${symbol}`);
        }
        
        // Use trade price as primary source (more reliable than IEX bid/ask)
        const tradePrice = trade ? (trade.Price ?? trade.p ?? 0) : 0;
        
        // Fallback to bid/ask midpoint
        const bidPrice = quote.BidPrice ?? quote.bp ?? 0;
        const askPrice = quote.AskPrice ?? quote.ap ?? 0;
        const bidAskMid = (bidPrice + askPrice) / 2;
        
        // Prefer trade price if available and valid
        const price = tradePrice > 0 ? tradePrice : bidAskMid;
        
        const timestamp = quote.Timestamp ?? quote.t ?? new Date().toISOString();
        const volume = quote.v ?? 0;
        
        return {
          symbol,
          price,
          bid: bidPrice,
          ask: askPrice,
          volume: volume,
          timestamp: new Date(timestamp),
          source: 'alpaca' as const,
          isRealTime: true,
        };
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
