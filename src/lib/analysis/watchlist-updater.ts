// src/lib/analysis/watchlist-updater.ts
//
// Overnight watchlist scoring. Called by daily-scan cron (8:30 AM ET).
// Scores every stock in CANDIDATE_UNIVERSE using 20 days of daily bars and
// writes the top-ranked symbols to Redis for runIntradayScreener() to consume.
//
// Scoring (0-100):
//   Volume > 2M shares/day  — 30 pts
//   ATR% > 1%               — 25 pts
//   Gap frequency > 0.5%    — 25 pts
//   Avg gap size            — 20 pts
//
// Universe: ~160 candidates → scoring selects top 75 (8 seeds + 67 best-scored).
// Expanding the candidate pool makes the scoring meaningful — only genuinely
// high-volatility, high-volume, gap-prone stocks make the final 75.

import { Redis } from '@upstash/redis';
import { dataRouter } from '@/lib/data/data-router';
import { INTRADAY_WATCHLIST } from './screener';

const REDIS_KEY = 'swingedge:intraday_watchlist';
const TTL_SECONDS = 26 * 60 * 60; // 26 hours

// Always keep these regardless of score — regime gate ETFs only
const ALWAYS_INCLUDE = ['SPY', 'QQQ', 'IWM'];

// Expanded candidate universe (~160 stocks) — scoring selects the best 75.
// Additions focus on high-ATR, high-gap-frequency names across sectors.
const EXPANDED_CANDIDATES = [
  // High-volatility tech / momentum
  'PLTR', 'COIN', 'MSTR', 'SMCI', 'RKLB', 'HOOD', 'RIVN', 'SOFI',
  'LYFT', 'UBER', 'SNAP', 'PINS', 'SPOT', 'ROKU',
  'TWLO', 'DDOG', 'NET', 'SNOW', 'ZS', 'OKTA',
  'ABNB', 'DASH', 'RBLX', 'U', 'PATH', 'AI',
  // Semiconductors (extended)
  'MRVL', 'KLAC', 'ON', 'SWKS', 'MPWR', 'ENTG',
  // Biotech / Pharma (gap-prone on catalysts)
  'BMRN', 'ALNY', 'RXRX', 'NTLA', 'BEAM', 'CRSP', 'ACAD', 'VKTX',
  // Financials / fintech
  'AFRM', 'UPST', 'NU', 'LC',
  // Energy (extended)
  'MPC', 'VLO', 'PSX', 'HAL', 'SLB', 'DVN', 'FANG',
  // Consumer / retail
  'SHOP', 'W', 'ETSY', 'F', 'GM',
  // Sector ETFs (high-activity)
  'ARKK', 'SQQQ', 'TQQQ', 'UVXY', 'XLV', 'XLI', 'XLB', 'XLC',
];

// Full universe: existing watchlist + new candidates + seeds
const UNIVERSE = Array.from(new Set([...INTRADAY_WATCHLIST, ...EXPANDED_CANDIDATES, ...ALWAYS_INCLUDE]));

interface StockScore {
  symbol: string;
  score: number;
}

function scoreStock(
  avgVolume: number,
  atrPct: number,
  gapFrequency: number,
  avgGapSize: number,
): number {
  let score = 0;

  // Volume score (30 pts)
  if (avgVolume >= 10_000_000) score += 30;
  else if (avgVolume >= 5_000_000) score += 25;
  else if (avgVolume >= 2_000_000) score += 15;
  else if (avgVolume >= 1_000_000) score += 5;

  // ATR% score (25 pts)
  if (atrPct >= 3) score += 25;
  else if (atrPct >= 2) score += 20;
  else if (atrPct >= 1.5) score += 15;
  else if (atrPct >= 1) score += 10;
  else if (atrPct >= 0.5) score += 3;

  // Gap frequency score (25 pts) — fraction of days with |open-prevClose|/prevClose > 0.5%
  if (gapFrequency >= 0.7) score += 25;
  else if (gapFrequency >= 0.5) score += 20;
  else if (gapFrequency >= 0.35) score += 12;
  else if (gapFrequency >= 0.2) score += 5;

  // Avg gap size score (20 pts) — average |gap %| on gapping days
  if (avgGapSize >= 2) score += 20;
  else if (avgGapSize >= 1.5) score += 15;
  else if (avgGapSize >= 1) score += 10;
  else if (avgGapSize >= 0.5) score += 4;

  return score;
}

export async function updateIntradayWatchlist(): Promise<{ updated: boolean; symbols: string[]; count: number }> {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const scored: StockScore[] = [];

  for (const symbol of UNIVERSE) {
    try {
      const daily = await dataRouter.getHistorical(symbol, '1day', 'full');
      if (!daily || daily.length < 22) continue;

      const recent = daily.slice(-21); // last 21 bars (20 complete days + today partial)
      const bars = recent.slice(0, 20); // use 20 complete trading days

      // Avg daily volume
      const volumes = bars.map(b => b.volume).filter(v => v > 0);
      const avgVolume = volumes.length > 0
        ? volumes.reduce((a, b) => a + b, 0) / volumes.length
        : 0;

      // ATR% (average true range as % of price)
      const atrs: number[] = [];
      for (let i = 1; i < bars.length; i++) {
        const tr = Math.max(
          bars[i].high - bars[i].low,
          Math.abs(bars[i].high - bars[i - 1].close),
          Math.abs(bars[i].low - bars[i - 1].close),
        );
        atrs.push(tr / bars[i].close * 100);
      }
      const atrPct = atrs.length > 0
        ? atrs.reduce((a, b) => a + b, 0) / atrs.length
        : 0;

      // Gap frequency and avg gap size
      const gapPcts: number[] = [];
      for (let i = 1; i < bars.length; i++) {
        const prevClose = bars[i - 1].close;
        if (prevClose <= 0) continue;
        const gapPct = Math.abs(bars[i].open - prevClose) / prevClose * 100;
        if (gapPct > 0.5) gapPcts.push(gapPct);
      }
      const gapFrequency = gapPcts.length / (bars.length - 1);
      const avgGapSize = gapPcts.length > 0
        ? gapPcts.reduce((a, b) => a + b, 0) / gapPcts.length
        : 0;

      const score = scoreStock(avgVolume, atrPct, gapFrequency, avgGapSize);
      scored.push({ symbol, score });
    } catch {
      // Skip symbols that error (delisted, no data, rate limited)
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Always include seeds, then top-75 from scored
  const alwaysSet = new Set(ALWAYS_INCLUDE);
  const alwaysSymbols = ALWAYS_INCLUDE.filter(s => scored.some(x => x.symbol === s));
  const topRest = scored
    .filter(s => !alwaysSet.has(s.symbol))
    .slice(0, 67)
    .map(s => s.symbol);

  const finalList = Array.from(new Set([...alwaysSymbols, ...topRest]));

  await redis.set(REDIS_KEY, JSON.stringify(finalList), { ex: TTL_SECONDS });

  console.log(`watchlist-updater: stored ${finalList.length} symbols in Redis`);
  return { updated: true, symbols: finalList, count: finalList.length };
}
