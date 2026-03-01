// src/components/dashboard/TradeHistory.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { TradeHistoryResponse, CompletedTrade } from '@/app/api/trading/history/route';

async function fetchTradeHistory(): Promise<TradeHistoryResponse> {
  const res = await fetch('/api/trading/history');
  if (!res.ok) throw new Error('Failed to fetch trade history');
  return res.json();
}

function ExitBadge({ reason }: { reason: CompletedTrade['exitReason'] }) {
  const config = {
    stop: { label: 'Stop', className: 'bg-red-900 text-red-300 border-red-700' },
    target: { label: 'Target', className: 'bg-green-900 text-green-300 border-green-700' },
    manual: { label: 'Manual', className: 'bg-gray-700 text-gray-300 border-gray-600' },
  }[reason];
  return <Badge variant="outline" className={`text-xs ${config.className}`}>{config.label}</Badge>;
}

export function TradeHistory() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tradeHistory'],
    queryFn: fetchTradeHistory,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Trade History</CardTitle></CardHeader>
        <CardContent><div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader><CardTitle>Trade History</CardTitle></CardHeader>
        <CardContent><p className="text-red-400 text-sm">Failed to load trade history.</p></CardContent>
      </Card>
    );
  }

  const { trades, stats } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade History</CardTitle>
        {trades.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mt-2 text-sm">
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400 text-xs">Trades</p>
              <p className="font-bold">{stats.totalTrades}</p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400 text-xs">Win Rate</p>
              <p className={`font-bold ${stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.winRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400 text-xs">Profit Factor</p>
              <p className={`font-bold ${stats.profitFactor >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                {isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
              </p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400 text-xs">Net P&L</p>
              <p className={`font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <p className="text-muted-foreground text-sm">No completed trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs">
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-left py-2">Entry</th>
                  <th className="text-left py-2">Exit</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Entry $</th>
                  <th className="text-right py-2">Exit $</th>
                  <th className="text-right py-2">P&L</th>
                  <th className="text-right py-2">P&L %</th>
                  <th className="text-right py-2">Days</th>
                  <th className="text-right py-2">Exit</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, i) => (
                  <tr key={i} className={`border-b border-gray-800/50 ${trade.pnl >= 0 ? 'hover:bg-green-950/20' : 'hover:bg-red-950/20'}`}>
                    <td className="py-2 font-medium">{trade.symbol}</td>
                    <td className="py-2 text-gray-400 text-xs">
                      {new Date(trade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-2 text-gray-400 text-xs">
                      {new Date(trade.exitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-2 text-right">{trade.qty}</td>
                    <td className="py-2 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">${trade.exitPrice.toFixed(2)}</td>
                    <td className={`py-2 text-right font-mono font-medium ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right font-medium ${trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                    </td>
                    <td className="py-2 text-right text-gray-400">{trade.holdingDays}d</td>
                    <td className="py-2 text-right"><ExitBadge reason={trade.exitReason} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
