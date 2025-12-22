// src/lib/data/data-router.ts

import { alpacaDataClient } from './alpaca-data-client';
import { alphaVantageClient } from './alpha-vantage-client';
import { NormalizedQuote, NormalizedOHLCV, Timeframe, QuoteContext } from '@/types/market';
import { 
  quoteCache, 
  historicalCache, 
  cacheKeys, 
  CACHE_TTL,
  withCache 
} from '@/lib/cache';

class HybridDataRouter {
  private positionSymbols: Set<string> = new Set();

  async syncPositions(): Promise<void> {
    try {
      const positions = await alpacaDataClient.getPositions();
      this.positionSymbols = new Set(positions.map(p => p.symbol));
    } catch (error) {
      console.error('Failed to sync positions:', error);
    }
  }

  async getQuote(symbol: string, context: QuoteContext): Promise<NormalizedQuote> {
    const upperSymbol = symbol.toUpperCase();
    const cacheKey = cacheKeys.quote(upperSymbol);
    
    // Determine TTL based on context
    const ttl = context.isActivePosition || context.isPendingOrder 
      ? CACHE_TTL.QUOTE_REALTIME 
      : CACHE_TTL.QUOTE;

    // Check cache first
    const cached = quoteCache.get(cacheKey) as NormalizedQuote | null;
    if (cached) {
      return cached;
    }

    // Fetch fresh data
    let quote: NormalizedQuote;
    
    // Use Alpaca for real-time on active positions
    if (context.isActivePosition || context.isPendingOrder) {
      quote = await alpacaDataClient.getLatestQuote(upperSymbol);
    } else {
      // Use Alpha Vantage for everything else
      quote = await alphaVantageClient.getQuote(upperSymbol);
    }
    
    // Cache the result
    quoteCache.set(cacheKey, quote, ttl);
    
    return quote;
  }

  async getBatchQuotes(
    symbols: string[],
    context: Partial<QuoteContext> = {}
  ): Promise<Map<string, NormalizedQuote>> {
    const results = new Map<string, NormalizedQuote>();
    
    // Check cache for all symbols first
    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const cacheKey = cacheKeys.quote(symbol.toUpperCase());
      const cached = quoteCache.get(cacheKey) as NormalizedQuote | null;
      if (cached) {
        results.set(symbol, cached);
      } else {
        uncachedSymbols.push(symbol);
      }
    }
    
    // If all symbols were cached, return early
    if (uncachedSymbols.length === 0) {
      return results;
    }
    
    // Split symbols by routing
    const alpacaSymbols = uncachedSymbols.filter(s => this.positionSymbols.has(s));
    const avSymbols = uncachedSymbols.filter(s => !this.positionSymbols.has(s));
    
    // Fetch in parallel from both sources
    const [alpacaQuotes, avQuotes] = await Promise.all([
      alpacaSymbols.length > 0
        ? alpacaDataClient.getLatestQuotes(alpacaSymbols)
        : Promise.resolve([]),
      avSymbols.length > 0
        ? alphaVantageClient.getBatchQuotes(avSymbols)
        : Promise.resolve([]),
    ]);
    
    // Cache and merge results
    for (const quote of alpacaQuotes) {
      const cacheKey = cacheKeys.quote(quote.symbol);
      quoteCache.set(cacheKey, quote, CACHE_TTL.QUOTE_REALTIME);
      results.set(quote.symbol, quote);
    }
    
    for (const quote of avQuotes) {
      const cacheKey = cacheKeys.quote(quote.symbol);
      quoteCache.set(cacheKey, quote, CACHE_TTL.QUOTE);
      results.set(quote.symbol, quote);
    }
    
    return results;
  }

  async getHistorical(
    symbol: string,
    timeframe: Timeframe,
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<NormalizedOHLCV[]> {
    const upperSymbol = symbol.toUpperCase();
    const cacheKey = cacheKeys.historical(upperSymbol, timeframe, outputSize);
    
    // Determine TTL based on timeframe
    const ttl = ['1min', '5min', '15min', '30min', '1hour'].includes(timeframe)
      ? CACHE_TTL.HISTORICAL_INTRADAY
      : CACHE_TTL.HISTORICAL_DAILY;

    // Check cache first
    const cached = historicalCache.get(cacheKey) as NormalizedOHLCV[] | null;
    if (cached) {
      return cached;
    }

    // Fetch from Alpha Vantage
    const data = await alphaVantageClient.getHistorical(upperSymbol, timeframe, outputSize);
    
    // Cache the result
    historicalCache.set(cacheKey, data, ttl);
    
    return data;
  }

  isPositionSymbol(symbol: string): boolean {
    return this.positionSymbols.has(symbol);
  }

  getPositionSymbols(): string[] {
    return Array.from(this.positionSymbols);
  }
  
  // Invalidate cache for a specific symbol
  invalidateSymbol(symbol: string): void {
    const upperSymbol = symbol.toUpperCase();
    quoteCache.delete(cacheKeys.quote(upperSymbol));
    // Invalidate all historical timeframes
    for (const tf of ['1min', '5min', '15min', '30min', '1hour', '1day', '1week']) {
      historicalCache.delete(cacheKeys.historical(upperSymbol, tf, 'compact'));
      historicalCache.delete(cacheKeys.historical(upperSymbol, tf, 'full'));
    }
  }
}

export const dataRouter = new HybridDataRouter();
