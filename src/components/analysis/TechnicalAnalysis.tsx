// src/components/analysis/TechnicalAnalysis.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAnalysis, TechnicalAnalysisData } from '@/hooks/useAnalysis';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { TradeThesisCard } from './TradeThesisCard';
import { TradeThesis } from '@/types/analysis';
import { MarketRegimeCard } from './MarketRegimeCard';
import { SentimentCard } from './SentimentCard';
import { PredictionCard } from './PredictionCard';
import { OptionsFlowCard } from './OptionsFlowCard';
import { useTradingStore, useCurrentAnalysis, useAnalysisHistory } from '@/stores/trading-store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function IndicatorCard({ 
  title, 
  value, 
  description,
  status,
}: { 
  title: string; 
  value: string | number; 
  description?: string;
  status?: 'bullish' | 'bearish' | 'neutral';
}) {
  const statusColors = {
    bullish: 'text-green-600',
    bearish: 'text-red-600',
    neutral: 'text-gray-600',
  };
  
  return (
    <div className="p-3 border rounded-lg">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className={`text-lg font-semibold ${status ? statusColors[status] : ''}`}>
        {typeof value === 'number' ? value.toFixed(2) : value}
      </p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function AnalysisResults({ data }: { data: TechnicalAnalysisData }) {
  const { indicators, technicalScore, signalDirection } = data;
  
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  const getDirectionBadge = (direction: string) => {
    switch (direction) {
      case 'long':
        return <Badge className="bg-green-600">BULLISH</Badge>;
      case 'short':
        return <Badge className="bg-red-600">BEARISH</Badge>;
      default:
        return <Badge variant="secondary">NEUTRAL</Badge>;
    }
  };
  
  const getRsiStatus = (rsi: number): 'bullish' | 'bearish' | 'neutral' => {
    if (rsi < 30) return 'bullish'; // Oversold
    if (rsi > 70) return 'bearish'; // Overbought
    return 'neutral';
  };
  
  return (
    <div className="space-y-6">
      {/* Header with Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">{data.symbol}</h2>
              <p className={`text-2xl font-semibold ${data.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${data.latestPrice.toFixed(2)}
                <span className="ml-2 text-lg">
                  {data.priceChange >= 0 ? '+' : ''}{data.priceChange.toFixed(2)} 
                  ({data.priceChangePercent >= 0 ? '+' : ''}{data.priceChangePercent.toFixed(2)}%)
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground mb-1">Technical Score</p>
              <div className="flex items-center gap-3">
                <div className="w-32 h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getScoreColor(technicalScore)} transition-all`}
                    style={{ width: `${technicalScore}%` }}
                  />
                </div>
                <span className="text-2xl font-bold">{technicalScore}</span>
              </div>
              <div className="mt-2">{getDirectionBadge(signalDirection)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trend Indicators */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Indicators</CardTitle>
          <CardDescription>Moving averages and trend strength</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IndicatorCard 
              title="EMA 9" 
              value={indicators.ema9}
              status={data.latestPrice > indicators.ema9 ? 'bullish' : 'bearish'}
            />
            <IndicatorCard 
              title="EMA 21" 
              value={indicators.ema21}
              status={data.latestPrice > indicators.ema21 ? 'bullish' : 'bearish'}
            />
            <IndicatorCard 
              title="EMA 50" 
              value={indicators.ema50}
              status={data.latestPrice > indicators.ema50 ? 'bullish' : 'bearish'}
            />
            <IndicatorCard 
              title="EMA 200" 
              value={indicators.ema200}
              status={data.latestPrice > indicators.ema200 ? 'bullish' : 'bearish'}
            />
            <IndicatorCard 
              title="MACD" 
              value={indicators.macd.macd}
              status={indicators.macd.histogram > 0 ? 'bullish' : 'bearish'}
            />
            <IndicatorCard 
              title="MACD Signal" 
              value={indicators.macd.signal}
            />
            <IndicatorCard 
              title="MACD Histogram" 
              value={indicators.macd.histogram}
              status={indicators.macd.histogram > 0 ? 'bullish' : 'bearish'}
            />
            <IndicatorCard 
              title="ADX" 
              value={indicators.adx}
              description={indicators.adx > 25 ? 'Strong Trend' : 'Weak Trend'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Momentum Indicators */}
      <Card>
        <CardHeader>
          <CardTitle>Momentum Indicators</CardTitle>
          <CardDescription>Overbought/oversold conditions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IndicatorCard 
              title="RSI (14)" 
              value={indicators.rsi14}
              description={indicators.rsi14 < 30 ? 'Oversold' : indicators.rsi14 > 70 ? 'Overbought' : 'Neutral'}
              status={getRsiStatus(indicators.rsi14)}
            />
            <IndicatorCard 
              title="Stoch RSI K" 
              value={indicators.stochRsi.k}
              status={indicators.stochRsi.k < 20 ? 'bullish' : indicators.stochRsi.k > 80 ? 'bearish' : 'neutral'}
            />
            <IndicatorCard 
              title="Stoch RSI D" 
              value={indicators.stochRsi.d}
            />
            <IndicatorCard 
              title="Williams %R" 
              value={indicators.williamsR}
              status={indicators.williamsR < -80 ? 'bullish' : indicators.williamsR > -20 ? 'bearish' : 'neutral'}
            />
            <IndicatorCard 
              title="MFI" 
              value={indicators.mfi}
              description={indicators.mfi < 30 ? 'Oversold' : indicators.mfi > 70 ? 'Overbought' : 'Neutral'}
              status={indicators.mfi < 30 ? 'bullish' : indicators.mfi > 70 ? 'bearish' : 'neutral'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Volatility */}
      <Card>
        <CardHeader>
          <CardTitle>Volatility & Volume</CardTitle>
          <CardDescription>Bollinger Bands, ATR, and volume indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IndicatorCard 
              title="ATR (14)" 
              value={indicators.atr14}
              description="Average True Range"
            />
            <IndicatorCard 
              title="BB Upper" 
              value={indicators.bollingerBands.upper}
            />
            <IndicatorCard 
              title="BB Middle" 
              value={indicators.bollingerBands.middle}
            />
            <IndicatorCard 
              title="BB Lower" 
              value={indicators.bollingerBands.lower}
            />
            <IndicatorCard 
              title="BB Width" 
              value={(indicators.bollingerBands.width * 100).toFixed(2) + '%'}
            />
            <IndicatorCard 
              title="OBV" 
              value={(indicators.obv / 1000000).toFixed(2) + 'M'}
              description="On-Balance Volume"
            />
            <IndicatorCard 
              title="VWAP" 
              value={indicators.vwap}
              description="Vol Weighted Avg Price"
            />
          </div>
        </CardContent>
      </Card>

      {/* Support/Resistance */}
      <Card>
        <CardHeader>
          <CardTitle>Support & Resistance Levels</CardTitle>
          <CardDescription>Key price levels based on recent price action</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-green-600 mb-2">Support Levels</h4>
              <div className="space-y-2">
                {indicators.supportLevels.length > 0 ? (
                  indicators.supportLevels.map((level, i) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-green-50 rounded">
                      <span>S{i + 1}</span>
                      <span className="font-mono">${level.toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No clear support levels</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-red-600 mb-2">Resistance Levels</h4>
              <div className="space-y-2">
                {indicators.resistanceLevels.length > 0 ? (
                  indicators.resistanceLevels.map((level, i) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-red-50 rounded">
                      <span>R{i + 1}</span>
                      <span className="font-mono">${level.toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No clear resistance levels</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Pin to Trade Ideas Dialog
function PinToTradeIdeasDialog({ data, thesis }: { data: TechnicalAnalysisData; thesis?: TradeThesis | null }) {
  const [open, setOpen] = useState(false);
  const [entryPrice, setEntryPrice] = useState(data.latestPrice.toFixed(2));
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [side, setSide] = useState<'long' | 'short'>(data.signalDirection === 'short' ? 'short' : 'long');
  const [notes, setNotes] = useState('');
  const [useThesisValues, setUseThesisValues] = useState(true);
  
  const addTradeIdea = useTradingStore((state) => state.addTradeIdea);
  
  // Calculate suggested stop loss and take profit - prefer AI thesis values when available
  useEffect(() => {
    const atr = data.indicators.atr14;
    const price = parseFloat(entryPrice) || data.latestPrice;
    
    // Use AI thesis values if available and user wants them
    if (thesis && useThesisValues) {
      setEntryPrice(thesis.suggestedEntry.toFixed(2));
      setStopLoss(thesis.suggestedStop.toFixed(2));
      setTakeProfit(thesis.targetPrice.toFixed(2));
      return;
    }
    
    // Fallback to ATR/support-resistance based calculations
    if (side === 'long') {
      // For long: stop loss below entry, take profit above
      const suggestedStop = data.indicators.supportLevels[0] || (price - atr * 2);
      const suggestedTarget = data.indicators.resistanceLevels[0] || (price + atr * 3);
      setStopLoss(suggestedStop.toFixed(2));
      setTakeProfit(suggestedTarget.toFixed(2));
    } else {
      // For short: stop loss above entry, take profit below
      const suggestedStop = data.indicators.resistanceLevels[0] || (price + atr * 2);
      const suggestedTarget = data.indicators.supportLevels[0] || (price - atr * 3);
      setStopLoss(suggestedStop.toFixed(2));
      setTakeProfit(suggestedTarget.toFixed(2));
    }
  }, [side, entryPrice, data, thesis, useThesisValues]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    addTradeIdea({
      symbol: data.symbol,
      price: data.latestPrice,
      entryPrice: parseFloat(entryPrice),
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      side,
      technicalScore: data.technicalScore,
      signalStrength: data.technicalScore / 100,
      notes: notes || undefined,
      source: 'analysis',
    });
    
    setOpen(false);
  };
  
  const riskReward = stopLoss && takeProfit && entryPrice
    ? Math.abs(parseFloat(takeProfit) - parseFloat(entryPrice)) / Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss))
    : 0;
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
          📌 Pin to Trade Ideas
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Pin {data.symbol} to Trade Ideas</DialogTitle>
          <DialogDescription>
            Set your entry, stop loss, and take profit levels
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* AI Thesis Toggle */}
          {thesis && (
            <div className="p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 text-sm">🤖 AI Thesis Available</span>
                  <Badge className={useThesisValues ? 'bg-blue-600' : 'bg-gray-600'}>
                    {useThesisValues ? 'Using AI Values' : 'Using Technical Levels'}
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setUseThesisValues(!useThesisValues)}
                >
                  {useThesisValues ? 'Use Technical' : 'Use AI Thesis'}
                </Button>
              </div>
              {useThesisValues && (
                <p className="text-xs text-blue-300 mt-2">
                  Entry: ${thesis.suggestedEntry.toFixed(2)} | Stop: ${thesis.suggestedStop.toFixed(2)} | Target: ${thesis.targetPrice.toFixed(2)}
                </p>
              )}
            </div>
          )}
          
          {!thesis && (
            <div className="p-2 bg-gray-800 rounded-lg text-xs text-gray-400 text-center">
              💡 Generate an AI Trade Thesis first for AI-recommended levels
            </div>
          )}
          
          <div className="flex gap-2">
            <Button
              type="button"
              className={`flex-1 ${side === 'long' ? 'bg-green-600' : 'bg-gray-700'}`}
              onClick={() => setSide('long')}
            >
              Long
            </Button>
            <Button
              type="button"
              className={`flex-1 ${side === 'short' ? 'bg-red-600' : 'bg-gray-700'}`}
              onClick={() => setSide('short')}
            >
              Short
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Entry Price</Label>
              <Input
                type="number"
                step="0.01"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-red-400">Stop Loss</Label>
              <Input
                type="number"
                step="0.01"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-green-400">Take Profit</Label>
              <Input
                type="number"
                step="0.01"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          
          <div className="p-3 bg-gray-800 rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Risk/Reward Ratio:</span>
              <span className={`font-bold ${riskReward >= 2 ? 'text-green-400' : riskReward >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                {riskReward.toFixed(2)}:1
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-gray-400">Technical Score:</span>
              <span className="font-bold">{data.technicalScore}</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="Entry reason, key levels to watch..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-gray-800 border-gray-700"
            />
          </div>
          
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
            Add to Trade Ideas
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TechnicalAnalysis() {
  const [symbol, setSymbol] = useState('');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [currentThesis, setCurrentThesis] = useState<TradeThesis | null>(null);
  
  const { data, isLoading, error, refetch } = useAnalysis({
    symbol: searchSymbol,
    enabled: !!searchSymbol,
  });
  
  // Clear thesis when symbol changes
  useEffect(() => {
    setCurrentThesis(null);
  }, [searchSymbol]);
  
  // Store integration
  const { setCurrentAnalysis, setTradeIdeasPanelOpen } = useTradingStore();
  const currentAnalysis = useCurrentAnalysis();
  const analysisHistory = useAnalysisHistory();
  
  // Save analysis to store when data changes
  useEffect(() => {
    if (data) {
      setCurrentAnalysis({
        symbol: data.symbol,
        latestPrice: data.latestPrice,
        priceChange: data.priceChange,
        priceChangePercent: data.priceChangePercent,
        technicalScore: data.technicalScore,
        signalDirection: data.signalDirection,
        supportLevels: data.indicators.supportLevels,
        resistanceLevels: data.indicators.resistanceLevels,
        atr14: data.indicators.atr14,
        rsi14: data.indicators.rsi14,
        timestamp: new Date(),
      });
    }
  }, [data, setCurrentAnalysis]);
  
  // Restore from store on mount if no search symbol
  useEffect(() => {
    if (!searchSymbol && currentAnalysis) {
      setSymbol(currentAnalysis.symbol);
      setSearchSymbol(currentAnalysis.symbol);
    }
  }, []);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      setSearchSymbol(symbol.trim().toUpperCase());
    }
  };
  
  const handleHistorySelect = (sym: string) => {
    setSymbol(sym);
    setSearchSymbol(sym);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Enter stock symbol (e.g., AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="max-w-xs"
          />
          <Button type="submit" disabled={!symbol.trim()}>
            Analyze
          </Button>
        </form>
        {searchSymbol && (
          <Button type="button" variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        )}
        {data && <PinToTradeIdeasDialog data={data} thesis={currentThesis} />}
        
        {/* Analysis History */}
        {analysisHistory.length > 0 && (
          <div className="flex items-center gap-2 ml-4">
            <span className="text-sm text-muted-foreground">Recent:</span>
            {analysisHistory.slice(0, 5).map((item) => (
              <Button
                key={item.symbol}
                variant="ghost"
                size="sm"
                className={`${item.symbol === searchSymbol ? 'bg-blue-600 text-white' : ''}`}
                onClick={() => handleHistorySelect(item.symbol)}
              >
                {item.symbol}
              </Button>
            ))}
          </div>
        )}
      </div>
      
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error.message}</p>
          </CardContent>
        </Card>
      )}
      
      {data && (
        <>
          <AnalysisResults data={data} />
          
          {/* AI Analysis Cards - Row 1 */}
          <div className="grid lg:grid-cols-2 gap-6">
            <SentimentCard symbol={data.symbol} />
            <PredictionCard symbol={data.symbol} />
          </div>
          
          {/* AI Analysis Cards - Row 2 */}
          <div className="grid lg:grid-cols-2 gap-6">
            <OptionsFlowCard symbol={data.symbol} />
            <MarketRegimeCard symbol={data.symbol} />
          </div>
          
          {/* Trade Thesis */}
          <TradeThesisCard 
            symbol={data.symbol} 
            onThesisGenerated={setCurrentThesis}
          />
        </>
      )}
      
      {!searchSymbol && !isLoading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              Enter a stock symbol above to view technical analysis
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
