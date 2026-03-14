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
// target (ambiguous bar), the exit price is today's close — a neutral outcome
// that avoids both circular bias (bar-direction tie-break) and over-pessimism
// (stop-first tie-break). This is the standard daily-bar approximation.

import { NormalizedOHLCV } from '@/types/market';
import { BacktestConfig, BacktestResult, BacktestTrade, EquityPoint } from '@/types/backtest';
import { atr, ema } from '@/lib/analysis/indicators';
import { calculateMetrics } from './backtest-engine';
import { getSectorForSymbol } from '@/lib/trading/sector-mapping';
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';

export type IntradayStrategyType = 'gap_fade' | 'vwap_reversion' | 'orb' | 'auto_mode' | 'portfolio_auto_mode';

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
  ema9All: number[],
  ema21All: number[],
): DaySignal | null {
  if (i < 21) return null;
  const today = candles[i];
  const prev = candles[i - 1];

  // Daily trend gate — same filter as checkVWAPReversion and checkORB.
  // Avoids fading gaps on stocks already in a daily downtrend.
  const e9 = ema9All[i];
  const e21 = ema21All[i];
  if (!e9 || !e21 || e9 < e21 * 0.99) return null;

  const gapPct = ((today.open - prev.close) / prev.close) * 100;
  if (gapPct >= -1.5) return null; // need gap DOWN > 1.5%
  // Note: we do NOT check today.volume here — total day volume is only known
  // at 4pm, but gap fade entries happen at the 9:30am open.

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
// Uses PRIOR day's typical price (H+L+C)/3 as the VWAP proxy — the only
// VWAP approximation available at the 9:30am open without intraday data.
// Signal fires when today's open is ≥1.5% below that proxy (stock opened
// below VWAP, suggesting a tradeable reversion opportunity).
// EMA9 must be ≥ EMA21×0.99 (not in a daily downtrend).
// Entry = today's open; stop = open − 0.5×ATR; target = prevTypical.
//
// Note: Previous version required today.close > today.open (look-ahead bias —
// that condition can only be checked at 4pm, but entries happen at 9:30am).
// ---------------------------------------------------------------------------
function checkVWAPReversion(
  candles: NormalizedOHLCV[],
  i: number,
  ema9All: number[],
  ema21All: number[],
  atrValues: number[],
): DaySignal | null {
  if (i < 21) return null;
  const today = candles[i];
  const prev = candles[i - 1];

  // Daily trend gate (uses prior closes — no look-ahead)
  const e9 = ema9All[i];
  const e21 = ema21All[i];
  if (!e9 || !e21 || e9 < e21 * 0.99) return null;

  // VWAP proxy = 5-day volume-weighted typical price (more stable than single prior day).
  // Matches how institutional desks estimate fair value at the open.
  const lookback = candles.slice(Math.max(0, i - 5), i);
  let totalTPV = 0, totalVol = 0;
  for (const bar of lookback) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    totalTPV += tp * (bar.volume || 1);
    totalVol += (bar.volume || 1);
  }
  const prevTypical = totalVol > 0 ? totalTPV / totalVol : (prev.high + prev.low + prev.close) / 3;
  const openVsVwap = (prevTypical - today.open) / prevTypical;
  if (openVsVwap < 0.015) return null; // open must be ≥1.5% below prev VWAP

  // Prior-day confirmation: yesterday was bullish (available at 9:30am open).
  // Replaces today.close > today.open which was circular: entry=open, exit=close,
  // filter=close>open → time exits always profitable on selected bars.
  if (prev.close <= prev.open) return null;

  const currentATR = atrValues[i] > 0 ? atrValues[i] : prev.close * 0.02;
  const entry = round2(today.open);
  const stop = round2(entry - currentATR * 0.5);
  const target = round2(prevTypical);

  if (target <= entry || stop >= entry) return null;

  const rr = round2((target - entry) / (entry - stop));
  if (rr < 1.0) return null;

  return { signalType: 'vwap_reversion', entry, stop, target, rr, quality: qualityFromRR(rr) };
}

