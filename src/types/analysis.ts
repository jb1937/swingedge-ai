// src/types/analysis.ts

export interface TechnicalIndicators {
  // Trend
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  adx: number;
  
  // Momentum
  rsi14: number;
  stochRsi: {
    k: number;
    d: number;
  };
  williamsR: number;
  mfi: number;
  
  // Volatility
  atr14: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    width: number;
  };
  
  // Volume
  obv: number;
  vwap: number;
  
  // Support/Resistance
  supportLevels: number[];
  resistanceLevels: number[];
}

export interface MLSignal {
  symbol: string;
  signalStrength: number;  // 0 to 1
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  modelAgreement: number;
  individualModels: {
    gradientBoost: number;
    randomForest: number;
    neuralNet: number;
  };
  generatedAt: Date;
  expiresAt: Date;
}

export interface TradeThesis {
  symbol: string;
  thesis: string;
  conviction: 'high' | 'medium' | 'low';
  technicalScore: number;
  suggestedEntry: number;
  suggestedStop: number;
  targetPrice: number;
  holdingPeriod: string;
  riskRewardRatio: number;
  keyRisks: string[];
  keyCatalysts: string[];
  positionSizeRecommendation: 'full' | 'half' | 'quarter' | 'avoid';
  generatedAt: Date;
  // Prediction integration
  predictionTarget?: number;  // The AI prediction target used to inform the thesis target
  predictionConfidence?: number;  // Confidence from prediction (0-100)
  predictionDirection?: 'up' | 'down' | 'sideways';  // Direction from prediction
  signalConflict?: boolean;  // True if prediction direction conflicts with signal direction
}

export interface ScreenerResult {
  symbol: string;
  companyName: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  signalStrength: number;
  technicalScore: number;
  matchedCriteria: string[];
  // Risk/Reward analysis
  riskRewardRatio?: number;
  suggestedEntry?: number;
  suggestedStop?: number;
  suggestedTarget?: number;
  tradeQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface ScreenerFilters {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  sectors?: string[];
  minSignalStrength?: number;
  technicalSetup?: string[];
}
