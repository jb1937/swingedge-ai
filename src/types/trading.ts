// src/types/trading.ts

export interface Position {
  symbol: string;
  qty: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  costBasis: number;
}

export interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  status: 'new' | 'filled' | 'partially_filled' | 'canceled' | 'expired' | 'rejected';
  limitPrice?: number;
  stopPrice?: number;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: 'day' | 'gtc' | 'ioc';
  extendedHours?: boolean;
}

export interface BracketOrder {
  entry: OrderRequest;
  takeProfit: number;
  stopLoss: number;
}

export interface Account {
  id: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  equity: number;
  lastEquity: number;
  dayTradeCount: number;
  status: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  entryTime: Date;
  exitTime?: Date;
  pnl?: number;
  pnlPercent?: number;
  holdingDays?: number;
  status: 'open' | 'closed' | 'cancelled';
  notes?: string;
  tags?: string[];
}
