// src/components/backtest/BacktestRunner.tsx

'use client';

import { useState } from 'react';
import { useBacktest } from '@/hooks/useBacktest';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BacktestResult } from '@/types/backtest';

function MetricCard({ title, value, suffix = '', color }: { 
  title: string; 
  value: number | string; 
  suffix?: string;
  color?: 'green' | 'red' | 'neutral';
}) {
  const colorClass = color === 'green' 
    ? 'text-green-600' 
    : color === 'red' 
    ? 'text-red-600' 
    : '';
    
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className={`text-xl font-bold ${colorClass}`}>
        {typeof value === 'number' ? value.toFixed(2) : value}{suffix}
      </p>
    </div>
  );
}

function BacktestResults({ result }: { result: BacktestResult }) {
  const { metrics, equityCurve, tradeLog } = result;
  
  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
          <CardDescription>{result.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard 
              title="Total Return" 
              value={metrics.totalReturn} 
              suffix="%"
              color={metrics.totalReturn >= 0 ? 'green' : 'red'}
            />
            <MetricCard 
              title="Annualized Return" 
              value={metrics.annualizedReturn} 
              suffix="%"
              color={metrics.annualizedReturn >= 0 ? 'green' : 'red'}
            />
            <MetricCard 
              title="Sharpe Ratio" 
              value={metrics.sharpeRatio}
              color={metrics.sharpeRatio >= 1 ? 'green' : metrics.sharpeRatio >= 0 ? 'neutral' : 'red'}
            />
            <MetricCard 
              title="Max Drawdown" 
              value={metrics.maxDrawdown} 
              suffix="%"
              color="red"
            />
            <MetricCard 
              title="Win Rate" 
              value={metrics.winRate} 
              suffix="%"
              color={metrics.winRate >= 50 ? 'green' : 'red'}
            />
            <MetricCard 
              title="Profit Factor" 
              value={metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor}
              color={metrics.profitFactor >= 1.5 ? 'green' : 'neutral'}
            />
            <MetricCard 
              title="Total Trades" 
              value={metrics.totalTrades}
            />
            <MetricCard 
              title="Avg Holding Days" 
              value={metrics.avgHoldingDays}
            />
          </div>
        </CardContent>
      </Card>

      {/* Win/Loss Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard 
              title="Avg Win" 
              value={metrics.avgWin} 
              suffix="%"
              color="green"
            />
            <MetricCard 
              title="Avg Loss" 
              value={metrics.avgLoss} 
              suffix="%"
              color="red"
            />
            <MetricCard 
              title="Sortino Ratio" 
              value={metrics.sortinoRatio}
              color={metrics.sortinoRatio >= 1.5 ? 'green' : 'neutral'}
            />
            <MetricCard 
              title="Initial Capital" 
              value={`$${result.config.initialCapital.toLocaleString()}`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Equity Curve Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
          <CardDescription>Portfolio value over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-end gap-1">
            {equityCurve.slice(-50).map((point, i) => {
              const minEquity = Math.min(...equityCurve.map(p => p.equity));
              const maxEquity = Math.max(...equityCurve.map(p => p.equity));
              const range = maxEquity - minEquity || 1;
              const height = ((point.equity - minEquity) / range) * 100;
              
              return (
                <div
                  key={i}
                  className={`flex-1 ${point.equity >= result.config.initialCapital ? 'bg-green-500' : 'bg-red-500'} rounded-t`}
                  style={{ height: `${Math.max(5, height)}%` }}
                  title={`${point.date}: $${point.equity.toFixed(2)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{equityCurve[0]?.date}</span>
            <span>{equityCurve[equityCurve.length - 1]?.date}</span>
          </div>
        </CardContent>
      </Card>

      {/* Trade Log */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Log ({tradeLog.length} trades)</CardTitle>
        </CardHeader>
        <CardContent>
          {tradeLog.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No trades executed</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead className="text-right">Entry $</TableHead>
                    <TableHead className="text-right">Exit $</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead>Exit Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeLog.slice(0, 20).map((trade, i) => (
                    <TableRow key={i}>
                      <TableCell>{trade.entryDate}</TableCell>
                      <TableCell>{trade.exitDate}</TableCell>
                      <TableCell className="text-right">${trade.entryPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${trade.exitPrice.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnl >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant={trade.exitReason === 'target' ? 'default' : trade.exitReason === 'stop' ? 'destructive' : 'secondary'}>
                          {trade.exitReason}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {tradeLog.length > 20 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Showing 20 of {tradeLog.length} trades
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BacktestRunner() {
  const [symbol, setSymbol] = useState('');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [initialCapital, setInitialCapital] = useState('100000');
  const [result, setResult] = useState<BacktestResult | null>(null);
  
  const { mutate: runBacktest, isPending, error } = useBacktest();
  
  const handleRun = () => {
    if (!symbol.trim()) return;
    
    runBacktest(
      {
        symbol: symbol.trim().toUpperCase(),
        config: {
          startDate,
          endDate,
          initialCapital: parseInt(initialCapital),
        },
      },
      {
        onSuccess: (data) => {
          setResult(data);
        },
      }
    );
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Backtest Configuration</CardTitle>
          <CardDescription>
            Test the EMA crossover strategy on historical data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capital">Initial Capital</Label>
              <Input
                id="capital"
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
              />
            </div>
          </div>
          
          <Button 
            onClick={handleRun} 
            disabled={isPending || !symbol.trim()}
            className="mt-4"
          >
            {isPending ? 'Running Backtest...' : 'Run Backtest'}
          </Button>
        </CardContent>
      </Card>
      
      {isPending && (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error.message}</p>
          </CardContent>
        </Card>
      )}
      
      {result && !isPending && <BacktestResults result={result} />}
      
      {!result && !isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <p className="mb-2">Configure and run a backtest to see results</p>
              <p className="text-sm">
                Strategy: EMA 9/21 Crossover with RSI and volume filters
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
