// src/components/dashboard/PnLChart.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { TradeHistoryResponse, CompletedTrade } from '@/app/api/trading/history/route';

async function fetchTradeHistory(): Promise<TradeHistoryResponse> {
  const res = await fetch('/api/trading/history');
  if (!res.ok) throw new Error('Failed to fetch trade history');
  return res.json();
}

function buildCumulativeData(trades: CompletedTrade[]) {
  // trades are sorted most-recent-first; reverse for chronological order
  const sorted = [...trades].reverse();
  let cumulative = 0;
  return sorted.map((t) => {
    cumulative += t.pnl;
    return {
      date: new Date(t.exitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cumPnl: parseFloat(cumulative.toFixed(2)),
      pnl: parseFloat(t.pnl.toFixed(2)),
    };
  });
}

function buildSymbolData(trades: CompletedTrade[]) {
  const bySymbol: Record<string, number> = {};
  for (const t of trades) {
    bySymbol[t.symbol] = (bySymbol[t.symbol] ?? 0) + t.pnl;
  }
  return Object.entries(bySymbol)
    .map(([symbol, pnl]) => ({ symbol, pnl: parseFloat(pnl.toFixed(2)) }))
    .sort((a, b) => b.pnl - a.pnl);
}

const formatDollar = (v: number) => `${v >= 0 ? '+' : ''}$${v.toFixed(0)}`;

export function PnLChart() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tradeHistory'],
    queryFn: fetchTradeHistory,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Cumulative P&L</CardTitle></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>P&L by Symbol</CardTitle></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (error || !data || data.trades.length === 0) {
    return null; // Silent — TradeHistory shows the "no trades yet" message
  }

  const { trades, stats } = data;
  const cumulativeData = buildCumulativeData(trades);
  const symbolData = buildSymbolData(trades);
  const finalPnl = cumulativeData[cumulativeData.length - 1]?.cumPnl ?? 0;
  const areaColor = finalPnl >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-3">
            <p className="text-xs text-gray-400">Win Rate</p>
            <p className={`text-xl font-bold ${stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.winRate.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-3">
            <p className="text-xs text-gray-400">Profit Factor</p>
            <p className={`text-xl font-bold ${stats.profitFactor >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
              {isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-3">
            <p className="text-xs text-gray-400">Avg Win / Loss</p>
            <p className="text-xl font-bold text-gray-200">
              <span className="text-green-400">${stats.avgWin.toFixed(0)}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-red-400">${stats.avgLoss.toFixed(0)}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-3">
            <p className="text-xs text-gray-400">Best / Worst</p>
            <p className="text-xl font-bold text-gray-200">
              <span className="text-green-400">+${stats.bestTrade.toFixed(0)}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-red-400">${stats.worstTrade.toFixed(0)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Cumulative P&L area chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Cumulative P&L
              <span className={`text-base font-bold ${finalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatDollar(finalPnl)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cumulativeData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={areaColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                <YAxis tickFormatter={formatDollar} tick={{ fontSize: 10, fill: '#9ca3af' }} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
                  labelStyle={{ color: '#e5e7eb', fontSize: 11 }}
                  formatter={(v: number | undefined) => [formatDollar(v ?? 0), 'Cumulative P&L']}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="cumPnl"
                  stroke={areaColor}
                  strokeWidth={2}
                  fill="url(#pnlGradient)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* P&L by Symbol bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">P&L by Symbol</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={symbolData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis tickFormatter={formatDollar} tick={{ fontSize: 10, fill: '#9ca3af' }} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '6px' }}
                  labelStyle={{ color: '#e5e7eb', fontSize: 11 }}
                  formatter={(v: number | undefined) => [formatDollar(v ?? 0), 'Net P&L']}
                />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {symbolData.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
