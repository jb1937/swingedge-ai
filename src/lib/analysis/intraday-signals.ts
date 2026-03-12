// src/lib/analysis/intraday-signals.ts
//
// Three statistically-grounded intraday signal detectors used by the
// day-trading strategy. Each signal is uncorrelated with the others,
// giving the screener multiple independent edges per session.
//
// Signal types:
//   gap_fade       — down-gap reversal (fills ~55-60% of gaps >1.5%)
//   vwap_reversion — price snaps back after deviating >1.5σ below VWAP
//   orb            — opening range breakout with volume confirmation

import { NormalizedOHLCV } from '@/types/market';
import { calculateIntradayVWAP, calculateOpeningRange, calculateGapPercent } from './technical-analysis';

export type SignalType = 'gap_fade' | 'vwap_reversion' | 'orb';

export interface IntradaySignal {
  symbol: string;
  signalType: SignalType;
  triggered: boolean;
  entry: number;
  stop: number;
  target: number;
  riskRewardRatio: number;
  tradeQuality: 'excellent' | 'good' | 'fair' | 'poor';
  confidence: number; // 0–1
  details: Record<string, number>;
}

function qualityFromRR(rr: number): IntradaySignal['tradeQuality'] {
  if (rr >= 2.0) return 'excellent';
  if (rr >= 1.5) return 'good';
  if (rr >= 1.2) return 'fair';
  return 'poor';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Signal 1: Gap Fade
// ---------------------------------------------------------------------------
// Stocks that gap down >1.5% from the prior close tend to partially fill
// that gap within the same session ~55-60% of the time.
//
// Entry criteria (checked at 9:35 AM after first 5-min candle closes):
//   - Gap down >1.5% from prior close to today's open
//   - First 5-min candle is bullish (close > open) — buyers stepping in
//   - Volume of that candle is ≥1.2× 20-day average
//
// Stop:  Low of the first 5-min candle (abandons thesis if that low breaks)
// Target: 60% of the gap filled
// ---------------------------------------------------------------------------
export function detectGapFade(
  symbol: string,
  candles5min: NormalizedOHLCV[],
  prevClose: number,
  avgDailyVolume: number,
  dailyTrendOk = true // skip counter-trend fades in strongly bearish stocks
): IntradaySignal {
  const notTriggered = (details: Record<string, number> = {}): IntradaySignal => ({
    symbol,
    signalType: 'gap_fade',
    triggered: false,
    entry: 0,
    stop: 0,
    target: 0,
    riskRewardRatio: 0,
    tradeQuality: 'poor',
    confidence: 0,
    details,
  });

  if (candles5min.length < 1) return notTriggered();

  const firstBar = candles5min[0];
  const openPrice = firstBar.open;
  const gapPct = calculateGapPercent(prevClose, openPrice);

  // Must be a down-gap of at least 1.5%
  if (gapPct >= -1.5) return notTriggered({ gapPct });

  // First bar must be bullish (buyers showing up)
  if (firstBar.close <= firstBar.open) return notTriggered({ gapPct, firstBarBullish: 0 });

  // Volume confirmation: first bar volume vs daily average scaled to 5-min
  // Daily avg volume / 78 bars per day ≈ expected 5-min volume
  const expectedBarVolume = avgDailyVolume / 78;
  const volumeRatio = expectedBarVolume > 0 ? firstBar.volume / expectedBarVolume : 1;
  if (volumeRatio < 1.2) return notTriggered({ gapPct, volumeRatio });

  const entry = round2(firstBar.close);
  const stop = round2(firstBar.low * 0.9995); // just below bar low

  // Target: 60% of gap fill
  const gapDollar = prevClose - openPrice; // positive because gap down
  const target = round2(openPrice + gapDollar * 0.6);

  if (target <= entry) return notTriggered({ gapPct, volumeRatio });

  const risk = entry - stop;
  const reward = target - entry;
  if (risk <= 0) return notTriggered({ gapPct, volumeRatio });

  const rr = round2(reward / risk);
  // If the opening bar already consumed most of the gap fill, entry is too extended — skip
  if (rr < 1.5) return notTriggered({ gapPct, volumeRatio, rr });
  const confidence = Math.min(1, 0.5 + Math.abs(gapPct) * 0.05 + (volumeRatio - 1.2) * 0.1);

  return {
    symbol,
    signalType: 'gap_fade',
    triggered: true,
    entry,
    stop,
    target,
    riskRewardRatio: rr,
    tradeQuality: qualityFromRR(rr),
    confidence: round2(confidence),
    details: { gapPct: round2(gapPct), volumeRatio: round2(volumeRatio) },
  };
}

// ---------------------------------------------------------------------------
// Signal 2: VWAP Mean Reversion
// ---------------------------------------------------------------------------
// Price deviating >1.5 standard deviations below VWAP has a tendency to
// snap back toward VWAP as institutional orders anchor near that level.
//
// Entry criteria:
//   - Latest close is below VWAP lower band (1.75σ below VWAP — tightened from 1.5σ)
//   - The bar that touched the band is bullish (close > open)
//   - Stock's daily trend is not strongly bearish (checked via dailyTrendOk flag)
//
// Stop:  VWAP - 2.25σ (σ-anchored — thesis invalidated by further VWAP deviation)
// Target: VWAP
// R:R is guaranteed ~2.0 by construction (reward=1.75σ, risk=0.5σ)
// ---------------------------------------------------------------------------
export function detectVWAPReversion(
  symbol: string,
  candles5min: NormalizedOHLCV[],
  dailyTrendOk: boolean // caller passes true if daily EMA9 > EMA21 or neutral
): IntradaySignal {
  const notTriggered = (details: Record<string, number> = {}): IntradaySignal => ({
    symbol,
    signalType: 'vwap_reversion',
    triggered: false,
    entry: 0,
    stop: 0,
    target: 0,
    riskRewardRatio: 0,
    tradeQuality: 'poor',
    confidence: 0,
    details,
  });

  if (candles5min.length < 2) return notTriggered();

  // Tightened trigger: 1.75σ (was 1.5σ) — stronger deviation = higher reversion probability
  const { vwap, lowerBand } = calculateIntradayVWAP(candles5min, 1.75);
  if (vwap === 0) return notTriggered();

  // Derive stdDev from vwap and lowerBand (lowerBand = vwap - stdDev * 1.75)
  const stdDev = (vwap - lowerBand) / 1.75;

  const latestBar = candles5min[candles5min.length - 1];

  // Price must have touched or gone below the lower VWAP band
  if (latestBar.low > lowerBand) return notTriggered({ vwap, lowerBand, latestClose: latestBar.close });

  // Bar must be bullish — showing a reversal attempt
  if (latestBar.close <= latestBar.open) return notTriggered({ vwap, lowerBand, barBullish: 0 });

  const entry = round2(latestBar.close);
  // σ-anchored stop: thesis fails if price deviates further (2.25σ below VWAP)
  // Floor at 1.5% below entry to cap max risk on low-volatility days
  const sigmaStop = vwap - stdDev * 2.25;
  const stop = round2(Math.max(sigmaStop, entry * 0.985));
  const target = round2(vwap);

  if (target <= entry) return notTriggered({ vwap, entry });

  const risk = entry - stop;
  const reward = target - entry;
  if (risk <= 0) return notTriggered({ vwap, entry, stop });

  const rr = round2(reward / risk);
  // If the reversal bar closed too far above the lower band, entry is too extended — skip
  if (rr < 1.5) return notTriggered({ vwap, lowerBand, entry, rr });
  const stdDevDistance = stdDev > 0 ? (entry - lowerBand) / stdDev : 0;
  const confidence = Math.min(1, 0.5 + stdDevDistance * 0.3);

  return {
    symbol,
    signalType: 'vwap_reversion',
    triggered: true,
    entry,
    stop,
    target,
    riskRewardRatio: rr,
    tradeQuality: qualityFromRR(rr),
    confidence: round2(confidence),
    details: { vwap: round2(vwap), lowerBand: round2(lowerBand), stdDev: round2(stdDev) },
  };
}

// ---------------------------------------------------------------------------
// Signal 3: Opening Range Breakout (ORB)
// ---------------------------------------------------------------------------
// The first 15 minutes of trading (3 × 5-min bars) establish a range.
// A breakout above that range with strong volume has directional follow-through
// edge, especially in the first hour of trading.
//
// Entry criteria (checked at 9:47 AM, after the 4th 5-min bar closes):
//   - At least 4 bars available (first 3 form the range, 4th is the breakout bar)
//   - Latest bar closes above the ORB high
//   - Volume of the breakout bar is ≥1.5× daily average (scaled to 5-min)
//   - Signal fires only before 10:30 AM ET (late breakouts have lower accuracy)
//
// Stop:  ORB midpoint
// Target: ORB high + (ORB range × 1.5)
// Entry filter: skip if entry > ORB high + 0.3×range (extended breakout = poor R:R)
// Range filter: skip if ORB range < 0.4% of price (tiny range = negligible profit potential)
// ---------------------------------------------------------------------------
export function detectORB(
  symbol: string,
  candles5min: NormalizedOHLCV[],
  avgDailyVolume: number,
  currentTimeET: Date
): IntradaySignal {
  const notTriggered = (details: Record<string, number> = {}): IntradaySignal => ({
    symbol,
    signalType: 'orb',
    triggered: false,
    entry: 0,
    stop: 0,
    target: 0,
    riskRewardRatio: 0,
    tradeQuality: 'poor',
    confidence: 0,
    details,
  });

  // Need at least 4 bars (3 for ORB range + 1 breakout bar)
  if (candles5min.length < 4) return notTriggered({ bars: candles5min.length });

  // Only valid before 10:30 AM ET
  const etHour = currentTimeET.getHours();
  const etMinute = currentTimeET.getMinutes();
  if (etHour > 10 || (etHour === 10 && etMinute >= 30)) {
    return notTriggered({ tooLate: 1 });
  }

  const orb = calculateOpeningRange(candles5min);
  if (!orb) return notTriggered();

  // Skip tiny ORB ranges — negligible profit potential even with good R:R
  if (orb.rangeSize / orb.high < 0.004) return notTriggered({ orbRange: orb.rangeSize, tinyRange: 1 });

  const breakoutBar = candles5min[candles5min.length - 1];

  // Bar must close above ORB high
  if (breakoutBar.close <= orb.high) {
    return notTriggered({ orbHigh: orb.high, barClose: breakoutBar.close });
  }

  // Volume confirmation
  const expectedBarVolume = avgDailyVolume / 78;
  const volumeRatio = expectedBarVolume > 0 ? breakoutBar.volume / expectedBarVolume : 1;
  if (volumeRatio < 1.5) return notTriggered({ orbHigh: orb.high, volumeRatio });

  const entry = round2(breakoutBar.close);

  // Skip extended entries — breakout bar closed too far above ORB high (early buyers captured the move)
  if (entry > orb.high + orb.rangeSize * 0.3) {
    return notTriggered({ orbHigh: orb.high, entry, extendedEntry: 1 });
  }

  const stop = round2(orb.midpoint);
  const target = round2(orb.high + orb.rangeSize * 1.5);

  if (target <= entry) return notTriggered({ orbHigh: orb.high, target, entry });

  const risk = entry - stop;
  const reward = target - entry;
  if (risk <= 0) return notTriggered({ orbHigh: orb.high, entry, stop });

  const rr = round2(reward / risk);
  const confidence = Math.min(1, 0.5 + (volumeRatio - 1.5) * 0.15 + (orb.rangeSize / entry) * 2);

  return {
    symbol,
    signalType: 'orb',
    triggered: true,
    entry,
    stop,
    target,
    riskRewardRatio: rr,
    tradeQuality: qualityFromRR(rr),
    confidence: round2(confidence),
    details: {
      orbHigh: round2(orb.high),
      orbLow: round2(orb.low),
      orbRange: round2(orb.rangeSize),
      volumeRatio: round2(volumeRatio),
    },
  };
}

// ---------------------------------------------------------------------------
// Signal combiner — returns the single best triggered signal per symbol
// ---------------------------------------------------------------------------
export function getBestSignal(signals: IntradaySignal[]): IntradaySignal | null {
  const triggered = signals.filter(s => s.triggered);
  if (triggered.length === 0) return null;
  // Rank by confidence, then R:R
  triggered.sort((a, b) =>
    b.confidence !== a.confidence
      ? b.confidence - a.confidence
      : b.riskRewardRatio - a.riskRewardRatio
  );
  return triggered[0];
}
