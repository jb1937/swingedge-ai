// src/components/analysis/TechnicalAnalysis.tsx

'use client';

import { useState } from 'react';
import { useAnalysis, TechnicalAnalysisData } from '@/hooks/useAnalysis';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TradeThesisCard } from './TradeThesisCard';

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

export function TechnicalAnalysis() {
  const [symbol, setSymbol] = useState('');
  const [searchSymbol, setSearchSymbol] = useState('');
  
  const { data, isLoading, error, refetch } = useAnalysis({
    symbol: searchSymbol,
    enabled: !!searchSymbol,
  });
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      setSearchSymbol(symbol.trim().toUpperCase());
    }
  };
  
  return (
    <div className="space-y-6">
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
        {searchSymbol && (
          <Button type="button" variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        )}
      </form>
      
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
          <TradeThesisCard symbol={data.symbol} />
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
