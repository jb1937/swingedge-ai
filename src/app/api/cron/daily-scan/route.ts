// src/app/api/cron/daily-scan/route.ts
//
// Runs at 8:30 AM ET (13:30 UTC) Mon–Fri via Vercel Cron.
// Scans the watchlist for the best setups, checks the market regime gate,
// deduplicates correlated sectors, and caches the top opportunities in
// Upstash Redis for 24 hours so the dashboard and auto-trade cron can
// consume them quickly without re-running a full screener.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { Redis } from '@upstash/redis';
import { getTopBullish } from '@/lib/analysis/screener';
import { checkIncomingSymbolCorrelation } from '@/lib/trading/sector-mapping';
import { checkMarketRegimeGate, type MarketRegimeGate } from '@/lib/analysis/market-regime';
import { dataRouter } from '@/lib/data/data-router';

const OPPORTUNITIES_KEY = 'swingedge:daily_opportunities';
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

function cronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // No secret set — allow (dev mode)
  return authHeader === `Bearer ${secret}`;
}

async function runScan() {

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // 1. Check market regime gate using SPY data
    let regimeGate: MarketRegimeGate = { allowLongs: true, positionSizeMultiplier: 1.0, warningLevel: 'none', reason: 'No SPY data', regime: null };
    try {
      const spyCandles = await dataRouter.getHistorical('SPY', '1day', 'full');
      if (spyCandles.length >= 50) {
        regimeGate = checkMarketRegimeGate(spyCandles);
      }
    } catch {
      console.warn('daily-scan: Could not fetch SPY for regime gate — proceeding');
    }

    // 2. Run screener for top bullish setups (excellent/good R:R only)
    const candidates = await getTopBullish(20);

    // 3. Deduplicate by correlation group — keep best setup per group
    const chosenSymbols: string[] = [];
    const deduped = candidates.filter((c) => {
      const check = checkIncomingSymbolCorrelation(c.symbol, chosenSymbols);
      if (check.allowed) {
        chosenSymbols.push(c.symbol);
        return true;
      }
      return false;
    });

    const top5 = deduped.slice(0, 5);

    const payload = {
      date: new Date().toISOString().split('T')[0],
      scannedAt: new Date().toISOString(),
      regimeGate,
      opportunities: top5.map((o) => ({
        symbol: o.symbol,
        price: o.price,
        suggestedEntry: o.suggestedEntry,
        suggestedStop: o.suggestedStop,
        suggestedTarget: o.suggestedTarget,
        riskRewardRatio: o.riskRewardRatio,
        tradeQuality: o.tradeQuality,
        signalStrength: o.signalStrength,
        technicalScore: o.technicalScore,
        matchedCriteria: o.matchedCriteria,
      })),
    };

    await redis.set(OPPORTUNITIES_KEY, JSON.stringify(payload), { ex: TTL_SECONDS });

    console.log(`daily-scan: Found ${top5.length} opportunities. Regime: ${regimeGate.warningLevel}`);

    return NextResponse.json({
      success: true,
      opportunitiesFound: top5.length,
      regimeWarning: regimeGate.warningLevel,
      symbols: top5.map((o) => o.symbol),
    });
  } catch (error) {
    console.error('daily-scan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 }
    );
  }
}

// GET — called by Vercel cron, authenticated via CRON_SECRET
export async function GET(request: NextRequest) {
  if (!cronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runScan();
}

// POST — manual trigger from dashboard, authenticated via user session
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return runScan();
}
