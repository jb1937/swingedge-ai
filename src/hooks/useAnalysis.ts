// src/hooks/useAnalysis.ts

import { useQuery } from '@tanstack/react-query';
import { TechnicalIndicators } from '@/types/analysis';

export interface TechnicalAnalysisData {
  symbol: string;
  indicators: TechnicalIndicators;
  latestPrice: number;
  priceChange: number;
  priceChangePercent: number;
  technicalScore: number;
  signalDirection: 'long' | 'short' | 'neutral';
  analyzedAt: string;
}

async function fetchTechnicalAnalysis(symbol: string): Promise<TechnicalAnalysisData> {
  const response = await fetch(`/api/analysis/technical/${symbol}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to fetch analysis for ${symbol}`);
  }
  return response.json();
}

interface UseAnalysisOptions {
  symbol: string;
  enabled?: boolean;
  refetchInterval?: number;
}

export function useAnalysis({
  symbol,
  enabled = true,
  refetchInterval,
}: UseAnalysisOptions) {
  return useQuery({
    queryKey: ['analysis', symbol],
    queryFn: () => fetchTechnicalAnalysis(symbol),
    enabled: enabled && !!symbol,
    refetchInterval,
    staleTime: 60000, // Consider data fresh for 1 minute
    retry: 2,
  });
}
