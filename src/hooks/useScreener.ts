// src/hooks/useScreener.ts

import { useQuery, useMutation } from '@tanstack/react-query';
import { ScreenerResult, ScreenerFilters } from '@/types/analysis';

export interface ScreenerResponse {
  count: number;
  results: ScreenerResult[];
  scannedAt: string;
  preset?: string;
  mode?: string;
  // New fields for scan statistics
  totalScanned?: number;
  totalSuccessful?: number;
}

export interface IntradayResult {
  symbol: string;
  signal: {
    signalType: 'gap_fade' | 'vwap_reversion' | 'orb';
    entry: number;
    stop: number;
    target: number;
    riskRewardRatio: number;
    tradeQuality: 'excellent' | 'good' | 'fair' | 'poor';
    confidence: number;
  };
  prevClose: number;
  avgDailyVolume: number;
}

export interface IntradayScreenerResponse {
  mode: 'intraday';
  count: number;
  results: IntradayResult[];
  scannedAt: string;
}

async function runIntradayScreenerFetch(symbols?: string[]): Promise<IntradayScreenerResponse> {
  const response = await fetch('/api/analysis/screen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'intraday', symbols }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to run intraday screener');
  }
  return response.json();
}

export function useIntradayScreener() {
  return useMutation({
    mutationFn: (symbols?: string[]) => runIntradayScreenerFetch(symbols),
  });
}

async function fetchScreenerPreset(preset: string, limit: number): Promise<ScreenerResponse> {
  const response = await fetch(`/api/analysis/screen?preset=${preset}&limit=${limit}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to run screener');
  }
  return response.json();
}

async function runCustomScreener(
  symbols: string[],
  filters: ScreenerFilters,
  limit?: number
): Promise<ScreenerResponse> {
  const response = await fetch('/api/analysis/screen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols, limit, ...filters }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to run screener');
  }
  return response.json();
}

export function useScreenerPreset(preset: string = 'bullish', limit: number = 5) {
  return useQuery({
    queryKey: ['screener', preset, limit],
    queryFn: () => fetchScreenerPreset(preset, limit),
    staleTime: 300000, // 5 minutes
    retry: 1,
  });
}

export function useCustomScreener() {
  return useMutation({
    mutationFn: ({ symbols, filters, limit }: { symbols: string[]; filters: ScreenerFilters; limit?: number }) =>
      runCustomScreener(symbols, filters, limit),
  });
}
