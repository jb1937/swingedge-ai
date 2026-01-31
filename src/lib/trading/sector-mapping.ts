// src/lib/trading/sector-mapping.ts

import { Position, Order } from '@/types/trading';

/**
 * Comprehensive symbol to sector mapping
 * Based on GICS sector classifications with some custom groupings
 */
export const SYMBOL_TO_SECTOR: Record<string, string> = {
  // Technology
  'AAPL': 'Technology',
  'MSFT': 'Technology',
  'GOOGL': 'Technology',
  'GOOG': 'Technology',
  'META': 'Technology',
  'NVDA': 'Technology',
  'TSLA': 'Technology',
  'AMD': 'Technology',
  'NFLX': 'Technology',
  'CRM': 'Technology',
  'ADBE': 'Technology',
  'INTC': 'Technology',
  'ORCL': 'Technology',
  'CSCO': 'Technology',
  'IBM': 'Technology',
  'QCOM': 'Technology',
  'AVGO': 'Technology',
  'TXN': 'Technology',
  'MU': 'Technology',
  'AMAT': 'Technology',
  'LRCX': 'Technology',
  'KLAC': 'Technology',
  'SNPS': 'Technology',
  'CDNS': 'Technology',
  'NOW': 'Technology',
  'PANW': 'Technology',
  'CRWD': 'Technology',
  'ZS': 'Technology',
  'DDOG': 'Technology',
  'SNOW': 'Technology',
  'PLTR': 'Technology',
  'NET': 'Technology',
  'MDB': 'Technology',
  'TEAM': 'Technology',
  'WDAY': 'Technology',
  'ZM': 'Technology',
  'DOCU': 'Technology',
  'OKTA': 'Technology',
  'SPLK': 'Technology',
  'FTNT': 'Technology',
  'VEEV': 'Technology',
  
  // Financial Services
  'JPM': 'Financials',
  'BAC': 'Financials',
  'GS': 'Financials',
  'MS': 'Financials',
  'WFC': 'Financials',
  'C': 'Financials',
  'V': 'Financials',
  'MA': 'Financials',
  'AXP': 'Financials',
  'BLK': 'Financials',
  'SCHW': 'Financials',
  'USB': 'Financials',
  'PNC': 'Financials',
  'TFC': 'Financials',
  'COF': 'Financials',
  'AIG': 'Financials',
  'MET': 'Financials',
  'PRU': 'Financials',
  'ALL': 'Financials',
  'SPGI': 'Financials',
  'MCO': 'Financials',
  'ICE': 'Financials',
  'CME': 'Financials',
  'BK': 'Financials',
  'STT': 'Financials',
  'TROW': 'Financials',
  
  // Healthcare
  'JNJ': 'Healthcare',
  'PFE': 'Healthcare',
  'UNH': 'Healthcare',
  'MRK': 'Healthcare',
  'ABBV': 'Healthcare',
  'LLY': 'Healthcare',
  'BMY': 'Healthcare',
  'AMGN': 'Healthcare',
  'GILD': 'Healthcare',
  'TMO': 'Healthcare',
  'ABT': 'Healthcare',
  'DHR': 'Healthcare',
  'MDT': 'Healthcare',
  'ISRG': 'Healthcare',
  'SYK': 'Healthcare',
  'ELV': 'Healthcare',
  'CI': 'Healthcare',
  'HUM': 'Healthcare',
  'CVS': 'Healthcare',
  'WBA': 'Healthcare',
  'MRNA': 'Healthcare',
  'REGN': 'Healthcare',
  'VRTX': 'Healthcare',
  'BIIB': 'Healthcare',
  'ILMN': 'Healthcare',
  'ZTS': 'Healthcare',
  
  // Energy
  'XOM': 'Energy',
  'CVX': 'Energy',
  'COP': 'Energy',
  'SLB': 'Energy',
  'EOG': 'Energy',
  'MPC': 'Energy',
  'PSX': 'Energy',
  'VLO': 'Energy',
  'OXY': 'Energy',
  'PXD': 'Energy',
  'DVN': 'Energy',
  'HAL': 'Energy',
  'BKR': 'Energy',
  'FANG': 'Energy',
  'HES': 'Energy',
  'MRO': 'Energy',
  
  // Consumer Discretionary
  'DIS': 'Consumer',
  'HD': 'Consumer',
  'LOW': 'Consumer',
  'NKE': 'Consumer',
  'SBUX': 'Consumer',
  'MCD': 'Consumer',
  'TGT': 'Consumer',
  'TJX': 'Consumer',
  'ROST': 'Consumer',
  'DG': 'Consumer',
  'DLTR': 'Consumer',
  'YUM': 'Consumer',
  'CMG': 'Consumer',
  'DPZ': 'Consumer',
  'QSR': 'Consumer',
  'AMZN': 'Consumer',
  'BKNG': 'Consumer',
  'GM': 'Consumer',
  'F': 'Consumer',
  
  // Consumer Staples
  'WMT': 'Consumer Staples',
  'COST': 'Consumer Staples',
  'PG': 'Consumer Staples',
  'KO': 'Consumer Staples',
  'PEP': 'Consumer Staples',
  'PM': 'Consumer Staples',
  'MO': 'Consumer Staples',
  'CL': 'Consumer Staples',
  'KMB': 'Consumer Staples',
  'GIS': 'Consumer Staples',
  'K': 'Consumer Staples',
  'MDLZ': 'Consumer Staples',
  'STZ': 'Consumer Staples',
  'TAP': 'Consumer Staples',
  'KHC': 'Consumer Staples',
  
  // Industrials
  'BA': 'Industrials',
  'CAT': 'Industrials',
  'GE': 'Industrials',
  'MMM': 'Industrials',
  'UPS': 'Industrials',
  'FDX': 'Industrials',
  'HON': 'Industrials',
  'RTX': 'Industrials',
  'LMT': 'Industrials',
  'NOC': 'Industrials',
  'DE': 'Industrials',
  'EMR': 'Industrials',
  'ITW': 'Industrials',
  'GD': 'Industrials',
  'ETN': 'Industrials',
  'ROK': 'Industrials',
  'WM': 'Industrials',
  'RSG': 'Industrials',
  'NSC': 'Industrials',
  'UNP': 'Industrials',
  'CSX': 'Industrials',
  
  // Airlines (separate for correlation tracking)
  'DAL': 'Airlines',
  'UAL': 'Airlines',
  'LUV': 'Airlines',
  'AAL': 'Airlines',
  'JBLU': 'Airlines',
  'ALK': 'Airlines',
  
  // Communications
  'CMCSA': 'Communications',
  'T': 'Communications',
  'VZ': 'Communications',
  'CHTR': 'Communications',
  'TMUS': 'Communications',
  
  // Materials
  'LIN': 'Materials',
  'APD': 'Materials',
  'SHW': 'Materials',
  'ECL': 'Materials',
  'DD': 'Materials',
  'DOW': 'Materials',
  'FCX': 'Materials',
  'NEM': 'Materials',
  'NUE': 'Materials',
  'STLD': 'Materials',
  
  // Real Estate
  'AMT': 'Real Estate',
  'PLD': 'Real Estate',
  'CCI': 'Real Estate',
  'EQIX': 'Real Estate',
  'SPG': 'Real Estate',
  'PSA': 'Real Estate',
  'O': 'Real Estate',
  'DLR': 'Real Estate',
  'WELL': 'Real Estate',
  'AVB': 'Real Estate',
  
  // Utilities
  'NEE': 'Utilities',
  'DUK': 'Utilities',
  'SO': 'Utilities',
  'D': 'Utilities',
  'AEP': 'Utilities',
  'EXC': 'Utilities',
  'SRE': 'Utilities',
  'XEL': 'Utilities',
  'ED': 'Utilities',
  'WEC': 'Utilities',
  
  // Popular/Meme Stocks
  'GME': 'Speculative',
  'AMC': 'Speculative',
  'BBBY': 'Speculative',
  'SPCE': 'Speculative',
  'LCID': 'Speculative',
  'RIVN': 'Speculative',
  'SOFI': 'Speculative',
  'HOOD': 'Speculative',
  'COIN': 'Speculative',
  
  // ETFs
  'SPY': 'ETF - Broad Market',
  'QQQ': 'ETF - Technology',
  'IWM': 'ETF - Small Cap',
  'DIA': 'ETF - Dow',
  'VOO': 'ETF - S&P 500',
  'VTI': 'ETF - Total Market',
  'ARKK': 'ETF - Innovation',
  'XLF': 'ETF - Financials',
  'XLE': 'ETF - Energy',
  'XLK': 'ETF - Technology',
};

