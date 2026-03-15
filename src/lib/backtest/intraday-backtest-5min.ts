// src/lib/backtest/intraday-backtest-5min.ts
//
// Portfolio backtester using real 5-minute bars.
//
// Uses the EXACT same signal detection functions as the live engine:
//   detectGapFade, detectVWAPReversion, detectORB from intraday-signals.ts
//
// This ensures parameter optimization via grid search translates directly to
// live trading performance — the backtest IS the same code path as live trading.
//
// Signal checkpoints per symbol per day (matching live cron schedule):
//   A  9:35 AM — detectGapFade          (bars[0:1], 1 bar)
//   B  9:47 AM — detectVWAPReversion
//              + detectORB              (bars[0:4], 4 bars)
//   C 10:30 AM — detectVWAPReversion    (bars[0:12], 12 bars)
//   D 11:00 AM — detectVWAPReversion    (bars[0:18], 18 bars)
//
// Exit simulation mirrors the position monitor's trailing stop logic:
//   price @ 1R  → stop moves to breakeven (+5% buffer)
//   price @ 1.5R → stop locks in 0.75R
//   price @ 2R  → stop locks in 1.5R
//   EOD exit at 15:45 ET (same as live eod-cleanup at 3:45 PM)

import { NormalizedOHLCV } from '@/types/market';
import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  BreakdownEntry,
  EquityPoint,
  GridSearchResult,
  SignalParams,
} from '@/types/backtest';
import { atr as calcATR, ema } from '@/lib/analysis/indicators';
import { calculateMetrics } from './backtest-engine';
import { getSectorForSymbol } from '@/lib/trading/sector-mapping';
import { INTRADAY_WATCHLIST } from '@/lib/analysis/screener';
import { calculatePositionSize } from '@/lib/trading/position-sizing';
import {
  detectGapFade,
  detectVWAPReversion,
  detectORB,
  IntradaySignal,
} from '@/lib/analysis/intraday-signals';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const QUALITY_RANK: Record<string, number> = { excellent: 3, good: 2, fair: 1, poor: 0 };

// ---------------------------------------------------------------------------
// ET time helpers
// ---------------------------------------------------------------------------

/** Convert a UTC Date to ET (EDT = UTC-4, Mar–Nov; EST = UTC-5 otherwise). */
function toET(utcDate: Date): Date {
  const month = utcDate.getUTCMonth(); // 0-based
  const isDST = month >= 2 && month <= 10;
  return new Date(utcDate.getTime() - (isDST ? 4 : 5) * 3600 * 1000);
}

