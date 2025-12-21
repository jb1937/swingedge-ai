// src/hooks/usePositions.ts

import { useQuery } from '@tanstack/react-query';
import { Position } from '@/types/trading';

async function fetchPositions(): Promise<Position[]> {
  const response = await fetch('/api/trading/positions');
  if (!response.ok) {
    throw new Error('Failed to fetch positions');
  }
  return response.json();
}

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: fetchPositions,
    refetchInterval: 5000, // Refetch every 5 seconds for near real-time
  });
}