// ---------------------------------------------------------------------------
// Signal 3 — Opening Range Breakout (ORB)
// Signal condition: prior day was bullish (prev.close > prev.open) — momentum
// context known before the open, no EOD look-ahead.
// Entry = today.open; stop = open − 0.5×ATR; target = open + 1.5×ATR (3:1 R:R).
//
// Previous design used stop=orbMid and target=orbHigh+1.5×orbRange, both
// computed from today's OHLC range — guaranteeing stopHit=true (stop > day low)
// and targetHit=true (target ≤ day high) on every bar, producing 100% win rates.
// ATR-based levels fix this: stops and targets are realistically hit ~30-40% each.
// ---------------------------------------------------------------------------
function checkORB(
  candles: NormalizedOHLCV[],
  i: number,
  atrValues: number[],
  ema9All: number[],
  ema21All: number[],
): DaySignal | null {
  if (i < 21) return null;
  const today = candles[i];
  const prev = candles[i - 1];

  // Uptrend gate — same as VWAP (restricts to stocks in actual uptrend)
  const e9 = ema9All[i];
  const e21 = ema21All[i];
  if (!e9 || !e21 || e9 < e21 * 0.99) return null;

  // Prior day bullish — momentum context for ORB (uses only prior-bar data)
  if (prev.close <= prev.open) return null;

  const currentATR = atrValues[i] > 0 ? atrValues[i] : prev.close * 0.02;
  const entry = round2(today.open);
  const stop = round2(entry - currentATR * 0.5);
  const target = round2(entry + currentATR * 1.5);

  if (target <= entry || stop >= entry) return null;

  const rr = round2((target - entry) / (entry - stop)); // ~3.0
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
    // Bar-direction tie-break. The prior look-ahead filter (today.close > today.open)
    // that made this circular has been removed — entry conditions now only use
    // prior-bar data (prev.close > prev.open), so today's bar color is independent.
    // Bearish bar: price dropped first to stop, then partially recovered → stop.
    // Bullish bar: price rose first to target, then pulled back → target.
    if (today.close < today.open) {
      return { exitPrice: signal.stop, exitReason: 'stop' };
    } else {
      return { exitPrice: signal.target, exitReason: 'target' };
    }
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
  spyCandles?: NormalizedOHLCV[],
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

  // SPY regime gate: skip long entries when SPY is below its 20-day EMA.
  // EMA is computed on the FULL SPY history (not just the backtest window) so that
  // the indicator is warmed up even on the first day of the backtest period.
  const spyAllCandles = spyCandles ?? [];
  const spyEma50Full = spyAllCandles.length >= 50 ? ema(spyAllCandles.map(c => c.close), 50) : [];
  const spyDateMap = new Map<string, { close: number; ema50: number }>();
  spyAllCandles.forEach((c, idx) => {
    const d = new Date(c.timestamp);
    if (d >= startDate && d <= endDate) {
      spyDateMap.set(d.toISOString().split('T')[0], { close: c.close, ema50: spyEma50Full[idx] ?? NaN });
    }
  });

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

    // Skip long entries on days when SPY is below its 50-day EMA (bearish regime).
    // 50-day is more robust than 20-day — avoids re-entry on brief recovery bounces.
    const spyDay = spyDateMap.get(currentDate);
    if (spyDay && !isNaN(spyDay.ema50) && spyDay.close < spyDay.ema50) {
      equity = cash;
      maxEquity = Math.max(maxEquity, equity);
      const drawdown = (maxEquity - equity) / maxEquity;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      equityCurve.push({ date: currentDate, equity, drawdown: drawdown * 100 });
      const monthKey = currentDate.slice(0, 7);
      if (!equityByMonth[monthKey]) equityByMonth[monthKey] = { start: equity, end: equity };
      equityByMonth[monthKey].end = equity;
      continue;
    }

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
  spyCandles?: NormalizedOHLCV[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — Gap Fade`,
    (i, cs, atrs, e9, e21) => checkGapFade(cs, i, atrs, e9, e21),
    'fair',
    excludedSectors,
    spyCandles,
  );
}

export function runVWAPReversionBacktest(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  excludedSectors?: string[],
  spyCandles?: NormalizedOHLCV[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — VWAP Reversion`,
    (i, cs, atrs, e9, e21) => checkVWAPReversion(cs, i, e9, e21, atrs),
    'fair',
    excludedSectors,
    spyCandles,
  );
}

