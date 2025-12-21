// src/lib/data/alpha-vantage-client.ts

import { NormalizedQuote, NormalizedOHLCV, Timeframe, AVQuote, AVTimeSeriesData } from '@/types/market';

const AV_BASE_URL = 'https://www.alphavantage.co/query';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class AlphaVantageClient {
  private apiKey: string;
  private requestQueue: Array<() => Promise<unknown>> = [];
  private requestCount = 0;
  private windowStart = Date.now();
  private rateLimitConfig: RateLimitConfig = {
    maxRequests: 75,
    windowMs: 60000,
  };

  constructor() {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY is not set');
    }
    this.apiKey = apiKey;
  }

  private async throttledRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart >= this.rateLimitConfig.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Wait if at limit
    if (this.requestCount >= this.rateLimitConfig.maxRequests) {
      const waitTime = this.rateLimitConfig.windowMs - (now - this.windowStart);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
    return requestFn();
  }

  async getQuote(symbol: string): Promise<NormalizedQuote> {
    return this.throttledRequest(async () => {
      const url = `${AV_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Alpha Vantage API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data['Error Message']) {
        throw new Error(data['Error Message']);
      }

      if (data['Note']) {
        throw new Error('Alpha Vantage rate limit exceeded');
      }

      const quote: AVQuote = data['Global Quote'];
      
      if (!quote || !quote['05. price']) {
        throw new Error(`No quote data for ${symbol}`);
      }

      return this.normalizeQuote(quote);
    });
  }

  async getBatchQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    // Alpha Vantage doesn't have a true batch endpoint for quotes
    // Process in parallel but respect rate limits
    const results: NormalizedQuote[] = [];
    
    for (const symbol of symbols) {
      try {
        const quote = await this.getQuote(symbol);
        results.push(quote);
      } catch (error) {
        console.error(`Failed to fetch quote for ${symbol}:`, error);
      }
    }
    
    return results;
  }

  async getHistorical(
    symbol: string,
    timeframe: Timeframe,
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<NormalizedOHLCV[]> {
    return this.throttledRequest(async () => {
      const functionName = this.getTimeframeFunctionName(timeframe);
      const interval = this.getInterval(timeframe);
      
      let url = `${AV_BASE_URL}?function=${functionName}&symbol=${symbol}&apikey=${this.apiKey}&outputsize=${outputSize}`;
      
      if (interval) {
        url += `&interval=${interval}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Alpha Vantage API error: ${response.status}`);
      }

      const data: AVTimeSeriesData = await response.json();
      
      if (data['Error Message']) {
        throw new Error(data['Error Message'] as unknown as string);
      }

      if (data['Note']) {
        throw new Error('Alpha Vantage rate limit exceeded');
      }

      return this.normalizeTimeSeries(symbol, data, timeframe);
    });
  }

  private getTimeframeFunctionName(timeframe: Timeframe): string {
    switch (timeframe) {
      case '1min':
      case '5min':
      case '15min':
      case '30min':
      case '1hour':
        return 'TIME_SERIES_INTRADAY';
      case '1day':
        return 'TIME_SERIES_DAILY';
      case '1week':
        return 'TIME_SERIES_WEEKLY';
      default:
        return 'TIME_SERIES_DAILY';
    }
  }

  private getInterval(timeframe: Timeframe): string | null {
    switch (timeframe) {
      case '1min':
        return '1min';
      case '5min':
        return '5min';
      case '15min':
        return '15min';
      case '30min':
        return '30min';
      case '1hour':
        return '60min';
      default:
        return null;
    }
  }

  private normalizeQuote(quote: AVQuote): NormalizedQuote {
    const price = parseFloat(quote['05. price']);
    return {
      symbol: quote['01. symbol'],
      price,
      bid: price,  // AV doesn't provide bid/ask
      ask: price,
      volume: parseInt(quote['06. volume']),
      timestamp: new Date(quote['07. latest trading day']),
      source: 'alpha-vantage',
      isRealTime: false,
    };
  }

  private normalizeTimeSeries(
    symbol: string,
    data: AVTimeSeriesData,
    timeframe: Timeframe
  ): NormalizedOHLCV[] {
    const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
    
    if (!timeSeriesKey) {
      throw new Error('Invalid time series data');
    }

    const timeSeries = data[timeSeriesKey] as unknown as Record<string, Record<string, string>>;
    
    return Object.entries(timeSeries).map(([timestamp, values]) => ({
      symbol,
      timestamp: new Date(timestamp),
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume']),
      source: 'alpha-vantage' as const,
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

export const alphaVantageClient = new AlphaVantageClient();
