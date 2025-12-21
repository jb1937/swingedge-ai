// src/hooks/useQuote.ts

import { useQuery } from '@tanstack/react-query';
import { NormalizedQuote, QuoteContext } from '@/types/market';

interface UseQuoteOptions {
  symbol: string;
  context?: Partial<QuoteContext>;
  enabled?: boolean;
  refetchInterval?: number;
}

async function fetchQuote(symbol: string, context: Partial<QuoteContext>): Promise<NormalizedQuote> {
  const params = new URLSearchParams();
  if (context.isActivePosition) params.set('position', 'true');
  if (context.isPendingOrder) params.set('pending', 'true');
  if (context.isWatchlist) params.set('watchlist', 'true');
  if (context.isScreening) params.set('screening', 'true');
  
  const response = await fetch(`/api/data/quote/${symbol}?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch quote for ${symbol}`);
  }
  return response.json();
}

export function useQuote({
  symbol,
  context = {},
  enabled = true,
  refetchInterval = 15000,
}: UseQuoteOptions) {
  return useQuery({
    queryKey: ['quote', symbol, context],
    queryFn: () => fetchQuote(symbol, context),
    enabled: enabled && !!symbol,
    refetchInterval,
  });
}
