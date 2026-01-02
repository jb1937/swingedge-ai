// src/hooks/usePositions.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Position, Order } from '@/types/trading';

async function fetchPositions(): Promise<Position[]> {
  const response = await fetch('/api/trading/positions');
  if (!response.ok) {
    throw new Error('Failed to fetch positions');
  }
  return response.json();
}

async function closePosition(symbol: string): Promise<Order> {
  const response = await fetch(`/api/trading/positions?symbol=${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to close position');
  }
  return response.json();
}

async function closeAllPositions(): Promise<Order[]> {
  const response = await fetch('/api/trading/positions', {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to close all positions');
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

export function useClosePosition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: closePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCloseAllPositions() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: closeAllPositions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
