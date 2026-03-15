// src/lib/data/bars-cache.ts
//
// Compact Redis cache for 5-min OHLCV bar data.
//
// Storage format: each bar stored as a flat 6-element number array
//   [timestamp_ms, open, high, low, close, volume]
// This gives ~45 bytes/bar vs ~150 bytes for a JSON object — ~20 MB total
// for 50 symbols × 6 months of 5-min bars.
//
// Key pattern: swingedge:bars5min:{SYMBOL}   (string, JSON array of CompactBar[])
// Meta key:    swingedge:bars5min:_meta       (hash: symbol → ISO lastUpdated)
//
// TTL: 48 hours — covers the weekend gap (Friday cache still valid Monday morning)

import { Redis } from '@upstash/redis';
import { NormalizedOHLCV } from '@/types/market';

type CompactBar = [number, number, number, number, number, number];
// [timestamp_epoch_ms, open, high, low, close, volume]

const BAR_CACHE_PREFIX = 'swingedge:bars5min:';
const BAR_CACHE_META   = 'swingedge:bars5min:_meta';
const BAR_CACHE_TTL    = 48 * 60 * 60; // 48 hours in seconds

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
 * Returns null if the key is missing or Redis credentials are absent.
 */
export async function getCachedBars(symbol: string): Promise<NormalizedOHLCV[] | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const redis = getRedis();
    const raw = await redis.get<CompactBar[]>(`${BAR_CACHE_PREFIX}${symbol}`);
    if (!raw || raw.length === 0) return null;
    return decompress(symbol, raw);
  } catch (err) {
    console.warn(`bars-cache: getCachedBars(${symbol}) failed —`, err);
    return null;
  }
}

/**
 * Write 5-min bars for a symbol to Redis with a 48-hour TTL.
 * No-op if Redis credentials are absent.
 */
export async function setCachedBars(symbol: string, bars: NormalizedOHLCV[]): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  if (bars.length === 0) return;
  try {
    const redis = getRedis();
    const compact = compress(bars);
    await redis.set(`${BAR_CACHE_PREFIX}${symbol}`, JSON.stringify(compact), { ex: BAR_CACHE_TTL });
    // Update meta: mark this symbol as refreshed now
    await redis.hset(BAR_CACHE_META, { [symbol]: new Date().toISOString() });
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
