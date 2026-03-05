// src/components/dashboard/PositionsTable.tsx

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePositions, useClosePosition } from '@/hooks/usePositions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import type { PositionSignal } from '@/app/api/positions/signals/route';

const SIGNAL_LABELS: Record<string, string> = {
  gap_fade: 'Gap Fade',
  vwap_reversion: 'VWAP Rev.',
  orb: 'ORB',
};

function formatTimeInTrade(entryAt?: string): string {
  if (!entryAt) return '—';
  const ms = Date.now() - new Date(entryAt).getTime();
  if (ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export function PositionsTable() {
  const { data: positions, isLoading, error, refetch } = usePositions();
  const { mutate: closePosition, isPending: isClosing } = useClosePosition();
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [closeQtyPct, setCloseQtyPct] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: signalsData } = useQuery({
    queryKey: ['position-signals'],
    queryFn: async () => {
      const res = await fetch('/api/positions/signals');
      if (!res.ok) return { signals: {} };
      return res.json() as Promise<{ signals: Record<string, PositionSignal> }>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const signals = signalsData?.signals ?? {};

  const handleClosePosition = (symbol: string, qty?: number) => {
    setClosingSymbol(symbol);
    setMessage(null);

    closePosition({ symbol, qty }, {
      onSuccess: () => {
        const label = qty ? `${qty} shares of ${symbol}` : `position ${symbol}`;
        setMessage({ type: 'success', text: `Closed ${label}` });
        setClosingSymbol(null);
        refetch();
      },
      onError: (err) => {
        setMessage({ type: 'error', text: err.message });
        setClosingSymbol(null);
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600">Failed to load positions</p>
        </CardContent>
      </Card>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No open positions</p>
        </CardContent>
      </Card>
    );
  }

  const totalPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Positions ({positions.length})</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Total Value: ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            <span className={`ml-3 font-semibold ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              P&L: {totalPL >= 0 ? '+' : ''}${totalPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {message && (
          <Alert className={`mb-4 ${message.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
            <AlertDescription className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">P&L %</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => {
              const sig = signals[position.symbol.toUpperCase()];

              return (
                <TableRow key={position.symbol}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/analysis?symbol=${position.symbol}`}
                        className="hover:underline"
                      >
                        {position.symbol}
                      </Link>
                      {sig && (
                        <Badge variant="outline" className="text-xs bg-blue-950 text-blue-300 border-blue-700">
                          {SIGNAL_LABELS[sig.signalType] ?? sig.signalType}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={position.side === 'long' ? 'default' : 'destructive'}>
                      {position.side.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{position.qty}</TableCell>
                  <TableCell className="text-right">
                    ${position.avgEntryPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${position.currentPrice.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      position.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {position.unrealizedPL >= 0 ? '+' : ''}
                    ${position.unrealizedPL.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      position.unrealizedPLPercent >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {position.unrealizedPLPercent >= 0 ? '+' : ''}
                    {position.unrealizedPLPercent.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-400 font-mono">
                    {formatTimeInTrade(sig?.entryAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <select
                        className="text-xs bg-gray-800 border border-gray-700 rounded px-1 py-1 text-gray-300"
                        value={closeQtyPct[position.symbol] ?? 'all'}
                        onChange={(e) => setCloseQtyPct(prev => ({ ...prev, [position.symbol]: e.target.value }))}
                      >
                        <option value="all">All ({position.qty})</option>
                        <option value="50">50% ({Math.floor(position.qty * 0.5)})</option>
                        <option value="25">25% ({Math.floor(position.qty * 0.25)})</option>
                      </select>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isClosing && closingSymbol === position.symbol}
                        onClick={() => {
                          const pct = closeQtyPct[position.symbol] ?? 'all';
                          const qty = pct === 'all' ? undefined
                            : Math.floor(position.qty * (parseInt(pct) / 100));
                          handleClosePosition(position.symbol, qty);
                        }}
                      >
                        {isClosing && closingSymbol === position.symbol ? 'Closing…' : 'Close'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
