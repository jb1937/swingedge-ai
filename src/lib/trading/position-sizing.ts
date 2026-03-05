// src/lib/trading/position-sizing.ts

interface PositionSizeParams {
  accountValue: number;
  entryPrice: number;
  stopDistance: number;    // Dollar distance from entry to stop (replaces ATR-based calc for day trades)
  atr?: number;            // Optional — only used if stopDistance not deterministic
  riskPerTrade?: number;   // Default 1% (reduced from 2% for day trading)
  maxPositionPct?: number; // Default 12% (reduced from 20% for more diversification)
  atrMultiplier?: number;  // Default 2 (stop distance when using ATR fallback)
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
  stopDistance,
  atr = 0,
  riskPerTrade = 0.01,
  maxPositionPct = 0.12,
  atrMultiplier = 2,
}: PositionSizeParams): PositionSizeResult {
  // Dollar amount we're willing to risk
  const riskAmount = accountValue * riskPerTrade;

  // Use provided stop distance, fall back to ATR-based if not given
  const effectiveStopDistance = stopDistance > 0 ? stopDistance : atr * atrMultiplier;
  const stopPrice = entryPrice - effectiveStopDistance;
  
  // Shares based on risk
  const sharesFromRisk = effectiveStopDistance > 0
    ? Math.floor(riskAmount / effectiveStopDistance)
    : 0;

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
    riskAmount: shares * effectiveStopDistance,
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

/**
 * Calculate staged exit levels for partial position management.
 *
 * Instead of a single take-profit that rarely gets hit, we use two stages:
 * - Partial exit (50%) at 1:1 R:R removes initial risk and locks in first profit
 * - Remaining 50% runs with stop moved to breakeven (+ small buffer)
 * - Full target at riskRewardFull:1 R:R for trailing the second half
 */
export function calculatePartialExitLevels(
  entryPrice: number,
  stopPrice: number,
  riskRewardFull: number = 2
): { partialTarget: number; fullTarget: number; breakevenStop: number } {
  const risk = entryPrice - stopPrice;
  return {
    partialTarget: entryPrice + risk * 1.0,           // 1:1 R:R — first exit, removes all risk
    fullTarget: entryPrice + risk * riskRewardFull,    // 2:1 R:R — second half target
    breakevenStop: entryPrice + risk * 0.1,            // Move stop here after first exit hits
  };
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
  
  if (positionPct > 0.15) {
    return { valid: false, reason: 'Position exceeds 15% of portfolio' };
  }
  
  return { valid: true };
}
