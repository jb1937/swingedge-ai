// src/hooks/useRecommendations.ts

import { useMutation } from '@tanstack/react-query';
import { ScreenerResult } from '@/types/analysis';

export interface ScreenerRecommendation {
  topPicks: {
    symbol: string;
    recommendation: 'strong_buy' | 'buy' | 'hold' | 'avoid';
    reasoning: string;
    suggestedStrategy: string;
    riskLevel: 'low' | 'medium' | 'high';
    // Risk/Reward data
    riskRewardRatio?: number;
    tradeQuality?: 'excellent' | 'good' | 'fair' | 'poor';
    suggestedEntry?: number;
    suggestedStop?: number;
    suggestedTarget?: number;
  }[];
  marketOverview: string;
  sectorInsights: string;
  riskWarnings: string[];
  suggestedPortfolioAllocation: string;
  generatedAt: Date;
}

interface RecommendationsRequest {
  results: ScreenerResult[];
  scanType: string;
}

async function fetchRecommendations(request: RecommendationsRequest): Promise<ScreenerRecommendation> {
  const response = await fetch('/api/analysis/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate recommendations');
  }
  
  return response.json();
}

export function useRecommendations() {
  return useMutation({
    mutationFn: fetchRecommendations,
  });
}
