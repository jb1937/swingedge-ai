// src/components/screener/StockScreener.tsx

'use client';

import { useState, useEffect } from 'react';
import { useCustomScreener } from '@/hooks/useScreener';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScreenerResult } from '@/types/analysis';
import Link from 'next/link';
import { AIRecommendations } from './AIRecommendations';
import { useTradingStore, useScreenerResults } from '@/stores/trading-store';

// Stock lists moved to client-side to avoid server module imports
const DEFAULT_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 
  'NFLX', 'CRM', 'ADBE', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO',
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA',
  'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'LLY',
  'XOM', 'CVX', 'COP', 'SLB',
  'HD', 'WMT', 'TGT', 'COST', 'LOW',
  'BA', 'CAT', 'GE', 'HON', 'RTX', 'LMT', 'UPS',
  'SPY', 'QQQ', 'IWM', 'DIA',
];

const SECTOR_WATCHLISTS = {
  technology: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'CRM', 'ADBE', 'INTC', 'ORCL', 'CSCO', 'QCOM', 'AVGO', 'MU', 'NOW', 'PANW', 'CRWD'],
  financials: ['JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'AXP', 'BLK', 'SCHW', 'USB', 'PNC', 'SPGI', 'MCO', 'ICE', 'CME'],
  healthcare: ['JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'TMO', 'ABT', 'DHR', 'MDT', 'ISRG', 'MRNA', 'REGN', 'VRTX'],
  energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD', 'DVN', 'HAL'],
  consumer: ['HD', 'WMT', 'TGT', 'COST', 'LOW', 'NKE', 'SBUX', 'MCD', 'PG', 'KO', 'PEP', 'DIS'],
  industrials: ['BA', 'CAT', 'GE', 'HON', 'RTX', 'LMT', 'UPS', 'FDX', 'DE', 'UNP', 'CSX'],
  etfs: ['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'ARKK', 'XLF', 'XLE', 'XLK'],
  momentum: ['NVDA', 'AMD', 'TSLA', 'META', 'COIN', 'PLTR', 'SOFI', 'RIVN', 'LCID'],
};

function parseCustomSymbols(input: string): string[] {
  return input
    .toUpperCase()
    .split(/[\s,;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 5 && /^[A-Z.]+$/.test(s));
}

// Quick pin dialog for screener results
function QuickPinDialog({ result }: { result: ScreenerResult }) {
  const [open, setOpen] = useState(false);
  const [entryPrice, setEntryPrice] = useState(result.price.toFixed(2));
  const [stopLossPercent, setStopLossPercent] = useState('5');
  const [takeProfitPercent, setTakeProfitPercent] = useState('10');
  const [side, setSide] = useState<'long' | 'short'>('long');
  
  const addTradeIdea = useTradingStore((state) => state.addTradeIdea);
  
  const entry = parseFloat(entryPrice) || result.price;
  const stopLoss = side === 'long' 
    ? entry * (1 - parseFloat(stopLossPercent) / 100)
    : entry * (1 + parseFloat(stopLossPercent) / 100);
  const takeProfit = side === 'long'
    ? entry * (1 + parseFloat(takeProfitPercent) / 100)
    : entry * (1 - parseFloat(takeProfitPercent) / 100);
  const riskReward = parseFloat(takeProfitPercent) / parseFloat(stopLossPercent);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    addTradeIdea({
      symbol: result.symbol,
      price: result.price,
      entryPrice: entry,
      stopLoss,
      takeProfit,
      side,
      technicalScore: result.technicalScore,
      signalStrength: result.signalStrength,
      notes: result.matchedCriteria.join(', '),
      source: 'screener',
    });
    
    setOpen(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-blue-500 hover:text-blue-400">
          📌
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Pin {result.symbol}</DialogTitle>
          <DialogDescription>
            Quick add to Trade Ideas
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className={`flex-1 ${side === 'long' ? 'bg-green-600' : 'bg-gray-700'}`}
              onClick={() => setSide('long')}
            >
              Long
            </Button>
            <Button
              type="button"
              size="sm"
              className={`flex-1 ${side === 'short' ? 'bg-red-600' : 'bg-gray-700'}`}
              onClick={() => setSide('short')}
            >
              Short
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Entry</Label>
              <Input
                type="number"
                step="0.01"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="bg-gray-800 border-gray-700 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-red-400">Stop %</Label>
              <Input
                type="number"
                step="0.5"
                value={stopLossPercent}
                onChange={(e) => setStopLossPercent(e.target.value)}
                className="bg-gray-800 border-gray-700 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-green-400">Target %</Label>
              <Input
                type="number"
                step="0.5"
                value={takeProfitPercent}
                onChange={(e) => setTakeProfitPercent(e.target.value)}
                className="bg-gray-800 border-gray-700 h-8 text-sm"
              />
            </div>
          </div>
          
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Stop Loss:</span>
              <span className="text-red-400">${stopLoss.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Target:</span>
              <span className="text-green-400">${takeProfit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>R:R Ratio:</span>
              <span className={riskReward >= 2 ? 'text-green-400' : 'text-yellow-400'}>
                {riskReward.toFixed(2)}:1
              </span>
            </div>
          </div>
          
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" size="sm">
            Add to Trade Ideas
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScreenerResultsTable({ results, isLoading }: { results: ScreenerResult[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  
  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            No stocks match the current criteria
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Signal</TableHead>
              <TableHead>Criteria</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => (
              <TableRow key={result.symbol}>
                <TableCell className="font-bold">{result.symbol}</TableCell>
                <TableCell className="text-right">
                  ${result.price.toFixed(2)}
                </TableCell>
                <TableCell
                  className={`text-right ${
                    result.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {result.changePercent >= 0 ? '+' : ''}
                  {result.changePercent.toFixed(2)}%
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          result.technicalScore >= 70
                            ? 'bg-green-500'
                            : result.technicalScore >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${result.technicalScore}%` }}
                      />
                    </div>
                    <span className="text-sm">{result.technicalScore}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`font-semibold ${
                      result.signalStrength >= 0.7
                        ? 'text-green-600'
                        : result.signalStrength >= 0.5
                        ? 'text-yellow-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {(result.signalStrength * 100).toFixed(0)}%
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {result.matchedCriteria.slice(0, 3).map((criteria, i) => (
                      <Badge
                        key={i}
                        variant={
                          criteria.includes('Bullish') || criteria.includes('Oversold')
                            ? 'default'
                            : criteria.includes('Bearish') || criteria.includes('Overbought')
                            ? 'destructive'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {criteria}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <QuickPinDialog result={result} />
                    <Link href={`/analysis?symbol=${result.symbol}`}>
                      <Button size="sm" variant="outline">
                        Analyze
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function StockScreener() {
  const [activeTab, setActiveTab] = useState('sector');
  const [selectedSector, setSelectedSector] = useState<string>('technology');
  const [customSymbols, setCustomSymbols] = useState('');
  const [scanLimit, setScanLimit] = useState('10');
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [lastScanType, setLastScanType] = useState('');
  const [scanStats, setScanStats] = useState<{ totalScanned: number; totalSuccessful: number } | null>(null);
  
  const { mutate: runScreener, isPending, error } = useCustomScreener();
  
  // Store integration for persistence
  const { setScreenerResults } = useTradingStore();
  const storedResults = useScreenerResults();
  const storedScanType = useTradingStore((state) => state.lastScreenerScanType);
  
  // Restore results from store on mount
  useEffect(() => {
    if (storedResults.length > 0 && results.length === 0) {
      setResults(storedResults);
      setLastScanType(storedScanType);
    }
  }, []);
  
  // Save results to store whenever they change
  const saveAndSetResults = (newResults: ScreenerResult[], scanType: string) => {
    setResults(newResults);
    setLastScanType(scanType);
    setScreenerResults(newResults, scanType);
  };
  
  const handleSectorScan = () => {
    const sectorSymbols = SECTOR_WATCHLISTS[selectedSector as keyof typeof SECTOR_WATCHLISTS] || [];
    // Handle "all" option - undefined limit means return all results
    const limit = scanLimit === 'all' ? undefined : parseInt(scanLimit);
    
    // Send ALL sector symbols, apply limit server-side to get top N results
    runScreener(
      { 
        symbols: sectorSymbols,  // Send all, don't pre-slice
        filters: {},
        limit  // Apply limit after scanning to return top N (undefined = all)
      },
      {
        onSuccess: (data) => {
          const scanType = `${selectedSector.charAt(0).toUpperCase() + selectedSector.slice(1)} Sector Scan`;
          saveAndSetResults(data.results, scanType);
          setScanStats({
            totalScanned: data.totalScanned || sectorSymbols.length,
            totalSuccessful: data.totalSuccessful || data.results.length
          });
        },
      }
    );
  };
  
  const handleCustomScan = () => {
    const symbols = parseCustomSymbols(customSymbols);
    if (symbols.length === 0) {
      return;
    }
    
    runScreener(
      { symbols, filters: {} },
      {
        onSuccess: (data) => {
          saveAndSetResults(data.results, 'Custom Symbol Scan');
          setScanStats({
            totalScanned: data.totalScanned || symbols.length,
            totalSuccessful: data.totalSuccessful || data.results.length
          });
        },
      }
    );
  };
  
  const handleTopStocksScan = () => {
    const limit = parseInt(scanLimit);
    
    // Send all stocks, apply limit server-side
    runScreener(
      { 
        symbols: DEFAULT_WATCHLIST,  // Send all, don't pre-slice
        filters: {},
        limit  // Apply limit after scanning to return top N
      },
      {
        onSuccess: (data) => {
          saveAndSetResults(data.results, 'Top Stocks Scan');
          setScanStats({
            totalScanned: data.totalScanned || DEFAULT_WATCHLIST.length,
            totalSuccessful: data.totalSuccessful || data.results.length
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stock Screener</CardTitle>
          <CardDescription>
            Scan {DEFAULT_WATCHLIST.length}+ stocks for trading opportunities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sector">By Sector</TabsTrigger>
              <TabsTrigger value="custom">Custom List</TabsTrigger>
              <TabsTrigger value="top">Top Stocks</TabsTrigger>
            </TabsList>
            
            <TabsContent value="sector" className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sector</Label>
                  <Select value={selectedSector} onValueChange={setSelectedSector}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technology">Technology (20 stocks)</SelectItem>
                      <SelectItem value="financials">Financials (17 stocks)</SelectItem>
                      <SelectItem value="healthcare">Healthcare (17 stocks)</SelectItem>
                      <SelectItem value="energy">Energy (12 stocks)</SelectItem>
                      <SelectItem value="consumer">Consumer (12 stocks)</SelectItem>
                      <SelectItem value="industrials">Industrials (11 stocks)</SelectItem>
                      <SelectItem value="etfs">ETFs (10 stocks)</SelectItem>
                      <SelectItem value="momentum">Momentum/Meme (9 stocks)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Top Results to Show</Label>
                  <Select value={scanLimit} onValueChange={setScanLimit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Top 5</SelectItem>
                      <SelectItem value="10">Top 10</SelectItem>
                      <SelectItem value="15">Top 15</SelectItem>
                      <SelectItem value="20">Top 20</SelectItem>
                      <SelectItem value="all">All (scan entire sector)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleSectorScan} disabled={isPending} className="w-full">
                {isPending ? 'Scanning...' : 'Scan Sector'}
              </Button>
            </TabsContent>
            
            <TabsContent value="custom" className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Enter Symbols (comma or space separated)</Label>
                <Input
                  placeholder="AAPL, MSFT, GOOGL, NVDA, TSLA"
                  value={customSymbols}
                  onChange={(e) => setCustomSymbols(e.target.value.toUpperCase())}
                />
                <p className="text-xs text-muted-foreground">
                  Enter up to 20 symbols to scan. Separate with commas or spaces.
                </p>
              </div>
              <Button 
                onClick={handleCustomScan} 
                disabled={isPending || !customSymbols.trim()}
                className="w-full"
              >
                {isPending ? 'Scanning...' : 'Scan Custom List'}
              </Button>
            </TabsContent>
            
            <TabsContent value="top" className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Stocks to Scan</Label>
                <Select value={scanLimit} onValueChange={setScanLimit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Top 5 stocks</SelectItem>
                    <SelectItem value="10">Top 10 stocks</SelectItem>
                    <SelectItem value="15">Top 15 stocks</SelectItem>
                    <SelectItem value="20">Top 20 stocks</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Scans from our watchlist of {DEFAULT_WATCHLIST.length}+ popular stocks
                </p>
              </div>
              <Button onClick={handleTopStocksScan} disabled={isPending} className="w-full">
                {isPending ? 'Scanning...' : 'Scan Top Stocks'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error.message}</p>
          </CardContent>
        </Card>
      )}
      
      {(results.length > 0 || isPending) && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Results {results.length > 0 && `(${results.length} stocks)`}
            </h3>
            {scanStats && !isPending && (
              <p className="text-sm text-muted-foreground">
                Scanned {scanStats.totalScanned} stocks • {scanStats.totalSuccessful} analyzed successfully • Showing top {results.length}
              </p>
            )}
          </div>
          <ScreenerResultsTable results={results} isLoading={isPending} />
        </div>
      )}

      {results.length > 0 && !isPending && (
        <AIRecommendations results={results} scanType={lastScanType} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-semibold text-green-700 mb-2">Bullish Signals</h4>
              <p className="text-green-600">
                Look for stocks with technical scores above 70 and bullish MACD crossovers
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-700 mb-2">Oversold Bounces</h4>
              <p className="text-blue-600">
                RSI below 30 indicates potential reversal opportunities
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <h4 className="font-semibold text-purple-700 mb-2">Risk Management</h4>
              <p className="text-purple-600">
                Always set stop losses and size positions based on ATR
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
