// src/hooks/useOrders.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Order, OrderRequest, BracketOrder } from '@/types/trading';

async function fetchOrders(): Promise<Order[]> {
  const response = await fetch('/api/trading/orders');
  if (!response.ok) {
    throw new Error('Failed to fetch orders');
  }
  return response.json();
}

async function submitOrder(order: OrderRequest): Promise<Order> {
  const response = await fetch('/api/trading/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit order');
  }
  return response.json();
}

async function submitBracketOrder(bracket: BracketOrder): Promise<Order> {
  const response = await fetch('/api/trading/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry: bracket.entry,
      takeProfit: bracket.takeProfit,
      stopLoss: bracket.stopLoss,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit bracket order');
  }
  return response.json();
}

async function cancelOrder(orderId?: string): Promise<void> {
  const url = orderId 
    ? `/api/trading/orders?orderId=${orderId}` 
    : '/api/trading/orders';
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel order');
  }
}

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    refetchInterval: 5000,
  });
}

export function useSubmitOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: submitOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}

export function useSubmitBracketOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: submitBracketOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
