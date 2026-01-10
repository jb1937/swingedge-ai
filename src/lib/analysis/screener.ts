// src/lib/analysis/screener.ts

import { ScreenerFilters, ScreenerResult } from '@/types/analysis';
import { dataRouter } from '@/lib/data/data-router';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
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
  // Position context
  atResistance: boolean;
  atSupport: boolean;
}

/**
 * Calculate risk/reward ratio based on support/resistance levels
 * Target is capped using ATR-based realistic expectations for 5-day swing trades
 * (Since screener can't call AI prediction for each stock, ATR serves as a proxy)
 */
function calculateRiskReward(
  currentPrice: number,
  signalDirection: 'long' | 'short' | 'neutral',
  supportLevels: number[],
  resistanceLevels: number[],
  atr: number,
  bollingerBands: { upper: number; lower: number }
): { 
  entry: number; 
  stop: number; 
  target: number; 
  ratio: number; 
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  atResistance: boolean;
  atSupport: boolean;
} {
  const atrBuffer = atr * 0.5;
  
  // Realistic target cap based on ATR
  // For a 5-day swing trade, typical movement is 2-4x daily ATR
  // We use 3x ATR as a realistic cap (~5% for most stocks)
  const realisticTargetCap = currentPrice + (atr * 3);
  const realisticTargetFloor = currentPrice - (atr * 3);
  
  // Find relevant support/resistance levels
  const supportsBelow = supportLevels.filter(l => l < currentPrice).sort((a, b) => b - a);
  const resistanceAbove = resistanceLevels.filter(l => l > currentPrice).sort((a, b) => a - b);
  
  let suggestedStop: number;
  let suggestedTarget: number;
  
  // Check if price is near Bollinger Band boundaries (within 1.5%)
  const bbUpperDistance = (bollingerBands.upper - currentPrice) / currentPrice;
  const bbLowerDistance = (currentPrice - bollingerBands.lower) / currentPrice;
  const atResistance = bbUpperDistance < 0.015; // Within 1.5% of upper BB
  const atSupport = bbLowerDistance < 0.015; // Within 1.5% of lower BB
  
  if (signalDirection === 'long' || signalDirection === 'neutral') {
    // Stop below nearest support (with ATR buffer)
    if (supportsBelow.length > 0) {
      suggestedStop = supportsBelow[0] - atrBuffer;
    } else {
      // Fallback: use ATR-based stop
      suggestedStop = currentPrice - atr * 2;
    }
    
    // Target: Use resistance level if available, otherwise use ATR-based target
    if (resistanceAbove.length > 0) {
      // Use the next resistance level as target
      suggestedTarget = resistanceAbove[0];
    } else {
      // No resistance found - use 2x risk as target OR upper BB (whichever is closer to realistic)
      const risk = currentPrice - suggestedStop;
      const riskBasedTarget = currentPrice + risk * 2;
      suggestedTarget = Math.min(riskBasedTarget, bollingerBands.upper);
    }
    
    // Track if we're capping the target
    let targetCapped = false;
    
    // Cap target at realistic ATR-based expectation for 5-day timeframe
    // This prevents unrealistically high targets that would never be reached in 5 days
    if (suggestedTarget > realisticTargetCap) {
      suggestedTarget = realisticTargetCap;
      targetCapped = true;
    }
    
    // Only cap at BB if price is already AT the ceiling (within 2% of upper BB)
    // This prevents recommending entries when there's no room to run
    if (atResistance && suggestedTarget > bollingerBands.upper) {
      // Price is at ceiling - cap target at BB, this will naturally create poor R:R
      suggestedTarget = bollingerBands.upper;
      targetCapped = true;
    }
    
    // Edge case: if target is still at or below current price, use 2x risk (capped)
    if (suggestedTarget <= currentPrice) {
      const risk = currentPrice - suggestedStop;
      suggestedTarget = Math.min(currentPrice + risk * 2, realisticTargetCap);
    }
    
    // IMPORTANT: When target is capped, also use tighter ATR-based stop
    // This ensures consistent R:R calculation - distant support stops don't make sense
    // with capped targets that are realistic for the holding period
    if (targetCapped) {
      const tightStopMultiplier = 1.5;
      suggestedStop = currentPrice - (atr * tightStopMultiplier);
    }
  } else {
    // Short trade: stop above nearest resistance (with ATR buffer)
    if (resistanceAbove.length > 0) {
      suggestedStop = resistanceAbove[0] + atrBuffer;
    } else {
      // Fallback: use ATR-based stop
      suggestedStop = currentPrice + atr * 2;
    }
    
    // Target: Use support level if available, otherwise use ATR-based target
    if (supportsBelow.length > 0) {
      suggestedTarget = supportsBelow[0];
    } else {
      const risk = suggestedStop - currentPrice;
      const riskBasedTarget = currentPrice - risk * 2;
      suggestedTarget = Math.max(riskBasedTarget, bollingerBands.lower);
    }
    
    // Cap target at realistic ATR-based expectation for 5-day timeframe
    if (suggestedTarget < realisticTargetFloor) {
      suggestedTarget = realisticTargetFloor;
    }
    
    // Only floor at BB if price is already at the floor
    if (atSupport && suggestedTarget < bollingerBands.lower) {
      suggestedTarget = bollingerBands.lower;
    }
    
    // Edge case: if target is still at or above current price, use 2x risk (capped)
    if (suggestedTarget >= currentPrice) {
      const risk = suggestedStop - currentPrice;
      suggestedTarget = Math.max(currentPrice - risk * 2, realisticTargetFloor);
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
    atResistance,
    atSupport,
  };
}

/**
 * Analyze a single symbol for screener
 */
export async function analyzeSymbolForScreener(symbol: string): Promise<ScreenerAnalysis | null> {
  try {
    // Use 'full' data to match the analysis page - ensures consistent R:R calculations
    // and accurate EMA 200 calculations (needs 200+ data points)
    const candles = await dataRouter.getHistorical(symbol, '1day', 'full');
    
    if (!candles || candles.length < 50) {
      return null;
    }
    
    const indicators = calculateTechnicalIndicators(candles);
    if (!indicators) return null;
    
    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    
    // Get REAL-TIME price from Alpaca instead of using stale historical close
    let currentPrice: number;
    let change: number;
    let changePercent: number;
    
    try {
      // Fetch real-time quote from Alpaca
      const realTimeQuote = await alpacaDataClient.getLatestQuote(symbol);
      currentPrice = realTimeQuote.price;
      
      // Calculate change from previous day's close to current real-time price
      change = currentPrice - previousCandle.close;
      changePercent = (change / previousCandle.close) * 100;
    } catch (quoteError) {
      // Fallback to historical data if real-time quote fails
      console.warn(`Failed to get real-time quote for ${symbol}, using historical data`);
      currentPrice = latestCandle.close;
      change = latestCandle.close - previousCandle.close;
      changePercent = (change / previousCandle.close) * 100;
    }
    
    // Use real-time price for score calculations
    const technicalScore = calculateTechnicalScore(indicators, currentPrice);
    const signalDirection = determineSignalDirection(indicators, currentPrice);
    
    // Signal strength based on technical score (0-1 scale)
    const signalStrength = technicalScore / 100;
    
    // Calculate risk/reward ratio based on support/resistance using real-time price
    const rrAnalysis = calculateRiskReward(
      currentPrice,
      signalDirection,
      indicators.supportLevels,
      indicators.resistanceLevels,
      indicators.atr14,
      { upper: indicators.bollingerBands.upper, lower: indicators.bollingerBands.lower }
    );
    
    return {
      symbol,
      price: currentPrice,
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
      atResistance: rrAnalysis.atResistance,
      atSupport: rrAnalysis.atSupport,
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
      
      // Add R:R quality FIRST so it's always visible (UI truncates to 3 badges)
      if (analysis.tradeQuality === 'excellent') {
        matchedCriteria.push('Excellent R:R (3:1+)');
      } else if (analysis.tradeQuality === 'good') {
        matchedCriteria.push('Good R:R (2:1+)');
      } else if (analysis.tradeQuality === 'fair') {
        matchedCriteria.push('Fair R:R (1.5-2:1)');
      } else if (analysis.tradeQuality === 'poor') {
        matchedCriteria.push('Poor R:R (<1.5:1)');
      }
      
      // Check technical setups (these may be truncated if more than 2)
      if (analysis.rsi < 30) matchedCriteria.push('RSI Oversold');
      if (analysis.rsi > 70) matchedCriteria.push('RSI Overbought');
      if (analysis.macdHistogram > 0) matchedCriteria.push('MACD Bullish');
      if (analysis.macdHistogram < 0) matchedCriteria.push('MACD Bearish');
      if (analysis.technicalScore >= 70) matchedCriteria.push('Strong Technical Score');
      if (analysis.signalDirection === 'long') matchedCriteria.push('Bullish Signal');
      if (analysis.signalDirection === 'short') matchedCriteria.push('Bearish Signal');
      
      // Add position context - warn when price is at ceiling/floor
      if (analysis.atResistance && analysis.signalDirection === 'long') {
        matchedCriteria.push('At Ceiling - Wait for Pullback');
      }
      if (analysis.atSupport && analysis.signalDirection === 'short') {
        matchedCriteria.push('At Floor - Wait for Bounce');
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
