// src/lib/data/data-router.ts

import { alpacaDataClient } from './alpaca-data-client';
import { alphaVantageClient } from './alpha-vantage-client';
import { NormalizedQuote, NormalizedOHLCV, Timeframe, QuoteContext } from '@/types/market';

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
    // Use Alpaca for real-time on active positions
    if (context.isActivePosition || context.isPendingOrder) {
      return alpacaDataClient.getLatestQuote(symbol);
    }
    
    // Use Alpha Vantage for everything else
    return alphaVantageClient.getQuote(symbol);
  }

  async getBatchQuotes(
    symbols: string[],
    context: Partial<QuoteContext> = {}
  ): Promise<Map<string, NormalizedQuote>> {
    const results = new Map<string, NormalizedQuote>();
    
    // Split symbols by routing
    const alpacaSymbols = symbols.filter(s => this.positionSymbols.has(s));
    const avSymbols = symbols.filter(s => !this.positionSymbols.has(s));
    
    // Fetch in parallel from both sources
    const [alpacaQuotes, avQuotes] = await Promise.all([
      alpacaSymbols.length > 0
        ? alpacaDataClient.getLatestQuotes(alpacaSymbols)
        : Promise.resolve([]),
      avSymbols.length > 0
        ? alphaVantageClient.getBatchQuotes(avSymbols)
        : Promise.resolve([]),
    ]);
    
    // Merge results
    alpacaQuotes.forEach(q => results.set(q.symbol, q));
    avQuotes.forEach(q => results.set(q.symbol, q));
    
    return results;
  }

  async getHistorical(
    symbol: string,
    timeframe: Timeframe,
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<NormalizedOHLCV[]> {
    // Historical data always from Alpha Vantage
    return alphaVantageClient.getHistorical(symbol, timeframe, outputSize);
  }

  isPositionSymbol(symbol: string): boolean {
    return this.positionSymbols.has(symbol);
  }

  getPositionSymbols(): string[] {
    return Array.from(this.positionSymbols);
  }
}

export const dataRouter = new HybridDataRouter();
