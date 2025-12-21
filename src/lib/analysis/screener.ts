// src/lib/analysis/screener.ts

import { ScreenerFilters, ScreenerResult } from '@/types/analysis';
import { dataRouter } from '@/lib/data/data-router';
import { calculateTechnicalIndicators, calculateTechnicalScore, determineSignalDirection } from './technical-analysis';

// Expanded watchlist of stocks for screening
// S&P 500 major components + popular swing trading candidates
export const DEFAULT_WATCHLIST = [
  // Technology
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 
  'NFLX', 'CRM', 'ADBE', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO',
  'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'NOW', 'PANW',
  'CRWD', 'ZS', 'DDOG', 'SNOW', 'PLTR', 'NET', 'MDB', 'TEAM', 'WDAY',
  'ZM', 'DOCU', 'OKTA', 'SPLK', 'FTNT', 'VEEV',
  
  // Financial Services
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'AXP', 'BLK',
  'SCHW', 'USB', 'PNC', 'TFC', 'COF', 'AIG', 'MET', 'PRU', 'ALL',
  'SPGI', 'MCO', 'ICE', 'CME', 'BK', 'STT', 'TROW',
  
  // Healthcare
  'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD',
  'TMO', 'ABT', 'DHR', 'MDT', 'ISRG', 'SYK', 'ELV', 'CI', 'HUM',
  'CVS', 'WBA', 'MRNA', 'REGN', 'VRTX', 'BIIB', 'ILMN', 'ZTS',
  
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY',
  'PXD', 'DVN', 'HAL', 'BKR', 'FANG', 'HES', 'MRO',
  
  // Consumer
  'DIS', 'CMCSA', 'T', 'VZ', 'CHTR', 'NFLX',
  'HD', 'WMT', 'TGT', 'COST', 'LOW', 'TJX', 'ROST', 'DG', 'DLTR',
  'NKE', 'SBUX', 'MCD', 'YUM', 'CMG', 'DPZ', 'QSR',
  'PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'KMB', 'GIS', 'K', 'MDLZ',
  'STZ', 'TAP', 'BF.B', 'KHC',
  
  // Industrials
  'BA', 'CAT', 'GE', 'MMM', 'UPS', 'FDX', 'HON', 'RTX', 'LMT', 'NOC',
  'DE', 'EMR', 'ITW', 'GD', 'ETN', 'ROK', 'WM', 'RSG', 'NSC', 'UNP',
  'CSX', 'DAL', 'UAL', 'LUV', 'AAL',
  
  // Materials
  'LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'FCX', 'NEM', 'NUE', 'STLD',
  
  // Real Estate
  'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA', 'O', 'DLR', 'WELL', 'AVB',
  
  // Utilities
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'ED', 'WEC',
  
  // Popular Meme/Momentum Stocks
  'GME', 'AMC', 'BBBY', 'SPCE', 'LCID', 'RIVN', 'SOFI', 'HOOD', 'COIN',
  
  // ETFs (commonly traded)
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'ARKK', 'XLF', 'XLE', 'XLK',
];

