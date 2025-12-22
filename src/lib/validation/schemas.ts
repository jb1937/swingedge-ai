// src/lib/validation/schemas.ts

import { z } from 'zod';

// ==================== TRADING SCHEMAS ====================

export const symbolSchema = z
  .string()
  .min(1, 'Symbol is required')
  .max(10, 'Symbol too long')
  .regex(/^[A-Z0-9.]+$/i, 'Invalid symbol format')
  .transform(s => s.toUpperCase());

export const orderSideSchema = z.enum(['buy', 'sell']);

export const orderTypeSchema = z.enum(['market', 'limit', 'stop', 'stop_limit']);

export const timeInForceSchema = z.enum(['day', 'gtc', 'ioc']);

export const orderRequestSchema = z.object({
  symbol: symbolSchema,
  qty: z.number().int().positive('Quantity must be positive'),
  side: orderSideSchema,
  type: orderTypeSchema,
  timeInForce: timeInForceSchema.default('day'),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  extendedHours: z.boolean().default(false),
}).refine(
  (data) => {
    if (data.type === 'limit' || data.type === 'stop_limit') {
      return data.limitPrice !== undefined;
    }
    return true;
  },
  { message: 'Limit price required for limit orders' }
).refine(
  (data) => {
    if (data.type === 'stop' || data.type === 'stop_limit') {
      return data.stopPrice !== undefined;
    }
    return true;
  },
  { message: 'Stop price required for stop orders' }
);

export const bracketOrderSchema = z.object({
  entry: orderRequestSchema,
  takeProfit: z.number().positive('Take profit must be positive'),
  stopLoss: z.number().positive('Stop loss must be positive'),
}).refine(
  (data) => {
    if (data.entry.side === 'buy') {
      return data.takeProfit > data.entry.limitPrice! || data.takeProfit > data.stopLoss;
    }
    return true;
  },
  { message: 'Invalid take profit/stop loss levels' }
);

// ==================== BACKTEST SCHEMAS ====================

export const backtestConfigSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  initialCapital: z.number().min(1000, 'Minimum capital is $1,000').max(10000000, 'Maximum capital is $10M'),
  positionSizePct: z.number().min(0.01).max(1, 'Position size must be 1-100%'),
  maxPositions: z.number().int().min(1).max(20),
  commission: z.number().min(0).max(0.01).default(0.001),
  slippageBps: z.number().min(0).max(100).default(5),
  stopLossPct: z.number().min(0.01).max(0.5).optional(),
  takeProfitPct: z.number().min(0.01).max(1).optional(),
}).refine(
  (data) => new Date(data.startDate) < new Date(data.endDate),
  { message: 'Start date must be before end date' }
);

export const strategyParamsSchema = z.object({
  entryRsiThreshold: z.number().min(1).max(100).default(60),
  exitRsiThreshold: z.number().min(1).max(100).default(75),
  emaFastPeriod: z.number().int().min(2).max(50).default(9),
  emaSlowPeriod: z.number().int().min(5).max(200).default(21),
  atrMultiplier: z.number().min(0.5).max(5).default(2),
  volumeThreshold: z.number().min(0).max(10).default(1),
  minHoldingDays: z.number().int().min(0).max(30).default(2),
  maxHoldingDays: z.number().int().min(1).max(60).default(10),
}).refine(
  (data) => data.emaFastPeriod < data.emaSlowPeriod,
  { message: 'Fast EMA period must be less than slow EMA period' }
);

export const backtestRequestSchema = z.object({
  symbol: symbolSchema,
  name: z.string().max(100).optional(),
  config: backtestConfigSchema.partial().optional(),
  params: strategyParamsSchema.partial().optional(),
});

// ==================== SCREENER SCHEMAS ====================

export const screenerFiltersSchema = z.object({
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  minVolume: z.number().int().positive().optional(),
  minSignalStrength: z.number().min(0).max(1).optional(),
  sectors: z.array(z.string()).optional(),
  signalDirection: z.enum(['long', 'short', 'any']).optional(),
}).refine(
  (data) => {
    if (data.minPrice && data.maxPrice) {
      return data.minPrice < data.maxPrice;
    }
    return true;
  },
  { message: 'Min price must be less than max price' }
);

export const screenerRequestSchema = z.object({
  symbols: z.array(symbolSchema).min(1).max(200).optional(),
  watchlist: z.enum(['technology', 'financials', 'healthcare', 'energy', 'consumer', 'industrials', 'etfs', 'momentum', 'default']).optional(),
  filters: screenerFiltersSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ==================== ANALYSIS SCHEMAS ====================

export const technicalAnalysisRequestSchema = z.object({
  symbol: symbolSchema,
  timeframe: z.enum(['1min', '5min', '15min', '30min', '1hour', '1day', '1week']).default('1day'),
});

export const thesisRequestSchema = z.object({
  symbol: symbolSchema,
  includeNews: z.boolean().default(false),
});

// ==================== CHAT SCHEMAS ====================

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(10000),
});

export const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(5000, 'Message too long'),
  messages: z.array(chatMessageSchema).max(50).optional(),
});

// ==================== DATA SCHEMAS ====================

export const quoteRequestSchema = z.object({
  symbol: symbolSchema,
});

export const historicalRequestSchema = z.object({
  symbol: symbolSchema,
  timeframe: z.enum(['1min', '5min', '15min', '30min', '1hour', '1day', '1week']).default('1day'),
  outputSize: z.enum(['compact', 'full']).default('compact'),
});

// ==================== TYPE EXPORTS ====================

export type OrderRequest = z.infer<typeof orderRequestSchema>;
export type BracketOrderRequest = z.infer<typeof bracketOrderSchema>;
export type BacktestConfig = z.infer<typeof backtestConfigSchema>;
export type StrategyParams = z.infer<typeof strategyParamsSchema>;
export type BacktestRequest = z.infer<typeof backtestRequestSchema>;
export type ScreenerFilters = z.infer<typeof screenerFiltersSchema>;
export type ScreenerRequest = z.infer<typeof screenerRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type TechnicalAnalysisRequest = z.infer<typeof technicalAnalysisRequestSchema>;
export type ThesisRequest = z.infer<typeof thesisRequestSchema>;
