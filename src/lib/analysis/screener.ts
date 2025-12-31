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
  // Risk/Reward analysis
  riskRewardRatio: number;
  suggestedEntry: number;
  suggestedStop: number;
  suggestedTarget: number;
  tradeQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Calculate risk/reward ratio based on support/resistance levels
 */
function calculateRiskReward(
  currentPrice: number,
  signalDirection: 'long' | 'short' | 'neutral',
  supportLevels: number[],
  resistanceLevels: number[],
  atr: number,
  bollingerBands: { upper: number; lower: number }
): { entry: number; stop: number; target: number; ratio: number; quality: 'excellent' | 'good' | 'fair' | 'poor' } {
  const atrBuffer = atr * 0.5;
  
  // Find relevant support/resistance levels
  const supportsBelow = supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  const supportsAbove = supportLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  const resistanceBelow = resistanceLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  
  let suggestedStop: number;
  let suggestedTarget: number;
  
  if (signalDirection === 'long' || signalDirection === 'neutral') {
    // Stop below nearest support (with ATR buffer)
    if (supportsBelow.length > 0) {
      suggestedStop = supportsBelow[0] - atrBuffer;
    } else {
      // Fallback: use ATR-based stop
      suggestedStop = currentPrice - atr * 2;
    }
    
    // Target at next resistance
    if (resistanceAbove.length > 0) {
      suggestedTarget = resistanceAbove[0];
    } else {
      // Fallback: use upper Bollinger Band or 2x risk
      const risk = currentPrice - suggestedStop;
      suggestedTarget = Math.max(bollingerBands.upper, currentPrice + risk * 2);
    }
  } else {
    // Short trade: stop above nearest resistance (with ATR buffer)
    if (resistanceAbove.length > 0) {
      suggestedStop = resistanceAbove[0] + atrBuffer;
    } else if (resistanceBelow.length > 0) {
      suggestedStop = resistanceBelow[0] + atrBuffer;
    } else {
      // Fallback: use ATR-based stop
      suggestedStop = currentPrice + atr * 2;
    }
    
    // Target at next support
    if (supportsBelow.length > 0) {
      suggestedTarget = supportsBelow[0];
    } else {
      // Fallback: use lower Bollinger Band or 2x risk
      const risk = suggestedStop - currentPrice;
      suggestedTarget = Math.min(bollingerBands.lower, currentPrice - risk * 2);
    }
  }
  
  // Calculate risk/reward ratio
  const risk = Math.abs(currentPrice - suggestedStop);
  const reward = Math.abs(suggestedTarget - currentPrice);
  const ratio = risk > 0 ? reward / risk : 0;
  
  // Determine trade quality based on R:R
  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  if (ratio >= 3) {
    quality = 'excellent';
  } else if (ratio >= 2) {
    quality = 'good';
  } else if (ratio >= 1.5) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }
  
  return {
    entry: currentPrice,
    stop: suggestedStop,
    target: suggestedTarget,
    ratio,
    quality,
  };
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
    
    // Calculate risk/reward ratio based on support/resistance
    const rrAnalysis = calculateRiskReward(
      latestCandle.close,
      signalDirection,
      indicators.supportLevels,
      indicators.resistanceLevels,
      indicators.atr14,
      { upper: indicators.bollingerBands.upper, lower: indicators.bollingerBands.lower }
    );
    
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
      riskRewardRatio: rrAnalysis.ratio,
      suggestedEntry: rrAnalysis.entry,
      suggestedStop: rrAnalysis.stop,
      suggestedTarget: rrAnalysis.target,
      tradeQuality: rrAnalysis.quality,
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
      
      // Add R:R quality indicator to matched criteria
      if (analysis.tradeQuality === 'excellent') {
        matchedCriteria.push('Excellent R:R (3:1+)');
      } else if (analysis.tradeQuality === 'good') {
        matchedCriteria.push('Good R:R (2:1+)');
      } else if (analysis.tradeQuality === 'poor') {
        matchedCriteria.push('Poor R:R (<1.5:1)');
      }
      
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
        // Include R:R data
        riskRewardRatio: analysis.riskRewardRatio,
        suggestedEntry: analysis.suggestedEntry,
        suggestedStop: analysis.suggestedStop,
        suggestedTarget: analysis.suggestedTarget,
        tradeQuality: analysis.tradeQuality,
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
