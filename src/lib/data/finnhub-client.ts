// src/lib/data/finnhub-client.ts

export interface FinnhubNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export interface FinnhubSentiment {
  buzz: {
    articlesInLastWeek: number;
    weeklyAverage: number;
    buzz: number;
  };
  companyNewsScore: number;
  sectorAverageBullishPercent: number;
  sectorAverageNewsScore: number;
  sentiment: {
    bearishPercent: number;
    bullishPercent: number;
  };
  symbol: string;
}

export interface FinnhubBasicFinancials {
  metric: {
    '52WeekHigh': number;
    '52WeekLow': number;
    '52WeekHighDate': string;
    '52WeekLowDate': string;
    'beta': number;
    'peBasicExclExtraTTM': number;
    'peTTM': number;
    'dividendYieldIndicatedAnnual': number;
    'epsBasicExclExtraItemsTTM': number;
    'marketCapitalization': number;
    [key: string]: number | string;
  };
  symbol: string;
}

export interface FinnhubInsiderTransaction {
  name: string;
  share: number;
  change: number;
  filingDate: string;
  transactionDate: string;
  transactionPrice: number;
  transactionCode: string;
}

export interface FinnhubRecommendation {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const BASE_URL = 'https://finnhub.io/api/v1';

async function finnhubFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.append('token', FINNHUB_API_KEY);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

export const finnhubClient = {
  /**
   * Get company news for a symbol
   */
  async getCompanyNews(symbol: string, daysBack: number = 7): Promise<FinnhubNews[]> {
    const to = new Date();
    const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    
    return finnhubFetch<FinnhubNews[]>('/company-news', {
      symbol: symbol.toUpperCase(),
      from: fromStr,
      to: toStr,
    });
  },
  
  /**
   * Get market news (general)
   */
  async getMarketNews(category: string = 'general'): Promise<FinnhubNews[]> {
    return finnhubFetch<FinnhubNews[]>('/news', {
      category,
    });
  },
  
  /**
   * Get news sentiment and social buzz
   */
  async getNewsSentiment(symbol: string): Promise<FinnhubSentiment> {
    return finnhubFetch<FinnhubSentiment>('/news-sentiment', {
      symbol: symbol.toUpperCase(),
    });
  },
  
  /**
   * Get basic financials (52-week high/low, PE, etc.)
   */
  async getBasicFinancials(symbol: string): Promise<FinnhubBasicFinancials> {
    return finnhubFetch<FinnhubBasicFinancials>('/stock/metric', {
      symbol: symbol.toUpperCase(),
      metric: 'all',
    });
  },
  
  /**
   * Get insider transactions
   */
  async getInsiderTransactions(symbol: string): Promise<{ data: FinnhubInsiderTransaction[] }> {
    return finnhubFetch<{ data: FinnhubInsiderTransaction[] }>('/stock/insider-transactions', {
      symbol: symbol.toUpperCase(),
    });
  },
  
  /**
   * Get analyst recommendations
   */
  async getRecommendations(symbol: string): Promise<FinnhubRecommendation[]> {
    return finnhubFetch<FinnhubRecommendation[]>('/stock/recommendation', {
      symbol: symbol.toUpperCase(),
    });
  },
  
  /**
   * Get earnings calendar
   */
  async getEarningsCalendar(from?: string, to?: string): Promise<{ earningsCalendar: Array<{
    date: string;
    epsActual: number | null;
    epsEstimate: number | null;
    hour: string;
    quarter: number;
    revenueActual: number | null;
    revenueEstimate: number | null;
    symbol: string;
    year: number;
  }> }> {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    
    return finnhubFetch('/calendar/earnings', params);
  },
  
  /**
   * Get quote (real-time price)
   */
  async getQuote(symbol: string): Promise<{
    c: number;  // Current price
    d: number;  // Change
    dp: number; // Percent change
    h: number;  // High
    l: number;  // Low
    o: number;  // Open
    pc: number; // Previous close
    t: number;  // Timestamp
  }> {
    return finnhubFetch('/quote', {
      symbol: symbol.toUpperCase(),
    });
  },

  /**
   * Get options chain for a symbol
   */
  async getOptionsChain(symbol: string): Promise<{
    code: string;
    expirationDate: string;
    data: Array<{
      contractName: string;
      contractSymbol: string;
      expirationDate: string;
      strike: number;
      lastPrice: number;
      bid: number;
      ask: number;
      change: number;
      percentChange: number;
      volume: number;
      openInterest: number;
      impliedVolatility: number;
      inTheMoney: boolean;
      optionType: 'call' | 'put';
    }>;
  }> {
    return finnhubFetch('/stock/option-chain', {
      symbol: symbol.toUpperCase(),
    });
  },
  
  /**
   * Get aggregate options sentiment
   */
  async getOptionsSentiment(symbol: string): Promise<{
    symbol: string;
    data: Array<{
      date: string;
      callVolume: number;
      putVolume: number;
      callOpenInterest: number;
      putOpenInterest: number;
      pcRatio: number;
    }>;
  }> {
    return finnhubFetch('/stock/option-sentiment', {
      symbol: symbol.toUpperCase(),
    });
  },
};

export default finnhubClient;
