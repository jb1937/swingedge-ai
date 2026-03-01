// src/components/dashboard/PositionsTable.tsx

'use client';

import { useState, Fragment } from 'react';
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
import { usePositionTheses, useTradingStore } from '@/stores/trading-store';

/** Returns the number of business days elapsed since a given date. */
function businessDaysElapsed(from: Date): number {
  const now = new Date();
  let days = 0;
  const cursor = new Date(from);
  while (cursor < now) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function PositionsTable() {
  const { data: positions, isLoading, error, refetch } = usePositions();
  const { mutate: closePosition, isPending: isClosing } = useClosePosition();
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [closeQtyPct, setCloseQtyPct] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const positionTheses = usePositionTheses();
  const { addStopHit } = useTradingStore();

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

  const handleMarkStopHit = (symbol: string) => {
    addStopHit(symbol);
    setMessage({ type: 'success', text: `Stop-hit cooldown started for ${symbol} (3 business days)` });
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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => {
              const thesis = positionTheses[position.symbol.toUpperCase()];
              const daysHeld = thesis ? businessDaysElapsed(new Date(thesis.entryDate)) : null;
              const isStale = daysHeld !== null &&
                daysHeld >= 4 &&
                Math.abs(position.unrealizedPLPercent) < 0.5;
              const isExpanded = expandedSymbol === position.symbol;

              return (
                <Fragment key={position.symbol}>
                  <TableRow
                    className={isStale ? 'bg-yellow-950/20' : ''}
                    onClick={() => setExpandedSymbol(isExpanded ? null : position.symbol)}
                    style={{ cursor: thesis ? 'pointer' : 'default' }}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/analysis?symbol=${position.symbol}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {position.symbol}
                        </Link>
                        {isStale && (
                          <Badge variant="outline" className="text-yellow-400 border-yellow-600 text-xs">
                            ⚠ Stale
                          </Badge>
                        )}
                        {daysHeld !== null && (
                          <span className="text-xs text-gray-500">{daysHeld}d</span>
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
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
                        <button
                          className="text-gray-500 hover:text-red-400 text-xs"
                          title="Mark stop hit — starts 3-day cooldown before re-entry"
                          onClick={() => handleMarkStopHit(position.symbol)}
                        >
                          🚫
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expandable thesis row */}
                  {isExpanded && thesis && (
                    <TableRow key={`${position.symbol}-thesis`} className="bg-gray-900/50">
                      <TableCell colSpan={8} className="py-3 px-4">
                        <div className="text-xs space-y-1">
                          <p className="text-gray-400 font-semibold uppercase tracking-wide">
                            Entry thesis — {new Date(thesis.entryDate).toLocaleDateString()} @ ${thesis.entryPrice.toFixed(2)}
                          </p>
                          <p className="text-gray-300 leading-relaxed">{thesis.thesis}</p>
                          {isStale && (
                            <p className="text-yellow-400 mt-2">
                              ⚠ Position held {daysHeld} business days with &lt;0.5% movement — consider exiting if thesis no longer valid.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
