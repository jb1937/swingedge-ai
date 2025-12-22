// src/components/analysis/OptionsFlowCard.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Activity,
  BarChart3,
  AlertTriangle,
  Zap
} from 'lucide-react';

interface OptionsFlowAnalysis {
  symbol: string;
  putCallRatio: {
    current: number;
    average7Day: number;
    signal: 'bullish' | 'bearish' | 'neutral';
    description: string;
  };
  volumeAnalysis: {
    callVolume: number;
    putVolume: number;
    totalVolume: number;
    bullishPercent: number;
    volumeSpike: boolean;
    avgDailyVolume: number;
  };
  openInterest: {
    callOI: number;
    putOI: number;
    oiRatio: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  smartMoneySignal: {
    score: number;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    signals: string[];
  };
  unusualActivity: Array<{
    type: 'call' | 'put';
    strike: number;
    expiration: string;
    volume: number;
    openInterest: number;
    volumeOIRatio: number;
    sentiment: 'bullish' | 'bearish';
    description: string;
  }>;
  overallSentiment: 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish';
  summary: string;
}

async function fetchOptionsFlow(symbol: string): Promise<OptionsFlowAnalysis> {
  const response = await fetch(`/api/analysis/options/${symbol}`);
  if (!response.ok) throw new Error('Failed to fetch options flow');
  return response.json();
}

function formatVolume(vol: number): string {
  if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
  if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
  return vol.toString();
}

function VolumeBar({ calls, puts }: { calls: number; puts: number }) {
  const total = calls + puts;
  const callPercent = total > 0 ? (calls / total) * 100 : 50;
  
  return (
    <div className="space-y-1">
      <div className="flex h-3 rounded-full overflow-hidden">
        <div 
          className="bg-green-500 transition-all" 
          style={{ width: `${callPercent}%` }}
          title={`Calls: ${formatVolume(calls)}`}
        />
        <div 
          className="bg-red-500 transition-all" 
          style={{ width: `${100 - callPercent}%` }}
          title={`Puts: ${formatVolume(puts)}`}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="text-green-600">Calls: {formatVolume(calls)}</span>
        <span className="text-red-600">Puts: {formatVolume(puts)}</span>
      </div>
    </div>
  );
}

function SmartMoneyGauge({ score, direction }: { score: number; direction: string }) {
  const rotation = (score - 50) * 1.8; // -90 to 90 degrees
  const color = direction === 'bullish' ? 'text-green-600' : 
                direction === 'bearish' ? 'text-red-600' : 'text-gray-600';
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-10 overflow-hidden">
        <div className="absolute bottom-0 left-0 right-0 h-20 border-4 border-gray-200 rounded-full" />
        <div 
          className={`absolute bottom-0 left-1/2 w-1 h-8 bg-current ${color} origin-bottom transition-transform`}
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
      </div>
      <span className={`text-lg font-bold ${color}`}>{score}</span>
      <span className="text-xs text-muted-foreground capitalize">{direction}</span>
    </div>
  );
}

