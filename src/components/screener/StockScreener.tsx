// src/components/screener/StockScreener.tsx

'use client';

import { useState } from 'react';
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
import { ScreenerResult } from '@/types/analysis';
import Link from 'next/link';
import { AIRecommendations } from './AIRecommendations';

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
                  <Link href={`/analysis?symbol=${result.symbol}`}>
                    <Button size="sm" variant="outline">
                      Analyze
                    </Button>
                  </Link>
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
  
  const { mutate: runScreener, isPending, error } = useCustomScreener();
  
  const handleSectorScan = () => {
    const sectorSymbols = SECTOR_WATCHLISTS[selectedSector as keyof typeof SECTOR_WATCHLISTS] || [];
    const limit = parseInt(scanLimit);
    
    runScreener(
      { 
        symbols: sectorSymbols.slice(0, limit), 
        filters: {} 
      },
      {
        onSuccess: (data) => {
          setResults(data.results);
          setLastScanType(`${selectedSector.charAt(0).toUpperCase() + selectedSector.slice(1)} Sector Scan`);
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
          setResults(data.results);
          setLastScanType('Custom Symbol Scan');
        },
      }
    );
  };
  
  const handleTopStocksScan = () => {
    const limit = parseInt(scanLimit);
    
    runScreener(
      { 
        symbols: DEFAULT_WATCHLIST.slice(0, limit), 
        filters: {} 
      },
      {
        onSuccess: (data) => {
          setResults(data.results);
          setLastScanType('Top Stocks Scan');
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
                  <Label>Max Stocks to Scan</Label>
                  <Select value={scanLimit} onValueChange={setScanLimit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 stocks</SelectItem>
                      <SelectItem value="10">10 stocks</SelectItem>
                      <SelectItem value="15">15 stocks</SelectItem>
                      <SelectItem value="20">20 stocks</SelectItem>
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
          <h3 className="text-lg font-semibold mb-4">
            Results {results.length > 0 && `(${results.length} stocks)`}
          </h3>
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
