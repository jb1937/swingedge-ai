// src/lib/analysis/sector-brief.ts
//
// Generates a morning sector brief using:
//   - 5-day price performance for sector ETFs (via dataRouter)
//   - Recent market news headlines (via alpacaDataClient)
//   - Claude claude-sonnet-4-6 to identify sectors a day trader should avoid today
//
// Called by daily-scan cron at 8:30 AM ET.
// Result stored in Redis swingedge:sector_brief (26h TTL).

import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';
import { dataRouter } from '@/lib/data/data-router';
import { alpacaDataClient } from '@/lib/data/alpaca-data-client';
import { getSupabaseServer } from '@/lib/supabase/server';

const REDIS_KEY = 'swingedge:sector_brief';
const TTL_SECONDS = 26 * 60 * 60;

// Sector ETF → sector name mapping
const SECTOR_ETFS: Record<string, string> = {
  XLK: 'Technology',
  XLF: 'Financials',
  XLV: 'Healthcare',
  XLE: 'Energy',
  XLY: 'Consumer Discretionary',
  XLI: 'Industrials',
  XLB: 'Materials',
  XLRE: 'Real Estate',
  XLU: 'Utilities',
  XLP: 'Consumer Staples',
  XLC: 'Communication Services',
};

export interface SectorFlag {
  sector: string;
  etf: string;
  reason: string;
  change5d: number; // 5-day return %
}

export interface SectorBrief {
  generatedAt: string;
  flags: SectorFlag[];
  autoApply: boolean;
}

async function getSectorPerformance(): Promise<
  { etf: string; sector: string; change5d: number }[]
> {
  const results: { etf: string; sector: string; change5d: number }[] = [];
  for (const [etf, sector] of Object.entries(SECTOR_ETFS)) {
    try {
      const bars = await dataRouter.getHistorical(etf, '1day', 'compact');
      if (!bars || bars.length < 6) continue;
      const recent = bars.slice(-6);
      const start = recent[0].close;
      const end = recent[recent.length - 1].close;
      const change5d = start > 0 ? ((end - start) / start) * 100 : 0;
      results.push({ etf, sector, change5d });
    } catch {
      // Skip if data unavailable
    }
  }
  return results;
}

export async function generateSectorBrief(): Promise<SectorBrief> {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  // Check if auto-apply is enabled (default: true)
  const autoApplyRaw = await redis.get<boolean>('swingedge:sector_brief_auto_apply');
  const autoApply = autoApplyRaw ?? true;

  // 1. Sector performance
  const sectorPerf = await getSectorPerformance();

  // 2. Recent news
  const newsSymbols = Object.keys(SECTOR_ETFS);
  const headlines = await alpacaDataClient.getRecentNews(newsSymbols, 15);

  // 3. Ask Claude to identify risky sectors
  const sectorPerfText = sectorPerf
    .map(s => `${s.sector} (${s.etf}): ${s.change5d >= 0 ? '+' : ''}${s.change5d.toFixed(2)}% 5-day`)
    .join('\n');

  const headlinesText = headlines
    .slice(0, 15)
    .map(h => `- ${h.headline}`)
    .join('\n');

  const client = new Anthropic();
  let flags: SectorFlag[] = [];

  try {
    // Use server-side web search so Claude can fetch live market news/events.
    // web_search_20260209 supports dynamic filtering on Sonnet 4.6 — no extra setup needed.
    let message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [
        { type: 'web_search_20260209', name: 'web_search' } as unknown as Anthropic.Tool,
        { type: 'web_fetch_20260209', name: 'web_fetch' } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: 'user',
          content: `You are a market risk analyst for a day trader. Today is ${new Date().toDateString()}.

Search the web for current market news and sector risks, then combine with the performance data below to identify which US stock market sectors should be avoided for intraday trading TODAY.

SECTOR 5-DAY PERFORMANCE:
${sectorPerfText}

ALPACA NEWS HEADLINES (supplementary):
${headlinesText}

Search for: "stock market sector news today", "market sector risks ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}", and any relevant sector-specific news.

After searching, respond ONLY with a JSON array (no other text). Each element: {"sector": "<sector name>", "reason": "<one concise sentence explaining the risk today>"}. Return [] if no clear risks.`,
        },
      ],
    });

    // Handle pause_turn: server-side web search loop may need continuation
    let continuations = 0;
    while (message.stop_reason === 'pause_turn' && continuations < 5) {
      continuations++;
      message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        tools: [
          { type: 'web_search_20260209', name: 'web_search' } as unknown as Anthropic.Tool,
          { type: 'web_fetch_20260209', name: 'web_fetch' } as unknown as Anthropic.Tool,
        ],
        messages: [
          { role: 'user', content: `You are a market risk analyst. Today is ${new Date().toDateString()}.` },
          { role: 'assistant', content: message.content },
        ],
      });
    }

    const textBlock = message.content.find(b => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      // Extract JSON array from response (Claude may include preamble before the JSON)
      const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { sector: string; reason: string }[];
        flags = parsed.map(f => {
          const perf = sectorPerf.find(s =>
            s.sector.toLowerCase() === f.sector.toLowerCase() ||
            s.etf.toLowerCase() === f.sector.toLowerCase()
          );
          return {
            sector: f.sector,
            etf: perf?.etf ?? '',
            reason: f.reason,
            change5d: perf?.change5d ?? 0,
          };
        });
      }
    }
  } catch (err) {
    console.error('sector-brief: Claude API error:', err);
    // Return empty flags on error — non-blocking
  }

  const brief: SectorBrief = {
    generatedAt: new Date().toISOString(),
    flags,
    autoApply,
  };

  // Store in Redis
  await redis.set(REDIS_KEY, JSON.stringify(brief), { ex: TTL_SECONDS });

  // Auto-apply: write flagged sectors to skip_sectors (always overwrites, clears when no flags)
  if (autoApply) {
    const skipSectors = flags.map(f => f.sector);
    await redis.set('swingedge:skip_sectors', JSON.stringify(skipSectors));
    console.log(`sector-brief: auto-applied ${skipSectors.length} blocked sectors`);
    // Log to history table (fire-and-forget)
    getSupabaseServer()
      .from('sector_block_history')
      .insert({ sectors: skipSectors, source: 'auto_apply' })
      .then(() => {}, (err: unknown) => console.error('sector-brief: history log failed', err));
  }

  console.log(`sector-brief: generated ${flags.length} flags`);
  return brief;
}