/** Get the ET date string 'YYYY-MM-DD' for a UTC timestamp. */
function utcToETDateStr(utcDate: Date): string {
  const et = toET(utcDate);
  return et.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Public: groupBarsByDate
// ---------------------------------------------------------------------------

/**
 * Groups a flat array of 5-min bars by ET trading date ('YYYY-MM-DD').
 * Each value array is sorted ascending by timestamp.
 */
export function groupBarsByDate(bars: NormalizedOHLCV[]): Map<string, NormalizedOHLCV[]> {
  const map = new Map<string, NormalizedOHLCV[]>();
  for (const bar of bars) {
    const ts = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
    const dateStr = utcToETDateStr(ts);
    if (!map.has(dateStr)) map.set(dateStr, []);
    map.get(dateStr)!.push(bar);
  }
  for (const [, dayBars] of map) {
    dayBars.sort((a, b) => {
      const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      return ta - tb;
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public: simulate5minExit
// ---------------------------------------------------------------------------

/**
 * Simulates a trade exit bar-by-bar, mirroring the position monitor's
 * trailing stop logic exactly.
 *
 * @param signal          The triggered IntradaySignal (entry / stop / target)
 * @param barsAfterEntry  5-min bars starting from the bar AFTER the entry bar
 */
export function simulate5minExit(
  signal: IntradaySignal,
  barsAfterEntry: NormalizedOHLCV[],
  opts?: { startingStop?: number; startingTrailLevel?: number },
): { exitPrice: number; exitReason: BacktestTrade['exitReason']; effectiveStop: number; trailingLevel: number } {
  const { entry, stop: initialStop, target } = signal;
  const initialRisk = entry - initialStop;
  if (initialRisk <= 0 || barsAfterEntry.length === 0) {
    return { exitPrice: entry, exitReason: 'time', effectiveStop: initialStop, trailingLevel: 0 };
  }

  let effectiveStop = opts?.startingStop ?? initialStop;
  let trailingLevel = opts?.startingTrailLevel ?? 0; // 0 = initial, 1 = breakeven, 2 = 0.75R, 3 = 1.5R

  for (const bar of barsAfterEntry) {
    const ts = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
    const etTime = toET(ts);

    // EOD exit: bar starts at or after 15:45 ET → exit at bar open
    const etH = etTime.getUTCHours();
    const etM = etTime.getUTCMinutes();
    if (etH > 15 || (etH === 15 && etM >= 45)) {
      return { exitPrice: round2(bar.open), exitReason: 'time', effectiveStop, trailingLevel };
    }

    // Update trailing stop based on max bar-high R-multiple
    const barHighR = (bar.high - entry) / initialRisk;
    if (barHighR >= 2.0 && trailingLevel < 3) {
      effectiveStop = entry + initialRisk * 1.5;
      trailingLevel = 3;
    } else if (barHighR >= 1.5 && trailingLevel < 2) {
      effectiveStop = entry + initialRisk * 0.75;
      trailingLevel = 2;
    } else if (barHighR >= 1.0 && trailingLevel < 1) {
      effectiveStop = entry + initialRisk * 0.05;
      trailingLevel = 1;
    }

    const hitStop   = bar.low  <= effectiveStop;
    const hitTarget = bar.high >= target;

    if (hitStop && hitTarget) {
      // Ambiguous bar: both levels touched — exit at close (neutral convention)
      return { exitPrice: round2(bar.close), exitReason: 'time', effectiveStop, trailingLevel };
    }
    if (hitTarget) {
      return { exitPrice: round2(target), exitReason: 'target', effectiveStop, trailingLevel };
    }
    if (hitStop) {
      return {
        exitPrice: round2(effectiveStop),
        exitReason: trailingLevel > 0 ? 'trailing_stop' : 'stop',
        effectiveStop,
        trailingLevel,
      };
    }
  }

  // Remaining bars exhausted without a trigger (end of session)
  const lastBar = barsAfterEntry[barsAfterEntry.length - 1];
  return { exitPrice: round2(lastBar.close), exitReason: 'time', effectiveStop, trailingLevel };
}

// ---------------------------------------------------------------------------
// Internal: IEX volume helper
// ---------------------------------------------------------------------------

/**
 * Computes average daily volume from 5-min IEX bars (last ≤20 days).
 * Used instead of Alpha Vantage avgDailyVolume (SIP) to avoid IEX/SIP
 * mismatch: IEX bars have ~15% of SIP volume, so comparing against an AV
 * baseline would always produce volumeRatio ≈ 0.15 — far below the 1.2×
 * threshold in detectGapFade/detectORB.
 */
/**
 * Returns a map of dateStr → 20-day trailing average IEX daily volume up to (but not including) that date.
 * Using a rolling window eliminates look-ahead bias: comparing Sep 2025 bars against a Feb 2026
 * high-volatility baseline would inflate the denominator and cause volumeRatio < 1.2x → 0 gap_fades.
 * For the first days (< 5 prior days), falls back to the global dataset median.
 */
function buildRollingAvgVolMap(dateMap: Map<string, NormalizedOHLCV[]>): Map<string, number> {
  const sortedDates = [...dateMap.keys()].sort();
  const dailyTotals = sortedDates.map(d => dateMap.get(d)!.reduce((s, b) => s + b.volume, 0));

  // Global median as fallback for early dates with insufficient history
  const sorted = [...dailyTotals].sort((a, b) => a - b);
  const globalMedian = sorted[Math.floor(sorted.length / 2)] ?? 0;

  const result = new Map<string, number>();
  const WINDOW = 20;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i < 5) {
      result.set(sortedDates[i], globalMedian);
    } else {
      const start = Math.max(0, i - WINDOW);
      const slice = dailyTotals.slice(start, i); // prior days only — no look-ahead
      result.set(sortedDates[i], slice.reduce((s, v) => s + v, 0) / slice.length);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Internal: per-symbol daily context
// ---------------------------------------------------------------------------

interface DailyContext {
  prevClose: number;
  avgDailyVolume: number;
  dailyTrendOk: boolean;
  atr14: number; // 14-day ATR in dollars (for atrGatePct filter)
}

/**
 * Precompute daily context for each trading date, indexed by 'YYYY-MM-DD'.
 * Uses daily candles to derive prevClose, 20-day avg volume, EMA9/EMA21, ATR14.
 */
function buildDailyContextMap(dailyCandles: NormalizedOHLCV[]): Map<string, DailyContext> {
  if (dailyCandles.length < 21) return new Map();

  const sorted = [...dailyCandles].sort((a, b) => {
    const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
    return ta - tb;
  });

  const closes = sorted.map(c => c.close);
  const ema9All  = ema(closes, 9);
  const ema21All = ema(closes, 21);
  const atr14All = calcATR(sorted, 14);

  const contextMap = new Map<string, DailyContext>();
  for (let i = 21; i < sorted.length; i++) {
    const dateStr = new Date(sorted[i].timestamp).toISOString().split('T')[0];
    const prevClose = sorted[i - 1].close;

    let volSum = 0, volCount = 0;
    for (let j = Math.max(0, i - 20); j < i; j++) {
      volSum += sorted[j].volume;
      volCount++;
    }
    const avgDailyVolume = volCount > 0 ? volSum / volCount : 0;

    const e9  = ema9All[i];
    const e21 = ema21All[i];
    const dailyTrendOk = !!(e9 && e21 && e9 >= e21 * 0.99);

    const atr14 = atr14All[i] ?? (prevClose * 0.02);

    contextMap.set(dateStr, { prevClose, avgDailyVolume, dailyTrendOk, atr14 });
  }
  return contextMap;
}

// ---------------------------------------------------------------------------
// Internal: breakdown helper
// ---------------------------------------------------------------------------

function buildBreakdown(
  trades: BacktestTrade[],
  key: (t: BacktestTrade) => string,
): Record<string, BreakdownEntry> {
  const map = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    const k = key(t);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  const result: Record<string, BreakdownEntry> = {};
  for (const [k, ts] of map) {
    const wins   = ts.filter(t => t.pnl > 0);
    const losses = ts.filter(t => t.pnl <= 0);
    const grossWin  = wins.reduce((s, t) => s + t.pnlPercent, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0));
    result[k] = {
      trades: ts.length,
      wins: wins.length,
      losses: losses.length,
      winRate: ts.length > 0 ? round2((wins.length / ts.length) * 100) : 0,
      totalPnlPct: round2(ts.reduce((s, t) => s + t.pnlPercent, 0)),
      avgWin:  wins.length   > 0 ? round2(grossWin  / wins.length)   : 0,
      avgLoss: losses.length > 0 ? round2(-grossLoss / losses.length) : 0,
      profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : grossWin > 0 ? 99 : 0,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Overnight hold constants and interface
// ---------------------------------------------------------------------------

const OVERNIGHT_HOLD_R_MIN = 1.5;
const MAX_HOLD_DAYS = 3;

interface CarriedPosition {
  signal: IntradaySignal;
  entryDate: string;
  entryFill: number;
  effectiveStop: number;
  trailingLevel: number;
  daysHeld: number;
  sector: string;
  qty: number;
}

// ---------------------------------------------------------------------------
// Public: runPortfolio5minBacktest
// ---------------------------------------------------------------------------

/**
 * Runs the 5-min bar portfolio backtest using the EXACT same signal detection
 * functions as the live engine.
 *
 * @param allBars5minMap   symbol → dateStr → sorted 5-min bars
 * @param dailyCandlesMap  symbol → full daily OHLCV history (for context)
 * @param config           BacktestConfig (dates, capital, sizing params)
 * @param excludedSectors  Optional sector blocklist (same as live knob 2)
 * @param spyCandles       Full SPY daily history (for regime gate + benchmark)
 * @param signalParams     SignalParams to apply (gates quality, gap threshold, etc.)
 */
export function runPortfolio5minBacktest(
  allBars5minMap: Map<string, Map<string, NormalizedOHLCV[]>>,
  dailyCandlesMap: Map<string, NormalizedOHLCV[]>,
  config: BacktestConfig,
  excludedSectors: string[] | undefined,
  spyCandles: NormalizedOHLCV[] | undefined,
  signalParams: SignalParams,
): BacktestResult {
  const startDate = new Date(config.startDate);
  const endDate   = new Date(config.endDate);

  // Precompute daily context (prevClose, avgVol, trend, ATR) per symbol
  const symbolContextMaps = new Map<string, Map<string, DailyContext>>();
  for (const symbol of INTRADAY_WATCHLIST) {
    const daily = dailyCandlesMap.get(symbol);
    if (daily && daily.length >= 22) {
      symbolContextMaps.set(symbol, buildDailyContextMap(daily));
    }
  }

  // Precompute rolling IEX-based avg daily volume per symbol × date.
  // Using a rolling 20-day prior-only baseline avoids look-ahead bias:
  // if late-dataset days have elevated volume (e.g., tariff selloff), that
  // cannot inflate the baseline for earlier dates.
  const symbolRollingVolMaps = new Map<string, Map<string, number>>();
  for (const [sym, dateMap] of allBars5minMap) {
    symbolRollingVolMaps.set(sym, buildRollingAvgVolMap(dateMap));
  }

  const carriedPositions = new Map<string, CarriedPosition>();

  // SPY regime gate: EMA-20 (faster than EMA-50) on full history so it is warmed up from day 1.
  // EMA-20 recovers within ~4 weeks of a bottom vs EMA-50 which takes ~10 weeks.
  // Gate fires only when SPY is meaningfully below EMA20 (> 1% below) to avoid
  // blocking on minor dips — keeps more trading days open.
  const spyAllCandles = spyCandles ?? [];
  const spyEma20Full  = spyAllCandles.length >= 20 ? ema(spyAllCandles.map(c => c.close), 20) : [];
  const spyDateMap = new Map<string, { close: number; ema20: number }>();
  spyAllCandles.forEach((c, idx) => {
    const d = new Date(c.timestamp);
    if (d >= startDate && d <= endDate) {
      spyDateMap.set(d.toISOString().split('T')[0], {
        close: c.close,
        ema20: spyEma20Full[idx] ?? NaN,
      });
    }
  });

  // Build master date list from all 5-min dates within the range
  const allDatesSet = new Set<string>();
  for (const dateMap of allBars5minMap.values()) {
    for (const dateStr of dateMap.keys()) {
      const d = new Date(dateStr);
      if (d >= startDate && d <= endDate) allDatesSet.add(dateStr);
    }
  }
  const masterDates = [...allDatesSet].sort();

  const { minQuality, enabledSignals } = signalParams;
  const minQualityRank = QUALITY_RANK[minQuality] ?? QUALITY_RANK.good;

  let cash     = config.initialCapital;
  let equity   = config.initialCapital;
  let maxEquity = config.initialCapital;
  let maxDrawdown = 0;

  const trades: BacktestTrade[]     = [];
  const equityCurve: EquityPoint[]  = [];
  const equityByMonth: Record<string, { start: number; end: number }> = {};

  for (const dateStr of masterDates) {
    // Process carried positions from prior day(s)
    for (const [symbol, carried] of carriedPositions) {
      const ctx = symbolContextMaps.get(symbol)?.get(dateStr);
      const dayBars = allBars5minMap.get(symbol)?.get(dateStr);
      const spyDay = spyDateMap.get(dateStr);
      const spyBearish = spyDay && !isNaN(spyDay.ema20) && spyDay.close < spyDay.ema20 * 0.99;

      if (spyBearish || !dayBars || dayBars.length === 0) {
        // Force-close: adverse market regime or no data
        const exitPrice = ctx?.prevClose ?? carried.effectiveStop;
        const slip = config.slippageBps / 10000;
        const exitFill = round2(exitPrice * (1 - slip));
        const commissionCost = (carried.entryFill + exitFill) * carried.qty * config.commission;
        const netPnL = round2((exitFill - carried.entryFill) * carried.qty - commissionCost);
        const pnlPct = round2((exitFill - carried.entryFill) / carried.entryFill * 100);
        cash = round2(cash + netPnL);
        trades.push({
          symbol,
          side: 'long',
          entryDate: carried.entryDate,
          exitDate: dateStr,
          entryPrice: carried.entryFill,
          exitPrice: exitFill,
          quantity: carried.qty,
          pnl: netPnL,
          pnlPercent: pnlPct,
          holdingDays: carried.daysHeld,
          exitReason: 'time',
          signalType: carried.signal.signalType,
        });
        carriedPositions.delete(symbol);
      } else {
        // Simulate full day with the carried stop/trail state
        const { exitPrice, exitReason, effectiveStop, trailingLevel } = simulate5minExit(
          carried.signal,
          dayBars,
          { startingStop: carried.effectiveStop, startingTrailLevel: carried.trailingLevel },
        );
        const initialRisk = carried.signal.entry - carried.signal.stop;
        const currentR = initialRisk > 0 ? (exitPrice - carried.entryFill) / initialRisk : 0;
        const canCarryAgain =
          exitReason === 'time' &&
          currentR >= OVERNIGHT_HOLD_R_MIN &&
          carried.daysHeld < MAX_HOLD_DAYS &&
          (ctx?.dailyTrendOk ?? false);

        if (canCarryAgain) {
          carriedPositions.set(symbol, {
            ...carried,
            effectiveStop,
            trailingLevel,
            daysHeld: carried.daysHeld + 1,
          });
        } else {
          const slip = config.slippageBps / 10000;
          const exitFill = round2(exitPrice * (1 - slip));
          const commissionCost = (carried.entryFill + exitFill) * carried.qty * config.commission;
          const netPnL = round2((exitFill - carried.entryFill) * carried.qty - commissionCost);
          const pnlPct = round2((exitFill - carried.entryFill) / carried.entryFill * 100);
          cash = round2(cash + netPnL);
          trades.push({
            symbol,
            side: 'long',
            entryDate: carried.entryDate,
            exitDate: dateStr,
            entryPrice: carried.entryFill,
            exitPrice: exitFill,
            quantity: carried.qty,
            pnl: netPnL,
            pnlPercent: pnlPct,
            holdingDays: carried.daysHeld,
            exitReason,
            signalType: carried.signal.signalType,
          });
          carriedPositions.delete(symbol);
        }
      }
    }

    // SPY regime gate: skip long entries when SPY is > 1% below EMA-20
    const spyDay = spyDateMap.get(dateStr);
    if (spyDay && !isNaN(spyDay.ema20) && spyDay.close < spyDay.ema20 * 0.99) {
      equity = cash;
      maxEquity = Math.max(maxEquity, equity);
      const drawdown = (maxEquity - equity) / maxEquity;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      equityCurve.push({ date: dateStr, equity, drawdown: drawdown * 100 });
      const mk = dateStr.slice(0, 7);
      if (!equityByMonth[mk]) equityByMonth[mk] = { start: equity, end: equity };
      equityByMonth[mk].end = equity;
      continue;
    }

    // Collect candidate signals for this day across all watchlist symbols
    interface Candidate {
      symbol: string;
      sector: string;
      signal: IntradaySignal;
      entryBarIndex: number; // index of last bar in signal slice; exit starts at [+1]
      dayBars: NormalizedOHLCV[];
      dailyTrendOk: boolean;
    }
    const candidates: Candidate[] = [];

    for (const symbol of INTRADAY_WATCHLIST) {
      // Sector exclusion
      const sector = getSectorForSymbol(symbol);
      if (excludedSectors && excludedSectors.includes(sector)) continue;

      // Get today's 5-min bars
      const dateMap = allBars5minMap.get(symbol);
      if (!dateMap) continue;
      const dayBars = dateMap.get(dateStr);
      if (!dayBars || dayBars.length < 2) continue;

      // Daily context (prevClose, avgVol, trend, ATR14)
      const ctxMap = symbolContextMaps.get(symbol);
      if (!ctxMap) continue;
      const ctx = ctxMap.get(dateStr);
      if (!ctx || ctx.prevClose <= 0) continue;

      // ATR gate: skip low-volatility symbols (same as daily backtester)
      const atrPct = (ctx.atr14 / ctx.prevClose) * 100;
      if (atrPct < signalParams.atrGatePct) continue;

      // Use rolling IEX-based volume baseline (prior 20 days, no look-ahead).
      // Falls back to Alpha Vantage (SIP) volume if IEX baseline isn't available.
      const avgDailyVolIEX = symbolRollingVolMaps.get(symbol)?.get(dateStr) ?? ctx.avgDailyVolume;

      let candidate: { signal: IntradaySignal; entryBarIndex: number } | null = null;

      // ---- Checkpoint A: 9:35 AM — gap fade (bars[0:1], 1 bar) ----
      if (!candidate && enabledSignals.includes('gap_fade') && dayBars.length >= 1) {
        const s = detectGapFade(
          symbol,
          dayBars.slice(0, 1),
          ctx.prevClose,
          avgDailyVolIEX,
          ctx.dailyTrendOk,
          signalParams.gapThresholdPct,
        );
        if (s.triggered && QUALITY_RANK[s.tradeQuality] >= minQualityRank) {
          candidate = { signal: s, entryBarIndex: 0 };
        }
      }

      // ---- Checkpoint B: 9:47–9:50 AM — VWAP + ORB (bars[0:4], 4 bars) ----
      if (!candidate && dayBars.length >= 4) {
        const slice4 = dayBars.slice(0, 4);
        // currentTimeET for detectORB = end of bar 4 (bar starts at 9:45, ends at 9:50)
        const bar4Ts = slice4[3].timestamp instanceof Date
          ? slice4[3].timestamp : new Date(slice4[3].timestamp);
        const currentTimeET = toET(new Date(bar4Ts.getTime() + 5 * 60 * 1000));

        if (!candidate && enabledSignals.includes('vwap_reversion')) {
          const s = detectVWAPReversion(symbol, slice4, ctx.dailyTrendOk);
          if (s.triggered && QUALITY_RANK[s.tradeQuality] >= minQualityRank) {
            candidate = { signal: s, entryBarIndex: 3 };
          }
        }
        if (!candidate && enabledSignals.includes('orb')) {
          const s = detectORB(symbol, slice4, avgDailyVolIEX, currentTimeET);
          if (s.triggered && QUALITY_RANK[s.tradeQuality] >= minQualityRank) {
            candidate = { signal: s, entryBarIndex: 3 };
          }
        }
      }

      // ---- VWAP checkpoints: hourly from 10:00 AM to 15:00 PM ----
      // Each checkpoint tests whether a VWAP reversion setup has formed using
      // all bars from open up to that point. The first qualifying checkpoint wins.
      // Bar counts: 10:00=6, 10:30=12, 11:00=18, 11:30=24, 12:00=30,
      //             12:30=36, 13:00=42, 13:30=48, 14:00=54, 14:30=60, 15:00=66
      if (enabledSignals.includes('vwap_reversion')) {
        const vwapCheckpoints = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66];
        for (const barCount of vwapCheckpoints) {
          if (candidate) break;
          if (dayBars.length < barCount) break;
          const s = detectVWAPReversion(symbol, dayBars.slice(0, barCount), ctx.dailyTrendOk);
          if (s.triggered && QUALITY_RANK[s.tradeQuality] >= minQualityRank) {
            candidate = { signal: s, entryBarIndex: barCount - 1 };
          }
        }
      }

      if (candidate) {
        candidates.push({
          symbol,
          sector,
          signal: candidate.signal,
          entryBarIndex: candidate.entryBarIndex,
          dayBars,
          dailyTrendOk: ctx.dailyTrendOk,
        });
      }
    }

    // Sort candidates by R:R descending; take top config.maxPositions with sector dedup
    candidates.sort((a, b) => b.signal.riskRewardRatio - a.signal.riskRewardRatio);

    const takenSectors = new Set<string>([...carriedPositions.values()].map(c => c.sector));
    const takenSymbols = new Set<string>(carriedPositions.keys());
    let positionsThisDay = carriedPositions.size; // carried positions count against limit

    for (const cand of candidates) {
      if (positionsThisDay >= config.maxPositions) break;
      if (takenSectors.has(cand.sector) || takenSymbols.has(cand.symbol)) continue;

      takenSectors.add(cand.sector);
      takenSymbols.add(cand.symbol);
      positionsThisDay++;

      const { signal, entryBarIndex, dayBars, dailyTrendOk } = cand;
      const barsAfterEntry = dayBars.slice(entryBarIndex + 1);

      // Risk-parity position sizing (matches live engine)
      const stopDistance = Math.max(signal.entry - signal.stop, signal.entry * 0.005);
      const { shares: qty } = calculatePositionSize({
        accountValue:  equity,
        entryPrice:    signal.entry,
        stopDistance,
        riskPerTrade:  config.riskPerTradePct ?? 0.01,
        maxPositionPct: config.maxPositionPct ?? 0.20,
      });

      if (qty <= 0 || cash < qty * signal.entry) continue;

      const { exitPrice, exitReason, effectiveStop, trailingLevel } = simulate5minExit(signal, barsAfterEntry);

      const slip = config.slippageBps / 10000;
      const entryFill = round2(signal.entry * (1 + slip));

      // Overnight hold: if position exits at EOD with ≥ 1.5R gain and daily trend is still bullish, carry overnight
      const initialRisk = signal.entry - signal.stop;
      const currentR = initialRisk > 0 ? (exitPrice - signal.entry) / initialRisk : 0;
      const shouldHoldOvernight = exitReason === 'time'
        && currentR >= OVERNIGHT_HOLD_R_MIN
        && dailyTrendOk;

      if (shouldHoldOvernight) {
        carriedPositions.set(cand.symbol, {
          signal,
          entryDate: dateStr,
          entryFill,
          effectiveStop,
          trailingLevel,
          daysHeld: 1,
          sector: cand.sector,
          qty,
        });
        // Cash NOT updated yet — position still open
      } else {
        const exitFill  = round2(exitPrice   * (1 - slip));
        const commissionCost = (entryFill + exitFill) * qty * config.commission;
        const netPnL  = round2((exitFill - entryFill) * qty - commissionCost);
        const pnlPct  = round2((exitFill - entryFill) / entryFill * 100);
        cash = round2(cash + netPnL);
        trades.push({
          symbol: cand.symbol,
          side: 'long',
          entryDate: dateStr,
          exitDate:  dateStr,
          entryPrice: entryFill,
          exitPrice:  exitFill,
          quantity:   qty,
          pnl:        netPnL,
          pnlPercent: pnlPct,
          holdingDays: 0,
          exitReason,
          signalType: signal.signalType,
        });
      }
    }

    equity = cash;
    maxEquity = Math.max(maxEquity, equity);
    const drawdown = (maxEquity - equity) / maxEquity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);

    equityCurve.push({ date: dateStr, equity, drawdown: drawdown * 100 });
    const mk = dateStr.slice(0, 7);
    if (!equityByMonth[mk]) equityByMonth[mk] = { start: equity, end: equity };
    equityByMonth[mk].end = equity;
  }

  // Close remaining carried positions at end of backtest
  const lastDate = masterDates[masterDates.length - 1] ?? config.endDate;
  for (const [symbol, carried] of carriedPositions) {
    const dailyCandles = dailyCandlesMap.get(symbol);
    const lastClose = dailyCandles && dailyCandles.length > 0
      ? dailyCandles[dailyCandles.length - 1].close
      : carried.effectiveStop;
    const slip = config.slippageBps / 10000;
    const exitFill = round2(lastClose * (1 - slip));
    const commCost = (carried.entryFill + exitFill) * carried.qty * config.commission;
    const netPnL = round2((exitFill - carried.entryFill) * carried.qty - commCost);
    const pnlPct = round2((exitFill - carried.entryFill) / carried.entryFill * 100);
    cash = round2(cash + netPnL);
    trades.push({
      symbol, side: 'long',
      entryDate: carried.entryDate, exitDate: lastDate,
      entryPrice: carried.entryFill, exitPrice: exitFill,
      quantity: carried.qty, pnl: netPnL, pnlPercent: pnlPct,
      holdingDays: carried.daysHeld, exitReason: 'time',
      signalType: carried.signal.signalType,
    });
  }
  carriedPositions.clear();

  // Monthly returns
  const monthlyReturns: Record<string, number> = {};
  for (const [m, v] of Object.entries(equityByMonth)) {
    monthlyReturns[m] = round2(((v.end - v.start) / v.start) * 100);
  }

  const metrics = calculateMetrics(trades, config.initialCapital, equity, equityCurve);

  // SPY buy-and-hold benchmark curve
  let benchmarkCurve: EquityPoint[] | undefined;
  if (spyCandles && spyCandles.length >= 2) {
    const spyInRange = spyCandles.filter(c => {
      const d = new Date(c.timestamp);
      return d >= startDate && d <= endDate;
    });
    if (spyInRange.length >= 2) {
      const spyStart = spyInRange[0].close;
      const spyByDate = new Map<string, number>();
      for (const c of spyInRange) {
        spyByDate.set(new Date(c.timestamp).toISOString().split('T')[0], c.close);
      }
      let spyMaxEquity = config.initialCapital;
      benchmarkCurve = masterDates.map(d => {
        const spyClose = spyByDate.get(d);
        const benchEquity = spyClose !== undefined
          ? round2(config.initialCapital * (spyClose / spyStart))
          : config.initialCapital;
        spyMaxEquity = Math.max(spyMaxEquity, benchEquity);
        const dd = spyMaxEquity > 0 ? (spyMaxEquity - benchEquity) / spyMaxEquity * 100 : 0;
        return { date: d, equity: benchEquity, drawdown: dd };
      });
    }
  }

  const excludedNote = excludedSectors && excludedSectors.length > 0
    ? ` (excl. ${excludedSectors.join(', ')})` : '';

  return {
    id: crypto.randomUUID(),
    name: `Portfolio 5-min Backtest — ${INTRADAY_WATCHLIST.length} Stocks${excludedNote}`,
    config,
    metrics,
    equityCurve,
    benchmarkCurve,
    tradeLog: trades,
    monthlyReturns,
    createdAt: new Date(),
    bySymbol:     buildBreakdown(trades, t => t.symbol),
    bySignalType: buildBreakdown(trades, t => t.signalType ?? 'unknown'),
  };
}

// ---------------------------------------------------------------------------
// Public: runGridSearch5min
// ---------------------------------------------------------------------------

/**
 * Grid search over SignalParams combinations using 5-min bar data.
 * All combinations run against the same pre-fetched bar data (no re-fetching).
 * Results sorted by profit factor descending.
 */
export function runGridSearch5min(
  allBars5minMap: Map<string, Map<string, NormalizedOHLCV[]>>,
  dailyCandlesMap: Map<string, NormalizedOHLCV[]>,
  config: BacktestConfig,
  spyCandles: NormalizedOHLCV[] | undefined,
  paramGrid: SignalParams[],
): GridSearchResult[] {
  const results: GridSearchResult[] = [];

  for (const params of paramGrid) {
    const result = runPortfolio5minBacktest(
      allBars5minMap, dailyCandlesMap, config, undefined, spyCandles, params,
    );
    results.push({
      params,
      metrics: {
        totalReturn:  result.metrics.totalReturn,
        profitFactor: result.metrics.profitFactor,
        winRate:      result.metrics.winRate,
        totalTrades:  result.metrics.totalTrades,
      },
      bySignalType: result.bySignalType,
    });
  }

  return results.sort((a, b) => b.metrics.profitFactor - a.metrics.profitFactor);
}

// ---------------------------------------------------------------------------
// Public: buildParamGrid5min
// ---------------------------------------------------------------------------

/**
 * Builds the 5-min grid search parameter combinations.
 * Includes ORB since 5-min data can properly simulate opening range breakouts.
 * 3 × 3 × 3 × 3 = 81 combinations.
 */
export function buildParamGrid5min(): SignalParams[] {
  const gapThresholds = [1.5, 2.0, 2.5];
  const atrGates      = [1.0, 1.5, 2.0];
  const qualities: ('good' | 'excellent' | 'fair')[] = ['good', 'excellent', 'fair'];
  const signalSets: ('gap_fade' | 'vwap_reversion' | 'orb')[][] = [
    ['gap_fade', 'vwap_reversion', 'orb'],
    ['gap_fade', 'vwap_reversion'],
    ['gap_fade'],
  ];

  const grid: SignalParams[] = [];
  for (const gapThresholdPct of gapThresholds) {
    for (const atrGatePct of atrGates) {
      for (const minQuality of qualities) {
        for (const enabledSignals of signalSets) {
          grid.push({ gapThresholdPct, atrGatePct, minQuality, enabledSignals });
        }
      }
    }
  }
  return grid; // 3 × 3 × 3 × 3 = 81 combinations
}
