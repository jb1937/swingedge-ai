'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface MarketRegimeData {
  symbol: string;
  price: number;
  regime: {
    regime: string;
    strength: number;
    trend: { direction: string; strength: string };
    volatility: { level: string; atrPercent: number };
    momentum: { adx: number; trending: boolean };
    recommendation: { strategy: string; bias: string; positionSizeAdjustment: number };
    summary: string;
  } | null;
  signalScore: {
    total: number;
    confidence: string;
    recommendation: string;
    direction: string;
    reasons: string[];
    risks: string[];
    components: {
      trend: number;
      momentum: number;
      volume: number;
      structure: number;
      context: number;
      relative: number;
    };
  } | null;
}

async function fetchMarketRegime(symbol: string): Promise<MarketRegimeData> {
  const res = await fetch(`/api/analysis/market-regime?symbol=${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch market regime');
  return res.json();
}

const regimeColors: Record<string, string> = {
  'strong-bull': 'bg-green-600',
  'bull': 'bg-green-500',
  'neutral': 'bg-yellow-500',
  'bear': 'bg-red-500',
  'strong-bear': 'bg-red-600',
};

const regimeLabels: Record<string, string> = {
  'strong-bull': '🚀 Strong Bull',
  'bull': '📈 Bullish',
  'neutral': '↔️ Neutral',
  'bear': '📉 Bearish',
  'strong-bear': '💀 Strong Bear',
};

const recommendationColors: Record<string, string> = {
  'strong-buy': 'bg-green-600 text-white',
  'buy': 'bg-green-500 text-white',
  'hold': 'bg-yellow-500 text-black',
  'sell': 'bg-red-500 text-white',
  'strong-sell': 'bg-red-600 text-white',
};

interface MarketRegimeCardProps {
  symbol?: string;
}

export function MarketRegimeCard({ symbol = 'SPY' }: MarketRegimeCardProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['market-regime', symbol],
    queryFn: () => fetchMarketRegime(symbol),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <Skeleton className="h-6 w-48 bg-gray-700" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full bg-gray-700" />
          <Skeleton className="h-12 w-full bg-gray-700" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <p className="text-red-400">Failed to load market regime</p>
        </CardContent>
      </Card>
    );
  }

  const { regime, signalScore } = data;

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-white">
            Market Regime: {symbol}
          </CardTitle>
          <span className="text-xl font-bold text-white">${data.price.toFixed(2)}</span>
        </div>
        <CardDescription className="text-gray-400">
          AI-powered market condition analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Market Regime */}
        {regime && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Regime</span>
              <Badge className={`${regimeColors[regime.regime]} text-white`}>
                {regimeLabels[regime.regime]}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Trend</span>
              <span className={`font-medium ${
                regime.trend.direction === 'up' ? 'text-green-400' : 
                regime.trend.direction === 'down' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {regime.trend.direction.toUpperCase()} ({regime.trend.strength})
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Volatility</span>
              <span className={`font-medium ${
                regime.volatility.level === 'high' ? 'text-red-400' : 
                regime.volatility.level === 'low' ? 'text-blue-400' : 'text-gray-300'
              }`}>
                {regime.volatility.level.toUpperCase()} ({regime.volatility.atrPercent.toFixed(1)}%)
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">ADX (Trend Strength)</span>
              <span className="font-medium text-white">
                {regime.momentum.adx.toFixed(0)} {regime.momentum.trending ? '✓ Trending' : '○ Range'}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-700">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-gray-400">Strategy:</span>
                <Badge variant="outline" className="text-blue-400 border-blue-400">
                  {regime.recommendation.strategy}
                </Badge>
                <Badge variant="outline" className={`
                  ${regime.recommendation.bias === 'long' ? 'text-green-400 border-green-400' : 
                    regime.recommendation.bias === 'short' ? 'text-red-400 border-red-400' : 
                    'text-gray-400 border-gray-400'}
                `}>
                  {regime.recommendation.bias.toUpperCase()}
                </Badge>
                {regime.recommendation.positionSizeAdjustment !== 1 && (
                  <Badge variant="outline" className={`
                    ${regime.recommendation.positionSizeAdjustment < 1 
                      ? 'text-orange-400 border-orange-400' 
                      : 'text-green-400 border-green-400'}
                  `}>
                    Position: {(regime.recommendation.positionSizeAdjustment * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
              {regime.recommendation.positionSizeAdjustment < 1 && (
                <p className="text-xs text-orange-400 mb-2">
                  ⚠️ Reduce position sizes to {(regime.recommendation.positionSizeAdjustment * 100).toFixed(0)}% due to market conditions
                </p>
              )}
              <p className="text-sm text-gray-400">{regime.summary}</p>
            </div>
          </div>
        )}

        {/* Signal Score */}
        {signalScore && (
          <div className="pt-4 border-t border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 font-medium">Signal Score</span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${
                  signalScore.total >= 70 ? 'text-green-400' :
                  signalScore.total >= 50 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {signalScore.total}
                </span>
                <span className="text-gray-500">/100</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Recommendation</span>
              <Badge className={recommendationColors[signalScore.recommendation]}>
                {signalScore.recommendation.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Confidence</span>
              <Badge variant="outline" className={`
                ${signalScore.confidence === 'high' ? 'text-green-400 border-green-400' :
                  signalScore.confidence === 'medium' ? 'text-yellow-400 border-yellow-400' :
                  'text-red-400 border-red-400'}
              `}>
                {signalScore.confidence.toUpperCase()}
              </Badge>
            </div>

            {/* Score Components */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {Object.entries(signalScore.components).map(([key, value]) => (
                <div key={key} className="text-center bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-400 capitalize">{key}</div>
                  <div className="font-medium text-white">{value}</div>
                </div>
              ))}
            </div>

            {/* Reasons & Risks */}
            {signalScore.reasons.length > 0 && (
              <div className="pt-2">
                <div className="text-sm text-green-400 mb-1">✓ Bullish Signals:</div>
                <ul className="text-xs text-gray-400 space-y-1">
                  {signalScore.reasons.slice(0, 3).map((reason, i) => (
                    <li key={i}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {signalScore.risks.length > 0 && (
              <div className="pt-2">
                <div className="text-sm text-red-400 mb-1">⚠ Risk Factors:</div>
                <ul className="text-xs text-gray-400 space-y-1">
                  {signalScore.risks.slice(0, 3).map((risk, i) => (
                    <li key={i}>• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