// Pre-defined sector groups
export const SECTOR_WATCHLISTS = {
  technology: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'CRM', 'ADBE', 'INTC', 'ORCL', 'CSCO', 'QCOM', 'AVGO', 'MU', 'NOW', 'PANW', 'CRWD'],
  financials: ['JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'AXP', 'BLK', 'SCHW', 'USB', 'PNC', 'SPGI', 'MCO', 'ICE', 'CME'],
  healthcare: ['JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'TMO', 'ABT', 'DHR', 'MDT', 'ISRG', 'MRNA', 'REGN', 'VRTX'],
  energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD', 'DVN', 'HAL'],
  consumer: ['HD', 'WMT', 'TGT', 'COST', 'LOW', 'NKE', 'SBUX', 'MCD', 'PG', 'KO', 'PEP', 'DIS'],
  industrials: ['BA', 'CAT', 'GE', 'HON', 'RTX', 'LMT', 'UPS', 'FDX', 'DE', 'UNP', 'CSX'],
  etfs: ['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'ARKK', 'XLF', 'XLE', 'XLK'],
  momentum: ['NVDA', 'AMD', 'TSLA', 'META', 'COIN', 'PLTR', 'SOFI', 'RIVN', 'LCID'],
};

interface ScreenerAnalysis {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  signalStrength: number;
  signalDirection: 'long' | 'short' | 'neutral';
  technicalScore: number;
  rsi: number;
  macdHistogram: number;
  volume: number;
  atr: number;
}

/**
 * Analyze a single symbol for screener
 */
export async function analyzeSymbolForScreener(symbol: string): Promise<ScreenerAnalysis | null> {
  try {
    const candles = await dataRouter.getHistorical(symbol, '1day', 'compact');
    
    if (!candles || candles.length < 50) {
      return null;
    }
    
    const indicators = calculateTechnicalIndicators(candles);
    if (!indicators) return null;
    
    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    const change = latestCandle.close - previousCandle.close;
    const changePercent = (change / previousCandle.close) * 100;
    
    const technicalScore = calculateTechnicalScore(indicators, latestCandle.close);
    const signalDirection = determineSignalDirection(indicators, latestCandle.close);
    
    // Signal strength based on technical score (0-1 scale)
    const signalStrength = technicalScore / 100;
    
    return {
      symbol,
      price: latestCandle.close,
      change,
      changePercent,
      signalStrength,
      signalDirection,
      technicalScore,
      rsi: indicators.rsi14,
      macdHistogram: indicators.macd.histogram,
      volume: latestCandle.volume,
      atr: indicators.atr14,
    };
  } catch (error) {
    console.error(`Failed to analyze ${symbol}:`, error);
    return null;
  }
}

/**
 * Run screener on multiple symbols
 */
export async function runScreener(
  symbols: string[],
  filters: ScreenerFilters
): Promise<ScreenerResult[]> {
  const results: ScreenerResult[] = [];
  
  // Analyze symbols sequentially to respect API rate limits
  for (const symbol of symbols) {
    try {
      const analysis = await analyzeSymbolForScreener(symbol);
      if (!analysis) continue;
      
      // Apply filters
      if (filters.minPrice && analysis.price < filters.minPrice) continue;
      if (filters.maxPrice && analysis.price > filters.maxPrice) continue;
      if (filters.minSignalStrength && analysis.signalStrength < filters.minSignalStrength) continue;
      
      const matchedCriteria: string[] = [];
      
      // Check technical setups
      if (analysis.rsi < 30) matchedCriteria.push('RSI Oversold');
      if (analysis.rsi > 70) matchedCriteria.push('RSI Overbought');
      if (analysis.macdHistogram > 0) matchedCriteria.push('MACD Bullish');
      if (analysis.macdHistogram < 0) matchedCriteria.push('MACD Bearish');
      if (analysis.technicalScore >= 70) matchedCriteria.push('Strong Technical Score');
      if (analysis.signalDirection === 'long') matchedCriteria.push('Bullish Signal');
      if (analysis.signalDirection === 'short') matchedCriteria.push('Bearish Signal');
      
      results.push({
        symbol: analysis.symbol,
        companyName: analysis.symbol, // Would need company data API
        sector: 'Unknown', // Would need sector data
        price: analysis.price,
        change: analysis.change,
        changePercent: analysis.changePercent,
        volume: analysis.volume,
        avgVolume: analysis.volume, // Placeholder
        marketCap: 0, // Would need market cap data
        signalStrength: analysis.signalStrength,
        technicalScore: analysis.technicalScore,
        matchedCriteria,
      });
    } catch (error) {
      console.error(`Error screening ${symbol}:`, error);
    }
  }
  
  // Sort by signal strength (descending)
  results.sort((a, b) => b.signalStrength - a.signalStrength);
  
  return results;
}

/**
 * Get top bullish opportunities
 */
export async function getTopBullish(
  limit: number = 10,
  symbols: string[] = DEFAULT_WATCHLIST
): Promise<ScreenerResult[]> {
  const results = await runScreener(symbols.slice(0, 20), { // Limit to avoid rate limits
    minSignalStrength: 0.5,
  });
  
  return results
    .filter(r => r.matchedCriteria.includes('Bullish Signal') || r.technicalScore >= 60)
    .slice(0, limit);
}

/**
 * Get oversold stocks (potential buying opportunities)
 */
export async function getOversoldStocks(
  symbols: string[] = DEFAULT_WATCHLIST
): Promise<ScreenerResult[]> {
  const results = await runScreener(symbols.slice(0, 15), {});
  
  return results
    .filter(r => r.matchedCriteria.includes('RSI Oversold'))
    .slice(0, 10);
}

/**
 * Parse custom symbols from user input
 */
export function parseCustomSymbols(input: string): string[] {
  // Handle comma-separated, space-separated, or newline-separated input
  return input
    .toUpperCase()
    .split(/[\s,;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 5 && /^[A-Z.]+$/.test(s));
}