export function runORBBacktest(
  symbol: string,
  candles: NormalizedOHLCV[],
  config: BacktestConfig,
  excludedSectors?: string[],
  spyCandles?: NormalizedOHLCV[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — ORB`,
    (i, cs, atrs, e9, e21) => checkORB(cs, i, atrs, e9, e21),
    'fair',
    excludedSectors,
    spyCandles,
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
  spyCandles?: NormalizedOHLCV[],
): BacktestResult {
  return simulate(
    symbol, candles, config,
    `${symbol} — Auto Mode (Gap Fade + VWAP + ORB)`,
    (i, cs, atrs, e9, e21) => {
      const candidates = [
        checkGapFade(cs, i, atrs, e9, e21),
        checkVWAPReversion(cs, i, e9, e21, atrs),
        checkORB(cs, i, atrs, e9, e21),
      ].filter((s): s is DaySignal => s !== null);
      if (candidates.length === 0) return null;
      // Rank by R:R descending; auto-trade picks best signal per session
      return candidates.sort((a, b) => b.rr - a.rr)[0];
    },
    'good', // matches AUTO_TRADE_MIN_QUALITY default
    excludedSectors,
    spyCandles,
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
  spyCandles?: NormalizedOHLCV[],
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

  // SPY regime gate: precompute EMA-20 on FULL SPY history so it's warmed up
  // from day 1 of the backtest window (not just within the filtered range).
  const spyAllCandles = spyCandles ?? [];
  const spyEma50Full = spyAllCandles.length >= 50 ? ema(spyAllCandles.map(c => c.close), 50) : [];
  const spyDateMap = new Map<string, { close: number; ema50: number }>();
  spyAllCandles.forEach((c, idx) => {
    const d = new Date(c.timestamp);
    if (d >= startDate && d <= endDate) {
      spyDateMap.set(d.toISOString().split('T')[0], { close: c.close, ema50: spyEma50Full[idx] ?? NaN });
    }
  });

  for (const dateStr of masterDates) {
    // Skip long entries on days when SPY is below its 50-day EMA (bearish regime).
    const spyDay = spyDateMap.get(dateStr);
    if (spyDay && !isNaN(spyDay.ema50) && spyDay.close < spyDay.ema50) {
      equity = cash;
      maxEquity = Math.max(maxEquity, equity);
      const drawdown = (maxEquity - equity) / maxEquity;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      equityCurve.push({ date: dateStr, equity, drawdown: drawdown * 100 });
      const monthKey = dateStr.slice(0, 7);
      if (!equityByMonth[monthKey]) equityByMonth[monthKey] = { start: equity, end: equity };
      equityByMonth[monthKey].end = equity;
      continue;
    }

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
        checkGapFade(sd.candles, idx, sd.atrValues, sd.ema9All, sd.ema21All),
        checkVWAPReversion(sd.candles, idx, sd.ema9All, sd.ema21All, sd.atrValues),
        checkORB(sd.candles, idx, sd.atrValues, sd.ema9All, sd.ema21All),
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

  // Build SPY buy-and-hold benchmark curve.
  // Prefer explicitly-provided spyCandles (guaranteed fetch from route) over
  // symbolDataMap.get('SPY') which can silently fail in the 64-parallel fetch.
  let benchmarkCurve: EquityPoint[] | undefined;
  let spyBenchmarkCandles: NormalizedOHLCV[] | undefined;
  if (spyCandles && spyCandles.length >= 2) {
    // Filter provided candles to the backtest date range
    spyBenchmarkCandles = spyCandles.filter(c => {
      const d = new Date(c.timestamp);
      return d >= startDate && d <= endDate;
    });
  } else {
    // Fallback: use already-filtered SPY from symbolDataMap
    spyBenchmarkCandles = symbolDataMap.get('SPY')?.candles;
  }
  if (spyBenchmarkCandles && spyBenchmarkCandles.length >= 2) {
    const spyStart = spyBenchmarkCandles[0].close;
    const spyByDate = new Map<string, number>();
    for (const c of spyBenchmarkCandles) {
      spyByDate.set(new Date(c.timestamp).toISOString().split('T')[0], c.close);
    }
    let spyMaxEquity = config.initialCapital;
    benchmarkCurve = masterDates.map(dateStr => {
      const spyClose = spyByDate.get(dateStr);
      const benchEquity = spyClose !== undefined
        ? round2(config.initialCapital * (spyClose / spyStart))
        : config.initialCapital;
      spyMaxEquity = Math.max(spyMaxEquity, benchEquity);
      const drawdown = spyMaxEquity > 0 ? (spyMaxEquity - benchEquity) / spyMaxEquity * 100 : 0;
      return { date: dateStr, equity: benchEquity, drawdown };
    });
  }

  const excludedNote = excludedSectors && excludedSectors.length > 0
    ? ` (excl. ${excludedSectors.join(', ')})` : '';

  return {
    id: crypto.randomUUID(),
    name: `Portfolio Auto Mode — ${INTRADAY_WATCHLIST.length} Stocks${excludedNote}`,
    config,
    metrics,
    equityCurve,
    benchmarkCurve,
    tradeLog: trades,
    monthlyReturns,
    createdAt: new Date(),
  };
}
