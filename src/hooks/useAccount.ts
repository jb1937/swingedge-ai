// src/hooks/useAccount.ts

import { useQuery } from '@tanstack/react-query';
import { Account } from '@/types/trading';

async function fetchAccount(): Promise<Account> {
  const response = await fetch('/api/trading/account');
  if (!response.ok) {
    throw new Error('Failed to fetch account');
  }
  return response.json();
}

export function useAccount() {
  return useQuery({
    queryKey: ['account'],
    queryFn: fetchAccount,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