export function OptionsFlowCard({ symbol }: { symbol: string }) {
  const { data: options, isLoading, error } = useQuery({
    queryKey: ['options-flow', symbol],
    queryFn: () => fetchOptionsFlow(symbol),
    staleTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!symbol,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !options) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Options Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load options flow data</p>
        </CardContent>
      </Card>
    );
  }

  const sentimentBadge = {
    'strongly_bullish': { variant: 'default' as const, label: 'STRONGLY BULLISH', icon: TrendingUp },
    'bullish': { variant: 'default' as const, label: 'BULLISH', icon: TrendingUp },
    'neutral': { variant: 'secondary' as const, label: 'NEUTRAL', icon: Minus },
    'bearish': { variant: 'destructive' as const, label: 'BEARISH', icon: TrendingDown },
    'strongly_bearish': { variant: 'destructive' as const, label: 'STRONGLY BEARISH', icon: TrendingDown },
  };

  const badge = sentimentBadge[options.overallSentiment];
  const SentimentIcon = badge.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Smart Money Signals
          </div>
          <Badge variant={badge.variant}>
            <SentimentIcon className="h-3 w-3 mr-1" />
            {badge.label}
          </Badge>
        </CardTitle>
        <CardDescription>
          Insider transactions, analyst recommendations, and institutional signals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Smart Money Score */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Smart Money Score</p>
            <p className="text-2xl font-bold">{options.smartMoneySignal.score}/100</p>
            <p className="text-xs text-muted-foreground">
              Confidence: {options.smartMoneySignal.confidence}%
            </p>
            <Badge variant={
              options.smartMoneySignal.direction === 'bullish' ? 'default' :
              options.smartMoneySignal.direction === 'bearish' ? 'destructive' : 'secondary'
            } className="mt-1">
              {options.smartMoneySignal.direction}
            </Badge>
          </div>
          <SmartMoneyGauge 
            score={options.smartMoneySignal.score} 
            direction={options.smartMoneySignal.direction} 
          />
        </div>

        {/* Data Source Note */}
        <div className="text-sm text-muted-foreground p-2 bg-blue-50 rounded border border-blue-200">
          <BarChart3 className="h-4 w-4 inline-block mr-1 text-blue-600" />
          {options.putCallRatio.description}
        </div>

        {/* Insider Activity */}
        {(options.volumeAnalysis.callVolume > 0 || options.volumeAnalysis.putVolume > 0) && (
          <div>
            <h4 className="text-sm font-medium mb-2">Insider Activity (Last 90 Days)</h4>
            <VolumeBar 
              calls={options.volumeAnalysis.callVolume} 
              puts={options.volumeAnalysis.putVolume} 
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span className="text-green-600">Insider Buys: {options.volumeAnalysis.callVolume}</span>
              <span className="text-red-600">Insider Sells: {options.volumeAnalysis.putVolume}</span>
            </div>
          </div>
        )}

        {/* Analyst Ratings */}
        {(options.openInterest.callOI > 0 || options.openInterest.putOI > 0) && (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 bg-green-50 rounded">
              <p className="text-xs text-muted-foreground">Bullish Analysts</p>
              <p className="text-xl font-semibold text-green-600">{options.openInterest.callOI}</p>
              <p className="text-xs text-muted-foreground">Strong Buy + Buy</p>
            </div>
            <div className="p-3 bg-red-50 rounded">
              <p className="text-xs text-muted-foreground">Bearish Analysts</p>
              <p className="text-xl font-semibold text-red-600">{options.openInterest.putOI}</p>
              <p className="text-xs text-muted-foreground">Sell + Strong Sell</p>
            </div>
          </div>
        )}

        {/* Smart Money Signals */}
        {options.smartMoneySignal.signals.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Smart Money Signals</h4>
            <ul className="space-y-1">
              {options.smartMoneySignal.signals.map((signal, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className={
                    options.smartMoneySignal.direction === 'bullish' ? 'text-green-600' :
                    options.smartMoneySignal.direction === 'bearish' ? 'text-red-600' : 'text-gray-600'
                  }>•</span>
                  {signal}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Unusual Activity */}
        {options.unusualActivity.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Unusual Activity
            </h4>
            <div className="space-y-2">
              {options.unusualActivity.map((activity, i) => (
                <div key={i} className={`p-2 rounded text-xs flex items-center justify-between ${
                  activity.type === 'call' ? 'bg-green-50' : 'bg-red-50'
                }`}>
                  <span className={activity.type === 'call' ? 'text-green-700' : 'text-red-700'}>
                    {activity.type.toUpperCase()}
                  </span>
                  <span className="text-muted-foreground">{activity.description}</span>
                  <Badge variant="outline" className="text-xs">
                    Vol: {formatVolume(activity.volume)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="text-sm text-muted-foreground p-2 bg-gray-50 rounded">
          {options.summary}
        </div>
      </CardContent>
    </Card>
  );
}
