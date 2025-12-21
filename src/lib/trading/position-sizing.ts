// src/lib/trading/position-sizing.ts

interface PositionSizeParams {
  accountValue: number;
  entryPrice: number;
  atr: number;
  riskPerTrade?: number;  // Default 2%
  maxPositionPct?: number; // Default 20%
  atrMultiplier?: number;  // Default 2 (stop distance)
}

interface PositionSizeResult {
  shares: number;
  positionValue: number;
  positionPct: number;
  stopPrice: number;
  riskAmount: number;
}

export function calculatePositionSize({
  accountValue,
  entryPrice,
  atr,
  riskPerTrade = 0.02,
  maxPositionPct = 0.20,
  atrMultiplier = 2,
}: PositionSizeParams): PositionSizeResult {
  // Dollar amount we're willing to risk
  const riskAmount = accountValue * riskPerTrade;
  
  // Stop distance based on ATR
  const stopDistance = atr * atrMultiplier;
  const stopPrice = entryPrice - stopDistance;
  
  // Shares based on risk
  const sharesFromRisk = Math.floor(riskAmount / stopDistance);
  
  // Maximum shares based on position size limit
  const maxPositionValue = accountValue * maxPositionPct;
  const maxShares = Math.floor(maxPositionValue / entryPrice);
  
  // Take the smaller of the two
  const shares = Math.min(sharesFromRisk, maxShares);
  const positionValue = shares * entryPrice;
  const positionPct = positionValue / accountValue;
  
  return {
    shares,
    positionValue,
    positionPct,
    stopPrice,
    riskAmount: shares * stopDistance,
  };
}

export function calculateTargetPrice(
  entryPrice: number,
  stopPrice: number,
  riskRewardRatio: number = 2
): number {
  const riskAmount = entryPrice - stopPrice;
  return entryPrice + (riskAmount * riskRewardRatio);
}

export function validatePositionSize(
  shares: number,
  entryPrice: number,
  accountValue: number,
  maxPositions: number,
  currentPositions: number
): { valid: boolean; reason?: string } {
  if (shares <= 0) {
    return { valid: false, reason: 'Position size is zero or negative' };
  }
  
  if (currentPositions >= maxPositions) {
    return { valid: false, reason: `Maximum positions (${maxPositions}) reached` };
  }
  
  const positionValue = shares * entryPrice;
  const positionPct = positionValue / accountValue;
  
  if (positionPct > 0.25) {
    return { valid: false, reason: 'Position exceeds 25% of portfolio' };
  }
  
  return { valid: true };
}
