// src/lib/backtest/intraday-backtest.ts
//
// Simulates the three intraday strategies that auto-trade actually uses:
//   gap_fade       — down-gap >1.5%, fade back toward prior close
//   vwap_reversion — price dipped >1.5% below daily VWAP proxy, bullish reversal
//   orb            — opening range breakout with volume confirmation
//   auto_mode      — all three combined; takes best R:R signal per day, good/excellent only
//
// Uses daily OHLC bars (same data already cached by dataRouter) rather than
// 5-min bars. Each signal is approximated from the daily bar's open/high/low/
// close/volume — a standard approach when intraday tick data isn't available.
//
// Exit simulation: when a daily bar's low hits the stop AND its high hits the
// target, bar color determines order (green → target first, red → stop first).
// This is the conventional daily-bar backtest approximation.

import { NormalizedOHLCV } from '@/types/market';
import { BacktestConfig, BacktestResult, BacktestTrade, EquityPoint } from '@/types/backtest';
import { atr, ema } from '@/lib/analysis/indicators';
import { calculateMetrics } from './backtest-engine';
import { getSectorForSymbol } from '@/lib/trading/sector-mapping';

export type IntradayStrategyType = 'gap_fade' | 'vwap_reversion' | 'orb' | 'auto_mode' | 'portfolio_auto_mode';

