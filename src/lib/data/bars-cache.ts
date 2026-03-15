// src/lib/data/bars-cache.ts
//
// Compact Redis cache for 5-min OHLCV bar data.
//
// Storage format: each bar stored as a flat 6-element number array
//   [timestamp_ms, open, high, low, close, volume]
// This gives ~55 bytes/bar vs ~150 bytes for a JSON object.
//
// 2-year dataset: ~39,000 bars × 55 bytes ≈ 2.1 MB per symbol — above Upstash's
// 1 MB per-item limit on the free plan. We split every symbol into two chunks:
//   swingedge:bars5min:{SYMBOL}:0  — older half (bars 0..N/2)
//   swingedge:bars5min:{SYMBOL}:1  — newer half (bars N/2..N)
// Each chunk is ~1 MB or less; combined they reconstruct the full 2-year history.
//
// Backward-compat: getCachedBars also falls back to the legacy single-key format
// (swingedge:bars5min:{SYMBOL}) written by earlier versions of this module.
//
// Meta key:    swingedge:bars5min:_meta  (hash: symbol → ISO lastUpdated)
// TTL: 72 hours — covers weekends + holiday gaps

import { Redis } from '@upstash/redis';
import { NormalizedOHLCV } from '@/types/market';

type CompactBar = [number, number, number, number, number, number];
// [timestamp_epoch_ms, open, high, low, close, volume]

const BAR_CACHE_PREFIX = 'swingedge:bars5min:';
const BAR_CACHE_META   = 'swingedge:bars5min:_meta';
const BAR_CACHE_TTL    = 72 * 60 * 60; // 72 hours in seconds

function getRedis(): Redis {
  return new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function compress(bars: NormalizedOHLCV[]): CompactBar[] {
  return bars.map(b => [
    new Date(b.timestamp).getTime(),
    b.open, b.high, b.low, b.close, b.volume,
  ]);
}

function decompress(symbol: string, compact: CompactBar[]): NormalizedOHLCV[] {
  return compact.map(([ts, o, h, l, c, v]) => ({
    symbol,
    timestamp: new Date(ts),
    open: o, high: h, low: l, close: c, volume: v,
    source: 'alpaca' as const,
  }));
}

/**
 * Read cached 5-min bars for a symbol.
 * Checks chunked keys (:0 + :1) first; falls back to legacy single key.
 * Returns null on total cache miss.
 */
export async function getCachedBars(symbol: string): Promise<NormalizedOHLCV[] | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const redis = getRedis();
    const [chunk0, chunk1] = await Promise.all([
      redis.get<CompactBar[]>(`${BAR_CACHE_PREFIX}${symbol}:0`),
      redis.get<CompactBar[]>(`${BAR_CACHE_PREFIX}${symbol}:1`),
    ]);
    if (chunk0 || chunk1) {
      const combined = [...(chunk0 ?? []), ...(chunk1 ?? [])];
      return combined.length > 0 ? decompress(symbol, combined) : null;
    }
    // Fallback: legacy single-key format from earlier versions
    const raw = await redis.get<CompactBar[]>(`${BAR_CACHE_PREFIX}${symbol}`);
    if (!raw || raw.length === 0) return null;
    return decompress(symbol, raw);
  } catch (err) {
    console.warn(`bars-cache: getCachedBars(${symbol}) failed —`, err);
    return null;
  }
}

/**
 * Write 5-min bars for a symbol to Redis with a 72-hour TTL.
 * Splits into two equal chunks to stay under Upstash's 1 MB per-item limit.
 * No-op if Redis credentials are absent.
 */
export async function setCachedBars(symbol: string, bars: NormalizedOHLCV[]): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  if (bars.length === 0) return;
  try {
    const redis = getRedis();
    const compact = compress(bars);
    const mid = Math.ceil(compact.length / 2);
    await Promise.all([
      redis.set(`${BAR_CACHE_PREFIX}${symbol}:0`, JSON.stringify(compact.slice(0, mid)), { ex: BAR_CACHE_TTL }),
      redis.set(`${BAR_CACHE_PREFIX}${symbol}:1`, JSON.stringify(compact.slice(mid)),    { ex: BAR_CACHE_TTL }),
    ]);
    // Update meta
    await redis.hset(BAR_CACHE_META, { [symbol]: new Date().toISOString() });
    // Delete any legacy single key (cleanup after migration)
    redis.del(`${BAR_CACHE_PREFIX}${symbol}`).catch(() => {});
  } catch (err) {
    console.warn(`bars-cache: setCachedBars(${symbol}) failed —`, err);
  }
}

export interface BarCacheMeta {
  symbol: string;
  lastUpdated: string;  // ISO timestamp
}

/**
 * Returns the per-symbol last-updated metadata from the meta hash.
 */
export async function getCacheMeta(): Promise<BarCacheMeta[]> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return [];
  try {
    const redis = getRedis();
    const raw = await redis.hgetall<Record<string, string>>(BAR_CACHE_META);
    if (!raw) return [];
    return Object.entries(raw).map(([symbol, lastUpdated]) => ({ symbol, lastUpdated }));
  } catch (err) {
    console.warn('bars-cache: getCacheMeta() failed —', err);
    return [];
  }
}

/**
 * Load cached bars for multiple symbols at once.
 * Returns a Map<symbol, bars> for all cache hits.
 * Symbols with cache misses are absent from the map.
 */
export async function getBatchCachedBars(
  symbols: string[],
): Promise<Map<string, NormalizedOHLCV[]>> {
  const result = new Map<string, NormalizedOHLCV[]>();
  if (!process.env.UPSTASH_REDIS_REST_URL) return result;

  const results = await Promise.all(symbols.map(s => getCachedBars(s)));
  for (let i = 0; i < symbols.length; i++) {
    const bars = results[i];
    if (bars && bars.length > 0) result.set(symbols[i], bars);
  }
  return result;
}
