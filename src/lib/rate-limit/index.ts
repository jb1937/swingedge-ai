// src/lib/rate-limit/index.ts

import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// In-memory store for rate limiting
// In production, use Redis for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

// Default rate limit configurations per route type
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  trading: { maxRequests: 10, windowMs: 60000 },     // 10 requests/minute for trading
  chat: { maxRequests: 20, windowMs: 60000 },        // 20 requests/minute for chat
  analysis: { maxRequests: 30, windowMs: 60000 },    // 30 requests/minute for analysis
  backtest: { maxRequests: 5, windowMs: 60000 },     // 5 requests/minute for backtests
  data: { maxRequests: 60, windowMs: 60000 },        // 60 requests/minute for data
  default: { maxRequests: 100, windowMs: 60000 },    // 100 requests/minute default
};

/**
 * Check rate limit for a given identifier and route type
 * @param identifier - Unique identifier (usually IP or user ID)
 * @param routeType - Type of route for rate limit config
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  routeType: keyof typeof RATE_LIMITS = 'default'
): { allowed: boolean; remaining: number; resetIn: number } {
  const config = RATE_LIMITS[routeType] || RATE_LIMITS.default;
  const key = `${routeType}:${identifier}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  // Create new entry if doesn't exist or window expired
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetIn = Math.max(0, entry.resetTime - now);

  return { allowed, remaining, resetIn };
}

/**
 * Get IP address from request
 */
export function getClientIP(request: Request): string {
  // Check various headers for IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback
  return 'unknown';
}

/**
 * Rate limit middleware helper
 * Returns null if allowed, or a Response if rate limited
 */
export function rateLimitMiddleware(
  request: Request,
  routeType: keyof typeof RATE_LIMITS = 'default'
): NextResponse | null {
  const identifier = getClientIP(request);
  const { allowed, remaining, resetIn } = checkRateLimit(identifier, routeType);

  if (!allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil(resetIn / 1000),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetIn / 1000)),
          'Retry-After': String(Math.ceil(resetIn / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  identifier: string,
  routeType: keyof typeof RATE_LIMITS = 'default'
): NextResponse {
  const config = RATE_LIMITS[routeType] || RATE_LIMITS.default;
  const key = `${routeType}:${identifier}`;
  const entry = rateLimitStore.get(key);

  if (entry) {
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetIn = Math.max(0, entry.resetTime - Date.now());
    
    response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
  }

  return response;
}

/**
 * Reset rate limit for testing purposes
 */
export function resetRateLimit(identifier: string, routeType?: string): void {
  if (routeType) {
    rateLimitStore.delete(`${routeType}:${identifier}`);
  } else {
    // Reset all routes for this identifier
    for (const type of Object.keys(RATE_LIMITS)) {
      rateLimitStore.delete(`${type}:${identifier}`);
    }
  }
}
