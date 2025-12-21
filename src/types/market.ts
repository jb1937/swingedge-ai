// src/types/market.ts

export type DataSource = 'alpaca' | 'alpha-vantage';

export type Timeframe = '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour' | '1day' | '1week';

export interface NormalizedQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
  source: DataSource;
  isRealTime: boolean;
}

export interface NormalizedOHLCV {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: DataSource;
}

export interface QuoteContext {
  isActivePosition: boolean;
  isPendingOrder: boolean;
  isWatchlist: boolean;
  isScreening: boolean;
}

export interface AlpacaQuote {
  S: string;      // Symbol
  bp: number;     // Bid price
  ap: number;     // Ask price
  bs: number;     // Bid size
  as: number;     // Ask size
  t: string;      // Timestamp
  v?: number;     // Volume
}

export interface AVQuote {
  '01. symbol': string;
  '02. open': string;
  '03. high': string;
  '04. low': string;
  '05. price': string;
  '06. volume': string;
  '07. latest trading day': string;
  '08. previous close': string;
  '09. change': string;
  '10. change percent': string;
}

export interface AVTimeSeriesData {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Output Size': string;
    '5. Time Zone': string;
  };
  [key: string]: Record<string, string> | Record<string, string>;
}
