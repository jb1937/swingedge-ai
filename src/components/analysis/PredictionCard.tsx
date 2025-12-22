// src/components/analysis/PredictionCard.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Target,
  Brain,
  AlertTriangle,
  CheckCircle,
  BarChart3
} from 'lucide-react';

interface PricePrediction {
  symbol: string;
  currentPrice: number;
  prediction: {
    direction: 'up' | 'down' | 'sideways';
    targetPrice: number;
    targetPercent: number;
    confidence: number;
    timeframe: '5-day';
  };
  probabilities: {
    strongUp: number;
    up: number;
    sideways: number;
    down: number;
    strongDown: number;
  };
  bullishFactors: string[];
  bearishFactors: string[];
  technicalBias: 'bullish' | 'bearish' | 'neutral';
  sentimentBias: 'bullish' | 'bearish' | 'neutral';
  regimeFavorable: boolean;
  confidenceFactors: {
    trendClarity: number;
    patternRecognition: number;
    indicatorAlignment: number;
    volumeConfirmation: number;
  };
  recommendation: string;
  riskLevel: 'low' | 'medium' | 'high';
}

async function fetchPrediction(symbol: string): Promise<PricePrediction> {
  const response = await fetch(`/api/analysis/prediction/${symbol}`);
  if (!response.ok) throw new Error('Failed to fetch prediction');
  return response.json();
}

function ProbabilityBar({ probabilities }: { probabilities: PricePrediction['probabilities'] }) {
  return (
    <div className="space-y-1">
      <div className="flex h-4 rounded-full overflow-hidden">
        <div className="bg-green-600" style={{ width: `${probabilities.strongUp}%` }} title={`Strong Up: ${probabilities.strongUp}%`} />
        <div className="bg-green-400" style={{ width: `${probabilities.up}%` }} title={`Up: ${probabilities.up}%`} />
        <div className="bg-gray-400" style={{ width: `${probabilities.sideways}%` }} title={`Sideways: ${probabilities.sideways}%`} />
        <div className="bg-red-400" style={{ width: `${probabilities.down}%` }} title={`Down: ${probabilities.down}%`} />
        <div className="bg-red-600" style={{ width: `${probabilities.strongDown}%` }} title={`Strong Down: ${probabilities.strongDown}%`} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>↑{probabilities.strongUp + probabilities.up}%</span>
        <span>→{probabilities.sideways}%</span>
        <span>↓{probabilities.down + probabilities.strongDown}%</span>
      </div>
    </div>
  );
}

function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const getColor = (v: number) => {
    if (v >= 70) return 'bg-green-500';
    if (v >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${getColor(value)} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function PredictionCard({ symbol }: { symbol: string }) {
  const { data: prediction, isLoading, error } = useQuery({
    queryKey: ['prediction', symbol],
    queryFn: () => fetchPrediction(symbol),
    staleTime: 60 * 60 * 1000, // 1 hour
    enabled: !!symbol,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !prediction) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Price Prediction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load prediction data</p>
        </CardContent>
      </Card>
    );
  }

  const DirectionIcon = prediction.prediction.direction === 'up' ? TrendingUp :
                        prediction.prediction.direction === 'down' ? TrendingDown : Minus;
  
  const directionColor = prediction.prediction.direction === 'up' ? 'text-green-600' :
                         prediction.prediction.direction === 'down' ? 'text-red-600' : 'text-gray-600';

  const riskColor = prediction.riskLevel === 'low' ? 'text-green-600' :
                    prediction.riskLevel === 'medium' ? 'text-yellow-600' : 'text-red-600';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Price Prediction
          </div>
          <Badge variant={
            prediction.prediction.direction === 'up' ? 'default' :
            prediction.prediction.direction === 'down' ? 'destructive' : 'secondary'
          }>
            <DirectionIcon className="h-3 w-3 mr-1" />
            {prediction.prediction.direction.toUpperCase()}
          </Badge>
        </CardTitle>
        <CardDescription>
          5-day price direction prediction using technical analysis and AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Prediction */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">5-Day Target</p>
            <p className={`text-2xl font-bold ${directionColor}`}>
              ${prediction.prediction.targetPrice.toFixed(2)}
            </p>
            <p className={`text-sm ${directionColor}`}>
              {prediction.prediction.targetPercent >= 0 ? '+' : ''}
              {prediction.prediction.targetPercent.toFixed(2)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Confidence</p>
            <p className="text-3xl font-bold">{prediction.prediction.confidence}%</p>
            <p className={`text-sm ${riskColor}`}>
              {prediction.riskLevel} risk
            </p>
          </div>
        </div>

        {/* Probability Distribution */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            Probability Distribution
          </h4>
          <ProbabilityBar probabilities={prediction.probabilities} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span className="text-green-600">Strong Up / Up</span>
            <span>Sideways</span>
            <span className="text-red-600">Down / Strong Down</span>
          </div>
        </div>

        {/* Confidence Factors */}
        <div>
          <h4 className="text-sm font-medium mb-3">Confidence Breakdown</h4>
          <div className="grid grid-cols-2 gap-3">
            <ConfidenceMeter value={prediction.confidenceFactors.trendClarity} label="Trend Clarity" />
            <ConfidenceMeter value={prediction.confidenceFactors.patternRecognition} label="Pattern Strength" />
            <ConfidenceMeter value={prediction.confidenceFactors.indicatorAlignment} label="Indicator Alignment" />
            <ConfidenceMeter value={prediction.confidenceFactors.volumeConfirmation} label="Volume Confirmation" />
          </div>
        </div>

        {/* Bias Indicators */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant={prediction.technicalBias === 'bullish' ? 'default' : 
                         prediction.technicalBias === 'bearish' ? 'destructive' : 'secondary'}>
            Technical: {prediction.technicalBias}
          </Badge>
          <Badge variant={prediction.sentimentBias === 'bullish' ? 'default' : 
                         prediction.sentimentBias === 'bearish' ? 'destructive' : 'secondary'}>
            Sentiment: {prediction.sentimentBias}
          </Badge>
          <Badge variant={prediction.regimeFavorable ? 'default' : 'secondary'}>
            {prediction.regimeFavorable ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
            Regime: {prediction.regimeFavorable ? 'Favorable' : 'Unfavorable'}
          </Badge>
        </div>

        {/* Factors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1 text-green-600 mb-2">
              <TrendingUp className="h-4 w-4" />
              Bullish Factors
            </h4>
            <ul className="space-y-1">
              {prediction.bullishFactors.map((factor, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-green-600">•</span>
                  {factor}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1 text-red-600 mb-2">
              <TrendingDown className="h-4 w-4" />
              Bearish Factors
            </h4>
            <ul className="space-y-1">
              {prediction.bearishFactors.map((factor, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-red-600">•</span>
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recommendation */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-2">
            <Target className="h-4 w-4 text-blue-600 mt-0.5" />
            <p className="text-sm text-blue-800">{prediction.recommendation}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
