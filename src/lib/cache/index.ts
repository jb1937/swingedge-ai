// src/lib/cache/index.ts

/**
 * In-memory LRU cache with TTL support
 * In production, replace with Redis for distributed caching
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessedAt: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number; // milliseconds
}

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 60000, // 1 minute default
    };

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Update access time for LRU
    entry.accessedAt = Date.now();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + (ttl || this.config.defaultTTL),
      accessedAt: now,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// TTL configurations in milliseconds
export const CACHE_TTL = {
  QUOTE: 60 * 1000,                    // 1 minute for quotes
  QUOTE_REALTIME: 15 * 1000,           // 15 seconds for active positions
  HISTORICAL_DAILY: 5 * 60 * 1000,     // 5 minutes for daily data
  HISTORICAL_INTRADAY: 60 * 1000,      // 1 minute for intraday
  INDICATORS: 2 * 60 * 1000,           // 2 minutes for computed indicators
  SCREENER: 3 * 60 * 1000,             // 3 minutes for screener results
  ANALYSIS: 5 * 60 * 1000,             // 5 minutes for analysis results
};

// Cache instances for different data types
export const quoteCache = new LRUCache<unknown>({
  maxSize: 500,
  defaultTTL: CACHE_TTL.QUOTE,
});

export const historicalCache = new LRUCache<unknown>({
  maxSize: 200,
  defaultTTL: CACHE_TTL.HISTORICAL_DAILY,
});

export const indicatorCache = new LRUCache<unknown>({
  maxSize: 200,
  defaultTTL: CACHE_TTL.INDICATORS,
});

export const analysisCache = new LRUCache<unknown>({
  maxSize: 100,
  defaultTTL: CACHE_TTL.ANALYSIS,
});

// Cache key generators
export const cacheKeys = {
  quote: (symbol: string) => `quote:${symbol.toUpperCase()}`,
  historical: (symbol: string, timeframe: string, outputSize: string) => 
    `historical:${symbol.toUpperCase()}:${timeframe}:${outputSize}`,
  indicators: (symbol: string, timeframe: string) => 
    `indicators:${symbol.toUpperCase()}:${timeframe}`,
  analysis: (symbol: string) => `analysis:${symbol.toUpperCase()}`,
  screener: (watchlist: string, filters: string) => 
    `screener:${watchlist}:${filters}`,
};

/**
 * Wrapper function for cached data fetching
 */
export async function withCache<T>(
  cache: LRUCache<T>,
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Check cache first
  const cached = cache.get(key) as T | null;
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const data = await fetchFn();
  
  // Store in cache
  cache.set(key, data, ttl);
  
  return data;
}

/**
 * Batch cache check - returns cached items and missing keys
 */
export function batchCacheCheck<T>(
  cache: LRUCache<T>,
  keys: string[]
): { cached: Map<string, T>; missing: string[] } {
  const cached = new Map<string, T>();
  const missing: string[] = [];

  for (const key of keys) {
    const value = cache.get(key) as T | null;
    if (value !== null) {
      cached.set(key, value);
    } else {
      missing.push(key);
    }
  }

  return { cached, missing };
}

/**
 * Invalidate cache entries matching a pattern
 */
export function invalidatePattern(cache: LRUCache<unknown>, pattern: RegExp): number {
  let count = 0;
  // Note: This requires exposing cache keys, simplified for now
  // In production, use Redis SCAN with pattern matching
  return count;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    quotes: quoteCache.size(),
    historical: historicalCache.size(),
    indicators: indicatorCache.size(),
    analysis: analysisCache.size(),
  };
}