/**
 * Correlation groups - stocks that tend to move together
 * Used to warn about concentration even across different "sectors"
 */
export const CORRELATION_GROUPS: Record<string, string[]> = {
  'Home Improvement Retail': ['HD', 'LOW'],
  'Airlines': ['AAL', 'DAL', 'UAL', 'LUV', 'JBLU', 'ALK'],
  'Big Tech FAANG+': ['AAPL', 'AMZN', 'META', 'GOOGL', 'GOOG', 'NFLX', 'MSFT'],
  'Semiconductors': ['NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'MU', 'AMAT', 'LRCX', 'KLAC'],
  'Oil Majors': ['XOM', 'CVX', 'COP', 'OXY', 'EOG'],
  'Oil Refiners': ['MPC', 'PSX', 'VLO'],
  'Big Banks': ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS'],
  'Regional Banks': ['USB', 'PNC', 'TFC', 'SCHW'],
  'Cloud/SaaS': ['CRM', 'NOW', 'SNOW', 'WDAY', 'DDOG', 'MDB'],
  'Cybersecurity': ['PANW', 'CRWD', 'ZS', 'FTNT'],
  'EV/Auto': ['TSLA', 'RIVN', 'LCID', 'F', 'GM'],
  'Big Pharma': ['PFE', 'MRK', 'JNJ', 'BMY', 'ABBV', 'LLY'],
  'Biotech': ['MRNA', 'REGN', 'VRTX', 'BIIB', 'GILD', 'AMGN'],
  'Discount Retail': ['WMT', 'TGT', 'COST', 'DG', 'DLTR'],
  'Streaming/Media': ['NFLX', 'DIS', 'CMCSA'],
  'Defense': ['LMT', 'RTX', 'NOC', 'GD', 'BA'],
  'Railroads': ['UNP', 'NSC', 'CSX'],
  'Payments': ['V', 'MA', 'AXP', 'PYPL'],
};

/**
 * Exposure thresholds for warnings
 */
export const EXPOSURE_THRESHOLDS = {
  safe: 20,       // 0-20% = green
  moderate: 25,   // 20-25% = yellow
  high: 35,       // 25-35% = orange
  excessive: 35,  // 35%+ = red
};

/**
 * Get the sector for a given symbol
 */
export function getSectorForSymbol(symbol: string): string {
  return SYMBOL_TO_SECTOR[symbol.toUpperCase()] || 'Other';
}

/**
 * Get all correlation groups that a symbol belongs to
 */
export function getCorrelationGroups(symbol: string): string[] {
  const upperSymbol = symbol.toUpperCase();
  const groups: string[] = [];
  
  for (const [groupName, symbols] of Object.entries(CORRELATION_GROUPS)) {
    if (symbols.includes(upperSymbol)) {
      groups.push(groupName);
    }
  }
  
  return groups;
}

/**
 * Determine alert level based on exposure percentage
 */
export function getAlertLevel(exposurePercent: number): 'safe' | 'moderate' | 'high' | 'excessive' {
  if (exposurePercent >= EXPOSURE_THRESHOLDS.excessive) return 'excessive';
  if (exposurePercent >= EXPOSURE_THRESHOLDS.moderate) return 'high';
  if (exposurePercent >= EXPOSURE_THRESHOLDS.safe) return 'moderate';
  return 'safe';
}

// Type definitions
export interface PositionContribution {
  symbol: string;
  value: number;
  percent: number;
}

export interface PendingOrderContribution {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  estimatedValue: number;
}

export interface SectorExposure {
  sector: string;
  currentValue: number;
  currentPercent: number;
  projectedValue: number;
  projectedPercent: number;
  alertLevel: 'safe' | 'moderate' | 'high' | 'excessive';
  projectedAlertLevel: 'safe' | 'moderate' | 'high' | 'excessive';
  positions: PositionContribution[];
  pendingOrders: PendingOrderContribution[];
}

export interface CorrelationWarning {
  groupName: string;
  symbols: string[];
  currentValue: number;
  currentPercent: number;
  projectedValue: number;
  projectedPercent: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface SectorExposureData {
  sectors: SectorExposure[];
  correlationWarnings: CorrelationWarning[];
  totalInvested: number;
  totalInvestedPercent: number;
  projectedInvested: number;
  projectedInvestedPercent: number;
  cashValue: number;
  cashPercent: number;
  hasWarnings: boolean;
  warningCount: number;
}

/**
 * Calculate sector exposure from positions and pending orders
 */
export function calculateSectorExposure(
  positions: Position[],
  orders: Order[],
  portfolioValue: number
): SectorExposureData {
  if (portfolioValue <= 0) {
    return {
      sectors: [],
      correlationWarnings: [],
      totalInvested: 0,
      totalInvestedPercent: 0,
      projectedInvested: 0,
      projectedInvestedPercent: 0,
      cashValue: 0,
      cashPercent: 100,
      hasWarnings: false,
      warningCount: 0,
    };
  }

  // Group positions by sector
  const sectorPositions: Record<string, PositionContribution[]> = {};
  const sectorValues: Record<string, number> = {};
  
  for (const position of positions) {
    const sector = getSectorForSymbol(position.symbol);
    if (!sectorPositions[sector]) {
      sectorPositions[sector] = [];
      sectorValues[sector] = 0;
    }
    
    sectorPositions[sector].push({
      symbol: position.symbol,
      value: position.marketValue,
      percent: (position.marketValue / portfolioValue) * 100,
    });
    sectorValues[sector] += position.marketValue;
  }

  // Process pending buy orders (only unfilled limit/stop orders)
  const pendingOrders: Record<string, PendingOrderContribution[]> = {};
  const pendingValues: Record<string, number> = {};
  
  for (const order of orders) {
    // Only consider pending buy orders that could add to exposure
    if (order.side === 'buy' && 
        ['new', 'partially_filled'].includes(order.status) &&
        order.qty > order.filledQty) {
      
      const remainingQty = order.qty - order.filledQty;
      const price = order.limitPrice || order.stopPrice || 0;
      
      if (price > 0 && remainingQty > 0) {
        const sector = getSectorForSymbol(order.symbol);
        const estimatedValue = remainingQty * price;
        
        if (!pendingOrders[sector]) {
          pendingOrders[sector] = [];
          pendingValues[sector] = 0;
        }
        
        pendingOrders[sector].push({
          symbol: order.symbol,
          side: order.side,
          qty: remainingQty,
          price,
          estimatedValue,
        });
        pendingValues[sector] += estimatedValue;
      }
    }
  }

  // Calculate total invested
  const totalInvested = Object.values(sectorValues).reduce((sum, v) => sum + v, 0);
  const totalPending = Object.values(pendingValues).reduce((sum, v) => sum + v, 0);
  const projectedInvested = totalInvested + totalPending;
  const cashValue = portfolioValue - totalInvested;

  // Build sector exposure list
  const allSectors = new Set([
    ...Object.keys(sectorPositions),
    ...Object.keys(pendingOrders),
  ]);

  const sectors: SectorExposure[] = [];
  
  for (const sector of allSectors) {
    const currentValue = sectorValues[sector] || 0;
    const pendingValue = pendingValues[sector] || 0;
    const projectedValue = currentValue + pendingValue;
    
    const currentPercent = (currentValue / portfolioValue) * 100;
    const projectedPercent = (projectedValue / portfolioValue) * 100;
    
    sectors.push({
      sector,
      currentValue,
      currentPercent,
      projectedValue,
      projectedPercent,
      alertLevel: getAlertLevel(currentPercent),
      projectedAlertLevel: getAlertLevel(projectedPercent),
      positions: sectorPositions[sector] || [],
      pendingOrders: pendingOrders[sector] || [],
    });
  }

  // Sort by current value (descending)
  sectors.sort((a, b) => b.currentValue - a.currentValue);

  // Calculate correlation warnings
  const correlationWarnings = calculateCorrelationWarnings(
    positions,
    orders,
    portfolioValue
  );

  // Count warnings
  const sectorWarnings = sectors.filter(s => 
    s.alertLevel === 'high' || s.alertLevel === 'excessive' ||
    s.projectedAlertLevel === 'high' || s.projectedAlertLevel === 'excessive'
  ).length;
  
  const warningCount = sectorWarnings + correlationWarnings.length;

  return {
    sectors,
    correlationWarnings,
    totalInvested,
    totalInvestedPercent: (totalInvested / portfolioValue) * 100,
    projectedInvested,
    projectedInvestedPercent: (projectedInvested / portfolioValue) * 100,
    cashValue,
    cashPercent: (cashValue / portfolioValue) * 100,
    hasWarnings: warningCount > 0,
    warningCount,
  };
}

/**
 * Calculate correlation warnings for highly correlated stock groups
 */
function calculateCorrelationWarnings(
  positions: Position[],
  orders: Order[],
  portfolioValue: number
): CorrelationWarning[] {
  const warnings: CorrelationWarning[] = [];
  
  // Build a map of symbol -> current value and projected value
  const symbolValues: Record<string, { current: number; projected: number }> = {};
  
  for (const position of positions) {
    const symbol = position.symbol.toUpperCase();
    symbolValues[symbol] = {
      current: position.marketValue,
      projected: position.marketValue,
    };
  }
  
  // Add pending orders
  for (const order of orders) {
    if (order.side === 'buy' && 
        ['new', 'partially_filled'].includes(order.status) &&
        order.qty > order.filledQty) {
      
      const symbol = order.symbol.toUpperCase();
      const remainingQty = order.qty - order.filledQty;
      const price = order.limitPrice || order.stopPrice || 0;
      const pendingValue = remainingQty * price;
      
      if (!symbolValues[symbol]) {
        symbolValues[symbol] = { current: 0, projected: 0 };
      }
      symbolValues[symbol].projected += pendingValue;
    }
  }

  // Check each correlation group
  for (const [groupName, groupSymbols] of Object.entries(CORRELATION_GROUPS)) {
    const matchingSymbols = groupSymbols.filter(s => symbolValues[s]);
    
    if (matchingSymbols.length >= 2) {
      const currentValue = matchingSymbols.reduce(
        (sum, s) => sum + (symbolValues[s]?.current || 0), 
        0
      );
      const projectedValue = matchingSymbols.reduce(
        (sum, s) => sum + (symbolValues[s]?.projected || 0), 
        0
      );
      
      const currentPercent = (currentValue / portfolioValue) * 100;
      const projectedPercent = (projectedValue / portfolioValue) * 100;
      
      // Warn if combined exposure exceeds 20% or if 3+ stocks from group
      const shouldWarn = currentPercent >= 20 || projectedPercent >= 25 || matchingSymbols.length >= 3;
      
      if (shouldWarn) {
        const severity = projectedPercent >= 30 || matchingSymbols.length >= 4 ? 'critical' : 'warning';
        
        let message = '';
        if (projectedPercent > currentPercent) {
          message = `${matchingSymbols.join(' + ')} combined: ${currentPercent.toFixed(1)}% → ${projectedPercent.toFixed(1)}%`;
        } else {
          message = `${matchingSymbols.join(' + ')} combined: ${currentPercent.toFixed(1)}%`;
        }
        
        if (matchingSymbols.length >= 3) {
          message += ` (${matchingSymbols.length} correlated positions)`;
        }
        
        warnings.push({
          groupName,
          symbols: matchingSymbols,
          currentValue,
          currentPercent,
          projectedValue,
          projectedPercent,
          severity,
          message,
        });
      }
    }
  }

  // Sort by severity and projected value
  warnings.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.projectedPercent - a.projectedPercent;
  });

  return warnings;
}
