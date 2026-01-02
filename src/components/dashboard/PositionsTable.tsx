// src/components/dashboard/PositionsTable.tsx

'use client';

import { useState } from 'react';
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

export function PositionsTable() {
  const { data: positions, isLoading, error, refetch } = usePositions();
  const { mutate: closePosition, isPending: isClosing } = useClosePosition();
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const handleClosePosition = (symbol: string) => {
    setClosingSymbol(symbol);
    setMessage(null);
    
    closePosition(symbol, {
      onSuccess: () => {
        setMessage({ type: 'success', text: `Position ${symbol} closed` });
        setClosingSymbol(null);
        refetch();
      },
      onError: (error) => {
        setMessage({ type: 'error', text: error.message });
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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.symbol}>
                <TableCell className="font-medium">
                  <Link href={`/analysis?symbol=${position.symbol}`} className="hover:underline">
                    {position.symbol}
                  </Link>
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
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleClosePosition(position.symbol)}
                    disabled={isClosing && closingSymbol === position.symbol}
                  >
                    {isClosing && closingSymbol === position.symbol ? 'Closing...' : 'Close'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