// Fixed 25-symbol portfolio — a representative cross-section of liquid names
// across sectors, mirroring the kinds of stocks in the live intraday watchlist.
export const PORTFOLIO_25 = [
  // Technology (8)
  'AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'META', 'NFLX', 'CRWD',
  // Financials (3)
  'JPM', 'GS', 'V',
  // Healthcare (3)
  'UNH', 'LLY', 'MRNA',
  // Energy (2)
  'XOM', 'CVX',
  // Consumer Discretionary (2)
  'AMZN', 'HD',
  // Consumer Staples (1)
  'COST',
  // Broad Market ETFs (3)
  'SPY', 'QQQ', 'IWM',
  // Commodity / Sector ETFs (3)
  'GLD', 'XLE', 'GDX',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function qualityFromRR(rr: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (rr >= 2.0) return 'excellent';
  if (rr >= 1.5) return 'good';
  if (rr >= 1.2) return 'fair';
  return 'poor';
}

interface DaySignal {
  signalType: IntradayStrategyType;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

// Trailing 20-day average volume (excludes today)
function avgVol20(candles: NormalizedOHLCV[], i: number): number {
  const slice = candles.slice(Math.max(0, i - 20), i);
  if (slice.length === 0) return 0;
  return slice.reduce((s, c) => s + c.volume, 0) / slice.length;
}

// ---------------------------------------------------------------------------
// Signal 1 — Gap Fade
// Approximation: entry = open, stop = open − 0.5×ATR (≈ first 5-min bar low),
// target = open + 60% of gap dollar (same formula as intraday-signals.ts)
// ---------------------------------------------------------------------------
function checkGapFade(
  candles: NormalizedOHLCV[],
  i: number,
  atrValues: number[],
): DaySignal | null {
  if (i < 21) return null;
  const today = candles[i];
  const prev = candles[i - 1];

  const gapPct = ((today.open - prev.close) / prev.close) * 100;
  if (gapPct >= -1.5) return null; // need gap DOWN > 1.5%

  const vol20 = avgVol20(candles, i);
  if (vol20 > 0 && today.volume < vol20 * 1.2) return null;

  const entry = round2(today.open);
  const currentATR = atrValues[i] > 0 ? atrValues[i] : today.close * 0.02;
  const stop = round2(entry - currentATR * 0.5);
  const gapDollar = prev.close - today.open; // positive for down-gap
  const target = round2(today.open + gapDollar * 0.6);

  if (target <= entry || stop >= entry) return null;

  const rr = round2((target - entry) / (entry - stop));
  if (rr < 1.0) return null;

  return { signalType: 'gap_fade', entry, stop, target, rr, quality: qualityFromRR(rr) };
}

// ---------------------------------------------------------------------------
// Signal 2 — VWAP Reversion
// Approximation: daily VWAP proxy = (H+L+C)/3 (typical price).
// Signal fires when the day's low is ≥1.5% below that proxy AND the bar closes
// bullish (reversion already underway). EMA9 must be ≥ EMA21×0.99 (not in a
// strong daily downtrend, matching the dailyTrendOk gate in live signals).
// Entry = low + 30% of bar body; stop = low; target = typical price.
// ---------------------------------------------------------------------------
function checkVWAPReversion(
  candles: NormalizedOHLCV[],
  i: number,
  ema9All: number[],
  ema21All: number[],
): DaySignal | null {
  if (i < 21) return null;
  const today = candles[i];

  // Daily trend gate
  const e9 = ema9All[i];
  const e21 = ema21All[i];
  if (!e9 || !e21 || e9 < e21 * 0.99) return null;

  const typicalPrice = (today.high + today.low + today.close) / 3;
  const lowDev = (typicalPrice - today.low) / typicalPrice;
  if (lowDev < 0.015) return null;

  // Bar must be bullish (reversion in progress)
  if (today.close <= today.open) return null;

  const entry = round2(today.low + (today.close - today.low) * 0.3);
  const stop = round2(today.low * 0.999);
  const target = round2(typicalPrice);

  if (target <= entry || stop >= entry) return null;

  const rr = round2((target - entry) / (entry - stop));
  if (rr < 1.0) return null;

  return { signalType: 'vwap_reversion', entry, stop, target, rr, quality: qualityFromRR(rr) };
}

// ---------------------------------------------------------------------------
// Signal 3 — Opening Range Breakout (ORB)
// Approximation from daily bars:
//   - Open in lower 35% of day's range (weak/indecisive open)
//   - Close in upper 40% of day's range (strong directional follow-through)
//   - Volume ≥ 1.5× 20-day average
// Estimated ORB high = low + 30% of day's range (proxy for first-15-min high)
// Entry = ORB high, stop = ORB midpoint, target = ORB high + 1.5× ORB range
// ---------------------------------------------------------------------------
function checkORB(
  candles: NormalizedOHLCV[],
  i: number,
): DaySignal | null {
  if (i < 21) return null;
  const today = candles[i];
  const range = today.high - today.low;
  if (range <= 0) return null;

  const openPos = (today.open - today.low) / range;
  const closePos = (today.close - today.low) / range;
  if (openPos > 0.35 || closePos < 0.60) return null;

  const vol20 = avgVol20(candles, i);
  if (vol20 > 0 && today.volume < vol20 * 1.5) return null;

  const orbHigh = round2(today.low + range * 0.3);
  const orbMid = round2(today.low + range * 0.15);
  const orbRange = orbHigh - today.low;

  const entry = orbHigh;
  const stop = orbMid;
  const target = round2(orbHigh + orbRange * 1.5);

  if (target <= entry || stop >= entry) return null;

  const rr = round2((target - entry) / (entry - stop));
  if (rr < 1.0) return null;

  return { signalType: 'orb', entry, stop, target, rr, quality: qualityFromRR(rr) };
}

// ---------------------------------------------------------------------------
// Intraday exit simulation using the same day's OHLC range.
// Both stop and target are intraday, so we infer order from bar color.
// ---------------------------------------------------------------------------
function simulateExit(
  signal: DaySignal,
  today: NormalizedOHLCV,
): { exitPrice: number; exitReason: 'target' | 'stop' | 'time' } {
  const stopHit = today.low <= signal.stop;
  const targetHit = today.high >= signal.target;

  if (stopHit && targetHit) {
    // Ambiguous — use bar direction as proxy for which happened first
    return today.close >= today.open
      ? { exitPrice: signal.target, exitReason: 'target' }
      : { exitPrice: signal.stop, exitReason: 'stop' };
  }
  if (targetHit) return { exitPrice: signal.target, exitReason: 'target' };
  if (stopHit) return { exitPrice: signal.stop, exitReason: 'stop' };
  // Neither hit — exit at EOD close (time stop)
  return { exitPrice: today.close, exitReason: 'time' };
}

const QUALITY_RANK: Record<string, number> = { excellent: 3, good: 2, fair: 1, poor: 0 };

// ---------------------------------------------------------------------------
// Core simulation loop — shared by all four single-symbol strategy variants
// ---------------------------------------------------------------------------
function simulate(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  strategyName: string,
  signalFn: (
    i: number,
    candles: NormalizedOHLCV[],
    atrValues: number[],
    ema9All: number[],
    ema21All: number[],
  ) => DaySignal | null,
  minQuality: 'fair' | 'good' | 'excellent' = 'fair',
  excludedSectors?: string[],
): BacktestResult {
  // If the symbol's sector is excluded, return an empty result immediately
  if (excludedSectors && excludedSectors.length > 0) {
    const sector = getSectorForSymbol(symbol);
    if (excludedSectors.includes(sector)) {
      return {
        id: crypto.randomUUID(),
        name: `${strategyName} (${sector} sector excluded)`,
        config,
        metrics: calculateMetrics([], config.initialCapital, config.initialCapital, []),
        equityCurve: [],
        tradeLog: [],
        monthlyReturns: {},
        createdAt: new Date(),
      };
    }
  }
  const startDate = new Date(config.startDate);
  const endDate = new Date(config.endDate);
  const filtered = candles.filter(c => {
    const d = new Date(c.timestamp);
    return d >= startDate && d <= endDate;
  });

  if (filtered.length < 30) throw new Error('Insufficient data for backtest period');

  const atrValues = atr(filtered, 14);
  const closes = filtered.map(c => c.close);
  const ema9All = ema(closes, 9);
  const ema21All = ema(closes, 21);

  let cash = config.initialCapital;
  let equity = config.initialCapital;
  let maxEquity = config.initialCapital;
  let maxDrawdown = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const equityByMonth: Record<string, { start: number; end: number }> = {};

  const minRank = QUALITY_RANK[minQuality];

  for (let i = 21; i < filtered.length; i++) {
    const candle = filtered[i];
    const currentDate = new Date(candle.timestamp).toISOString().split('T')[0];

    const signal = signalFn(i, filtered, atrValues, ema9All, ema21All);

    if (signal && QUALITY_RANK[signal.quality] >= minRank) {
      const positionValue = equity * config.positionSizePct;
      const quantity = Math.max(1, Math.floor(positionValue / signal.entry));

      if (cash >= quantity * signal.entry) {
        const { exitPrice, exitReason } = simulateExit(signal, candle);

        const slip = config.slippageBps / 10000;
        const entryFill = round2(signal.entry * (1 + slip));
        const exitFill = round2(exitPrice * (1 - slip));
        const commissionCost = (entryFill + exitFill) * quantity * config.commission;

        const grossPnL = (exitFill - entryFill) * quantity;
        const netPnL = round2(grossPnL - commissionCost);
        const pnlPct = round2((exitFill - entryFill) / entryFill * 100);

        cash = round2(cash + netPnL);
        equity = cash;

        trades.push({
          symbol,
          side: 'long',
          entryDate: currentDate,
          exitDate: currentDate,
          entryPrice: entryFill,
          exitPrice: exitFill,
          quantity,
          pnl: netPnL,
          pnlPercent: pnlPct,
          holdingDays: 0,
          exitReason,
        });
      }
    }

    // All trades are intraday — equity equals cash at end of each day
    equity = cash;
    maxEquity = Math.max(maxEquity, equity);
    const drawdown = (maxEquity - equity) / maxEquity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);

    equityCurve.push({ date: currentDate, equity, drawdown: drawdown * 100 });

    const monthKey = currentDate.slice(0, 7);
    if (!equityByMonth[monthKey]) equityByMonth[monthKey] = { start: equity, end: equity };
    equityByMonth[monthKey].end = equity;
  }

  const monthlyReturns: Record<string, number> = {};
  for (const [m, v] of Object.entries(equityByMonth)) {
    monthlyReturns[m] = round2(((v.end - v.start) / v.start) * 100);
  }

  const metrics = calculateMetrics(trades, config.initialCapital, equity, equityCurve);

  return {
    id: crypto.randomUUID(),
    name: strategyName,
    config,
    metrics,
    equityCurve,
    tradeLog: trades,
    monthlyReturns,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export function runGapFadeBacktest(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  excludedSectors?: string[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — Gap Fade`,
    (i, cs, atrs) => checkGapFade(cs, i, atrs),
    'fair',
    excludedSectors,
  );
}

export function runVWAPReversionBacktest(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  excludedSectors?: string[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — VWAP Reversion`,
    (i, cs, _atrs, e9, e21) => checkVWAPReversion(cs, i, e9, e21),
    'fair',
    excludedSectors,
  );
}

export function runORBBacktest(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  excludedSectors?: string[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — ORB`,
    (i, cs) => checkORB(cs, i),
    'fair',
    excludedSectors,
  );
}

// Auto Mode: replicates what the daily-scan + auto-trade cron does.
// Checks all three signals each day, takes the highest R:R among them,
// but only enters if quality is 'good' or 'excellent' (matching the default
// AUTO_TRADE_MIN_QUALITY=good setting).
export function runAutoModeBacktest(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  excludedSectors?: string[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — Auto Mode (Gap Fade + VWAP + ORB)`,
    (i, cs, atrs, e9, e21) => {
      const candidates = [
        checkGapFade(cs, i, atrs),
        checkVWAPReversion(cs, i, e9, e21),
        checkORB(cs, i),
      ].filter((s): s is DaySignal => s !== null);
      if (candidates.length === 0) return null;
      // Rank by R:R descending; auto-trade picks best signal per session
      return candidates.sort((a, b) => b.rr - a.rr)[0];
    },
    'good', // matches AUTO_TRADE_MIN_QUALITY default
    excludedSectors,
  );
}

// ---------------------------------------------------------------------------
// Portfolio Auto Mode — scans all 25 symbols per day, mirrors auto-trade
// ---------------------------------------------------------------------------
// Logic per day:
//   1. Run all 3 signal checks on every symbol
//   2. Filter to good/excellent quality only
//   3. Skip symbols whose sector is in excludedSectors
//   4. Dedup by sector — max 1 trade per sector per day (mirrors correlation gate)
//   5. Take top 3 signals by R:R (matches AUTO_TRADE_MAX_POSITIONS=3)
//   6. Simulate same-day intraday exits for each taken signal
//   7. Track combined equity across all trades
export function runPortfolioAutoModeBacktest(
  allCandlesMap: Map<string, NormalizedOHLCV[]>,
  config: BacktestConfig,
  excludedSectors?: string[],
): BacktestResult {
  const startDate = new Date(config.startDate);
  const endDate = new Date(config.endDate);

  // Build per-symbol lookups: dateStr → candle index, plus pre-computed indicators
  interface SymbolData {
    candles: NormalizedOHLCV[];
    dateIndex: Map<string, number>;
    atrValues: number[];
    ema9All: number[];
    ema21All: number[];
  }

  const symbolDataMap = new Map<string, SymbolData>();

  for (const [symbol, allCandles] of allCandlesMap) {
    const filtered = allCandles.filter(c => {
      const d = new Date(c.timestamp);
      return d >= startDate && d <= endDate;
    });
    if (filtered.length < 30) continue;

    const dateIndex = new Map<string, number>();
    filtered.forEach((c, i) => {
      dateIndex.set(new Date(c.timestamp).toISOString().split('T')[0], i);
    });

    const closes = filtered.map(c => c.close);
    symbolDataMap.set(symbol, {
      candles: filtered,
      dateIndex,
      atrValues: atr(filtered, 14),
      ema9All: ema(closes, 9),
      ema21All: ema(closes, 21),
    });
  }

  if (symbolDataMap.size === 0) {
    throw new Error('No usable data in portfolio candles map');
  }

  // Build master date list from SPY (or first available symbol with most data)
  const masterSymbol = symbolDataMap.has('SPY') ? 'SPY'
    : [...symbolDataMap.entries()].sort((a, b) => b[1].candles.length - a[1].candles.length)[0][0];
  const masterData = symbolDataMap.get(masterSymbol)!;
  const masterDates = masterData.candles.map(c => new Date(c.timestamp).toISOString().split('T')[0]);

  let cash = config.initialCapital;
  let equity = config.initialCapital;
  let maxEquity = config.initialCapital;
  let maxDrawdown = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const equityByMonth: Record<string, { start: number; end: number }> = {};

  const symbols = [...symbolDataMap.keys()];

  for (const dateStr of masterDates) {
    // Collect candidate signals from all portfolio symbols
    interface Candidate {
      symbol: string;
      sector: string;
      signal: DaySignal;
      candle: NormalizedOHLCV;
    }
    const candidates: Candidate[] = [];

    for (const symbol of symbols) {
      const sd = symbolDataMap.get(symbol)!;
      const idx = sd.dateIndex.get(dateStr);
      if (idx === undefined || idx < 21) continue;

      // Skip sectors that are excluded
      const sector = getSectorForSymbol(symbol);
      if (excludedSectors && excludedSectors.includes(sector)) continue;

      // Run all 3 signals, collect good/excellent ones
      const signalChecks = [
        checkGapFade(sd.candles, idx, sd.atrValues),
        checkVWAPReversion(sd.candles, idx, sd.ema9All, sd.ema21All),
        checkORB(sd.candles, idx),
      ].filter((s): s is DaySignal => s !== null && (s.quality === 'good' || s.quality === 'excellent'));

      if (signalChecks.length === 0) continue;

      // Best signal for this symbol (highest R:R)
      const best = signalChecks.sort((a, b) => b.rr - a.rr)[0];
      candidates.push({ symbol, sector, signal: best, candle: sd.candles[idx] });
    }

    // Dedup by sector — keep highest R:R per sector
    const bySector = new Map<string, Candidate>();
    for (const c of candidates) {
      const existing = bySector.get(c.sector);
      if (!existing || c.signal.rr > existing.signal.rr) {
        bySector.set(c.sector, c);
      }
    }

    // Take top 3 by R:R
    const taken = [...bySector.values()]
      .sort((a, b) => b.signal.rr - a.signal.rr)
      .slice(0, 3);

    // Simulate each trade
    for (const { symbol, signal, candle } of taken) {
      const positionValue = equity * config.positionSizePct;
      const quantity = Math.max(1, Math.floor(positionValue / signal.entry));

      if (cash >= quantity * signal.entry) {
        const { exitPrice, exitReason } = simulateExit(signal, candle);

        const slip = config.slippageBps / 10000;
        const entryFill = round2(signal.entry * (1 + slip));
        const exitFill = round2(exitPrice * (1 - slip));
        const commissionCost = (entryFill + exitFill) * quantity * config.commission;

        const netPnL = round2((exitFill - entryFill) * quantity - commissionCost);
        const pnlPct = round2((exitFill - entryFill) / entryFill * 100);

        cash = round2(cash + netPnL);

        trades.push({
          symbol,
          side: 'long',
          entryDate: dateStr,
          exitDate: dateStr,
          entryPrice: entryFill,
          exitPrice: exitFill,
          quantity,
          pnl: netPnL,
          pnlPercent: pnlPct,
          holdingDays: 0,
          exitReason,
        });
      }
    }

    equity = cash;
    maxEquity = Math.max(maxEquity, equity);
    const drawdown = (maxEquity - equity) / maxEquity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);

    equityCurve.push({ date: dateStr, equity, drawdown: drawdown * 100 });

    const monthKey = dateStr.slice(0, 7);
    if (!equityByMonth[monthKey]) equityByMonth[monthKey] = { start: equity, end: equity };
    equityByMonth[monthKey].end = equity;
  }

  const monthlyReturns: Record<string, number> = {};
  for (const [m, v] of Object.entries(equityByMonth)) {
    monthlyReturns[m] = round2(((v.end - v.start) / v.start) * 100);
  }

  const metrics = calculateMetrics(trades, config.initialCapital, equity, equityCurve);

  const excludedNote = excludedSectors && excludedSectors.length > 0
    ? ` (excl. ${excludedSectors.join(', ')})` : '';

  return {
    id: crypto.randomUUID(),
    name: `Portfolio Auto Mode — 25 Stocks${excludedNote}`,
    config,
    metrics,
    equityCurve,
    tradeLog: trades,
    monthlyReturns,
    createdAt: new Date(),
  };
}
