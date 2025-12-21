// src/hooks/useThesis.ts

import { useMutation } from '@tanstack/react-query';
import { TradeThesis } from '@/types/analysis';

async function generateThesis(symbol: string): Promise<TradeThesis> {
  const response = await fetch('/api/analysis/thesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate thesis');
  }
  
  return response.json();
}

export function useThesis() {
  return useMutation({
    mutationFn: generateThesis,
  });
}
