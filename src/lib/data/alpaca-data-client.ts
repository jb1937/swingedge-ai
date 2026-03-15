// src/lib/data/alpaca-data-client.ts

import Alpaca from '@alpacahq/alpaca-trade-api';
import { NormalizedQuote, NormalizedOHLCV } from '@/types/market';

// Alpaca v2 bar format returned by getBarsV2
interface AlpacaBarV2 {
  t: string;  // timestamp ISO
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}
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

  /**
   * Get intraday OHLCV bars for a symbol via Alpaca's real-time data feed.
   * Used for intraday signal detection (gap fade, VWAP reversion, ORB).
   * Always returns today's bars from market open onward.
   */
  async getIntradayBars(
    symbol: string,
    timeframe: '1min' | '5min' | '15min' | '30min' | '1hour',
    limit = 80
  ): Promise<NormalizedOHLCV[]> {
    const tfMap: Record<string, string> = {
      '1min': '1Min',
      '5min': '5Min',
      '15min': '15Min',
      '30min': '30Min',
      '1hour': '1Hour',
    };
    const alpacaTimeframe = tfMap[timeframe] ?? '5Min';

    // Start from today midnight UTC to capture all of today's session
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    const bars: NormalizedOHLCV[] = [];
    try {
      const generator = this.client.getBarsV2(symbol, {
        start: start.toISOString(),
        limit,
        timeframe: alpacaTimeframe,
        feed: 'iex',
      });
      for await (const rawBar of generator) {
        const bar = rawBar as unknown as AlpacaBarV2;
        bars.push({
          symbol,
          timestamp: new Date(bar.t),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
          source: 'alpaca',
        });
      }
    } catch (error) {
      console.error(`Failed to get intraday bars for ${symbol}:`, error);
      throw error;
    }
    return bars;
  }

  /**
   * Get historical 5-min (or other intraday) bars for a symbol across a date range.
   * Uses the Alpaca REST API directly (bypasses the SDK which returns empty bars when
   * paper:true routes data requests to the wrong base URL).
   *
   * @param symbol    Ticker symbol
   * @param startDate 'YYYY-MM-DD' — first trading day to include
   * @param endDate   'YYYY-MM-DD' — last trading day to include
   * @param timeframe '1min' | '5min' | '15min' (default '5min')
   */
  async getHistoricalIntradayBars(
    symbol: string,
    startDate: string,
    endDate: string,
    timeframe: '1min' | '5min' | '15min' = '5min',
  ): Promise<NormalizedOHLCV[]> {
    const apiKey = process.env.ALPACA_API_KEY;
    const secretKey = process.env.ALPACA_SECRET_KEY;
    if (!apiKey || !secretKey) return [];

    const tfMap: Record<string, string> = { '1min': '1Min', '5min': '5Min', '15min': '15Min' };
    const alpacaTimeframe = tfMap[timeframe] ?? '5Min';

    const bars: NormalizedOHLCV[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
        url.searchParams.set('timeframe', alpacaTimeframe);
        url.searchParams.set('start', `${startDate}T13:30:00Z`);
        // Use 21:30Z to cover 4 PM ET in both EDT (UTC-4 → 20:00) and EST (UTC-5 → 21:00)
        url.searchParams.set('end', `${endDate}T21:30:00Z`);
        url.searchParams.set('feed', 'iex');  // IEX historical data — free-tier compatible
        url.searchParams.set('limit', '10000');
        if (pageToken) url.searchParams.set('page_token', pageToken);

        const res = await fetch(url.toString(), {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': secretKey,
          },
          signal: AbortSignal.timeout(35000), // 35s per page request
        });

        if (!res.ok) {
          const text = await res.text();
          console.error(`Alpaca bars API ${symbol}: HTTP ${res.status} — ${text}`);
          break; // return bars accumulated so far rather than discarding them
        }

        const data = await res.json() as { bars?: AlpacaBarV2[]; next_page_token?: string | null };
        for (const bar of data.bars ?? []) {
          bars.push({
            symbol,
            timestamp: new Date(bar.t),
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v,
            source: 'alpaca',
          });
        }
        pageToken = data.next_page_token ?? undefined;
      } while (pageToken);

      if (bars.length > 0) {
        console.log(`getHistoricalIntradayBars ${symbol}: ${bars.length} bars (${bars[0].timestamp.toISOString().slice(0, 10)} – ${bars[bars.length - 1].timestamp.toISOString().slice(0, 10)})`);
      } else {
        console.warn(`getHistoricalIntradayBars ${symbol}: 0 bars returned (${startDate} – ${endDate})`);
      }
    } catch (error) {
      console.error(`getHistoricalIntradayBars failed for ${symbol}:`, error);
      return [];
    }
    return bars;
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

  async getRecentNews(symbols: string[], limit = 15): Promise<{ headline: string; symbols: string[] }[]> {
    try {
      const news = await (this.client as unknown as {
        getNews(params: { symbols: string[]; limit: number; sort: string }): Promise<unknown[]>;
      }).getNews({ symbols, limit, sort: 'desc' });
      return news.map((n) => ({
        headline: (n as Record<string, unknown>).headline as string ?? '',
        symbols: (n as Record<string, unknown>).symbols as string[] ?? [],
      }));
    } catch (error) {
      console.error('Failed to get news:', error);
      return [];
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
