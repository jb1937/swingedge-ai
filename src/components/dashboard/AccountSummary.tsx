// src/components/dashboard/AccountSummary.tsx

'use client';

import { useAccount } from '@/hooks/useAccount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function AccountSummary() {
  const { data: account, isLoading, error } = useAccount();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !account) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">Failed to load account data</p>
        </CardContent>
      </Card>
    );
  }

  const dayChange = account.equity - account.lastEquity;
  const dayChangePct = (dayChange / account.lastEquity) * 100;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${account.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Day Change
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${dayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {dayChange >= 0 ? '+' : ''}${dayChange.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            <span className="ml-2 text-sm">
              ({dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%)
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Buying Power
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${account.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cash
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            ${account.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
