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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BacktestResult, EquityPoint } from '@/types/backtest';

// All 11 SPDR sector names (same names returned by getSectorForSymbol)
const ALL_SECTORS = [
  'Technology',
  'Financials',
  'Healthcare',
  'Energy',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Materials',
  'Real Estate',
  'Utilities',
  'Communication Services',
];

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

function EquityChart({ equityCurve, benchmarkCurve, initialCapital }: {
  equityCurve: EquityPoint[];
  benchmarkCurve?: EquityPoint[];
  initialCapital: number;
}) {
  const display = equityCurve.slice(-50);
  const benchDisplay = benchmarkCurve ? benchmarkCurve.slice(-50) : [];

  const allEquities = [
    ...display.map(p => p.equity),
    ...benchDisplay.map(p => p.equity),
  ];
  const minEquity = Math.min(...allEquities);
  const maxEquity = Math.max(...allEquities);
  const range = maxEquity - minEquity || 1;

  const toHeight = (v: number) => Math.max(5, ((v - minEquity) / range) * 100);

  // Build SVG polyline for benchmark
  const svgPoints = benchDisplay.length > 0
    ? benchDisplay.map((p, i) => {
        const x = ((i + 0.5) / benchDisplay.length) * 100;
        const y = 100 - toHeight(p.equity);
        return `${x},${y}`;
      }).join(' ')
    : '';

  return (
    <div className="relative h-32">
      {/* Strategy bars */}
      <div className="flex items-end gap-1 h-full">
        {display.map((point, i) => (
          <div
            key={i}
            className={`flex-1 ${point.equity >= initialCapital ? 'bg-green-500' : 'bg-red-500'} rounded-t opacity-80`}
            style={{ height: `${toHeight(point.equity)}%` }}
            title={`${point.date}: $${point.equity.toFixed(2)}`}
          />
        ))}
      </div>
      {/* SPY benchmark line overlay */}
      {svgPoints && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={svgPoints}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

function BacktestResults({ result }: { result: BacktestResult }) {
  const { metrics, equityCurve, benchmarkCurve, tradeLog } = result;
  const spyReturn = benchmarkCurve && benchmarkCurve.length > 0
    ? ((benchmarkCurve[benchmarkCurve.length - 1].equity / result.config.initialCapital - 1) * 100)
    : null;

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
            {spyReturn !== null && (
              <MetricCard
                title="SPY Return (benchmark)"
                value={spyReturn}
                suffix="%"
                color="neutral"
              />
            )}
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
              title="Avg Holding"
              value={metrics.avgHoldingDays < 0.5 ? 'Intraday' : `${metrics.avgHoldingDays.toFixed(1)}d`}
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
            <MetricCard
              title="Ending Capital"
              value={`$${Math.round(equityCurve[equityCurve.length - 1]?.equity ?? result.config.initialCapital).toLocaleString()}`}
              color={(equityCurve[equityCurve.length - 1]?.equity ?? result.config.initialCapital) >= result.config.initialCapital ? 'green' : 'red'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Equity Curve Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
          <CardDescription>
            Portfolio value over time
            {benchmarkCurve && (
              <span className="ml-2 text-blue-500 font-medium">— SPY buy-and-hold benchmark</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquityChart
            equityCurve={equityCurve}
            benchmarkCurve={benchmarkCurve}
            initialCapital={result.config.initialCapital}
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{equityCurve[0]?.date}</span>
            <span>{equityCurve[equityCurve.length - 1]?.date}</span>
          </div>
          {benchmarkCurve && (
            <div className="flex gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-green-500 opacity-80" />
                Strategy
              </span>
              <span className="flex items-center gap-1">
                <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#3b82f6" strokeWidth="2" /></svg>
                SPY benchmark
              </span>
            </div>
          )}
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
                    <TableHead>Symbol</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Entry $</TableHead>
                    <TableHead className="text-right">Exit $</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead>Exit Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeLog.slice(0, 50).map((trade, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>{trade.entryDate}</TableCell>
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
              {tradeLog.length > 50 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Showing 50 of {tradeLog.length} trades
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Strategies grouped by type for the select dropdown
const INTRADAY_STRATEGIES = [
  {
    value: 'portfolio_auto_mode',
    name: 'Portfolio Auto Mode — Full Watchlist (~59 stocks)',
    description: 'Scans the full intraday watchlist (~59 stocks) each day — same logic as auto-trade. Checks all three signals per symbol, picks the best R:R signals with sector diversity (max 1 per sector), takes up to 3 trades per day. Includes SPY buy-and-hold benchmark. Closest simulation of how auto-mode would have performed portfolio-wide.',
  },
  {
    value: 'auto_mode',
    name: 'Auto Mode — All Signals (Single Stock)',
    description: 'Replicates exactly what the auto-trade cron does on a single stock. Checks Gap Fade, VWAP Reversion, and ORB each day — takes the best R:R signal (good/excellent quality only).',
  },
  {
    value: 'gap_fade',
    name: 'Gap Fade',
    description: 'Fades down-gaps >1.5% back toward the prior close. Entry at open, stop ~0.5×ATR below, target at 60% gap fill. Same logic as the live signal.',
  },
  {
    value: 'vwap_reversion',
    name: 'VWAP Reversion',
    description: 'Buys when the day\'s low dips >1.5% below the daily VWAP proxy and the bar closes bullish. Target = VWAP. Only fires when daily trend is not bearish.',
  },
  {
    value: 'orb',
    name: 'ORB (Opening Range Breakout)',
    description: 'Enters when the stock opens weak, then breaks out to close in the upper 40% of the day\'s range with 1.5× average volume. Target = ORB high + 1.5× range.',
  },
];

const SWING_STRATEGIES = [
  { value: 'ai_prediction', name: 'AI Price Prediction', description: 'ML-style multi-factor analysis (trend, momentum, patterns, volume, regime) to predict 5-day price direction' },
  { value: 'ema_crossover', name: 'EMA Crossover', description: 'Buy when fast EMA crosses above slow EMA with RSI and volume confirmation' },
  { value: 'rsi_mean_reversion', name: 'RSI Mean Reversion', description: 'Buy oversold conditions (RSI < 30), sell when RSI normalizes' },
  { value: 'signal_score', name: 'AI Signal Score', description: 'Uses comprehensive signal scoring (trend, momentum, volume, structure) for entries/exits' },
  { value: 'macd_momentum', name: 'MACD Momentum', description: 'Trade MACD crossovers with histogram confirmation' },
  { value: 'bollinger_breakout', name: 'Bollinger Breakout', description: 'Enter on breakouts above upper band with volume' },
];

const ALL_STRATEGIES = [...INTRADAY_STRATEGIES, ...SWING_STRATEGIES];

export function BacktestRunner() {
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState('portfolio_auto_mode');
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [initialCapital, setInitialCapital] = useState('100000');
  const [excludedSectors, setExcludedSectors] = useState<string[]>([]);
  const [sectorFiltersOpen, setSectorFiltersOpen] = useState(false);
  const [loadingCurrentBlocks, setLoadingCurrentBlocks] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const { mutate: runBacktest, isPending, error } = useBacktest();

  const selectedStrategy = ALL_STRATEGIES.find(s => s.value === strategy);
  const isIntradayStrategy = INTRADAY_STRATEGIES.some(s => s.value === strategy);
  const isPortfolioMode = strategy === 'portfolio_auto_mode';

  const toggleSector = (sector: string) => {
    setExcludedSectors(prev =>
      prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
    );
  };

  const loadCurrentBlocks = async () => {
    setLoadingCurrentBlocks(true);
    try {
      const res = await fetch('/api/settings/skip-sectors');
      if (res.ok) {
        const data = await res.json();
        setExcludedSectors(data.sectors ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCurrentBlocks(false);
    }
  };

  const handleRun = () => {
    if (!isPortfolioMode && !symbol.trim()) return;

    runBacktest(
      {
        symbol: isPortfolioMode ? undefined : symbol.trim().toUpperCase(),
        strategy,
        config: {
          startDate,
          endDate,
          initialCapital: parseInt(initialCapital),
        },
        excludedSectors: excludedSectors.length > 0 ? excludedSectors : undefined,
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
            Test trading strategies on historical data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Strategy Selection */}
          <div className="space-y-2">
            <Label htmlFor="strategy">Strategy</Label>
            <Select value={strategy} onValueChange={(v) => { setStrategy(v); setResult(null); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Intraday (matches auto-trade logic)
                </div>
                {INTRADAY_STRATEGIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="font-medium">{s.name}</span>
                  </SelectItem>
                ))}
                <div className="px-2 py-1 mt-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t">
                  Swing / Multi-day
                </div>
                {SWING_STRATEGIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="font-medium">{s.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStrategy && (
              <p className="text-sm text-muted-foreground">
                {selectedStrategy.description}
              </p>
            )}
            {isIntradayStrategy && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Simulated from daily OHLC bars — each trade opens and closes within the same day. Results approximate what auto-trade would have generated historically.
              </p>
            )}
            {isPortfolioMode && (
              <p className="text-xs text-muted-foreground">
                Portfolio: ~59 stocks (full intraday watchlist). May take 20–40 seconds to fetch data.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Symbol — hidden for portfolio mode */}
            {!isPortfolioMode && (
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </div>
            )}
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

          {/* Sector Filters — shown for intraday strategies */}
          {isIntradayStrategy && (
            <div className="border rounded-lg p-3 space-y-3">
              <button
                type="button"
                className="flex items-center justify-between w-full text-sm font-medium"
                onClick={() => setSectorFiltersOpen(o => !o)}
              >
                <span>
                  Sector Filters
                  {excludedSectors.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {excludedSectors.length} excluded
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground">{sectorFiltersOpen ? '▲' : '▼'}</span>
              </button>

              {sectorFiltersOpen && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Check sectors to exclude from the backtest. No historical sector block records exist — this simulates the effect of having blocked them throughout the period.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadCurrentBlocks}
                      disabled={loadingCurrentBlocks}
                      className="ml-3 shrink-0 text-xs"
                    >
                      {loadingCurrentBlocks ? 'Loading…' : 'Load current blocks'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {ALL_SECTORS.map(sector => (
                      <label key={sector} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excludedSectors.includes(sector)}
                          onChange={() => toggleSector(sector)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {sector}
                      </label>
                    ))}
                  </div>
                  {excludedSectors.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => setExcludedSectors([])}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={isPending || (!isPortfolioMode && !symbol.trim())}
            className="mt-4"
          >
            {isPending ? 'Running Backtest…' : 'Run Backtest'}
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
                Selected: {selectedStrategy?.name || 'No strategy selected'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
