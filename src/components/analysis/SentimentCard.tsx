// src/components/analysis/SentimentCard.tsx

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Newspaper, 
  Users, 
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink
} from 'lucide-react';

interface SentimentAnalysis {
  symbol: string;
  overallScore: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  momentum: 'improving' | 'deteriorating' | 'stable';
  components: {
    newsHeadlines: number;
    analystSentiment: number;
    socialBuzz: number;
    recentTrend: number;
  };
  bullishFactors: string[];
  bearishFactors: string[];
  keyNews: Array<{
    headline: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    impact: 'high' | 'medium' | 'low';
  }>;
  finnhubSentiment?: {
    bullishPercent: number;
    bearishPercent: number;
    articlesThisWeek: number;
    buzz: number;
  };
  lastUpdated: Date;
}

async function fetchSentiment(symbol: string): Promise<SentimentAnalysis> {
  const response = await fetch(`/api/analysis/sentiment/${symbol}`);
  if (!response.ok) {
    throw new Error('Failed to fetch sentiment');
  }
  return response.json();
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const getColor = (s: number) => {
    if (s >= 65) return 'text-green-600 bg-green-100';
    if (s <= 35) return 'text-red-600 bg-red-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${getColor(score)}`}>
        {score}
      </div>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
    </div>
  );
}

function SentimentBar({ bullish, bearish }: { bullish: number; bearish: number }) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Bearish {bearish.toFixed(0)}%</span>
        <span>Bullish {bullish.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
        <div 
          className="bg-red-500 h-full transition-all" 
          style={{ width: `${bearish}%` }} 
        />
        <div 
          className="bg-gray-300 h-full transition-all" 
          style={{ width: `${100 - bullish - bearish}%` }} 
        />
        <div 
          className="bg-green-500 h-full transition-all" 
          style={{ width: `${bullish}%` }} 
        />
      </div>
    </div>
  );
}

export function SentimentCard({ symbol }: { symbol: string }) {
  const { data: sentiment, isLoading, error } = useQuery({
    queryKey: ['sentiment', symbol],
    queryFn: () => fetchSentiment(symbol),
    staleTime: 30 * 60 * 1000, // 30 minutes
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
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !sentiment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            Sentiment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load sentiment data</p>
        </CardContent>
      </Card>
    );
  }

  const DirectionIcon = sentiment.direction === 'bullish' 
    ? TrendingUp 
    : sentiment.direction === 'bearish' 
    ? TrendingDown 
    : Minus;

  const directionColor = sentiment.direction === 'bullish' 
    ? 'text-green-600' 
    : sentiment.direction === 'bearish' 
    ? 'text-red-600' 
    : 'text-yellow-600';

  const momentumIcon = sentiment.momentum === 'improving' 
    ? <ArrowUpRight className="h-4 w-4 text-green-600" />
    : sentiment.momentum === 'deteriorating'
    ? <ArrowDownRight className="h-4 w-4 text-red-600" />
    : <Minus className="h-4 w-4 text-gray-500" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            News & Sentiment
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={
              sentiment.direction === 'bullish' ? 'default' :
              sentiment.direction === 'bearish' ? 'destructive' : 'secondary'
            }>
              <DirectionIcon className="h-3 w-3 mr-1" />
              {sentiment.direction.toUpperCase()}
            </Badge>
            {momentumIcon}
          </div>
        </CardTitle>
        <CardDescription>
          AI-powered sentiment analysis from news, analysts, and social buzz
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Overall Sentiment</p>
            <p className={`text-3xl font-bold ${directionColor}`}>
              {sentiment.overallScore}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Confidence: {sentiment.confidence}%
            </p>
          </div>
          <div className="flex gap-4">
            <ScoreGauge score={sentiment.components.newsHeadlines} label="News" />
            <ScoreGauge score={sentiment.components.analystSentiment} label="Analysts" />
            <ScoreGauge score={sentiment.components.socialBuzz} label="Social" />
            <ScoreGauge score={sentiment.components.recentTrend} label="Trend" />
          </div>
        </div>

        {/* Finnhub Sentiment Bar */}
        {sentiment.finnhubSentiment && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Market Sentiment</span>
              <span className="text-xs text-muted-foreground">
                {sentiment.finnhubSentiment.articlesThisWeek} articles this week
              </span>
            </div>
            <SentimentBar 
              bullish={sentiment.finnhubSentiment.bullishPercent} 
              bearish={sentiment.finnhubSentiment.bearishPercent} 
            />
          </div>
        )}

        {/* Bullish/Bearish Factors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1 text-green-600 mb-2">
              <TrendingUp className="h-4 w-4" />
              Bullish Factors
            </h4>
            <ul className="space-y-1">
              {sentiment.bullishFactors.map((factor, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-green-600">•</span>
                  {factor}
                </li>
              ))}
              {sentiment.bullishFactors.length === 0 && (
                <li className="text-xs text-muted-foreground">No bullish factors identified</li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1 text-red-600 mb-2">
              <TrendingDown className="h-4 w-4" />
              Bearish Factors
            </h4>
            <ul className="space-y-1">
              {sentiment.bearishFactors.map((factor, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-red-600">•</span>
                  {factor}
                </li>
              ))}
              {sentiment.bearishFactors.length === 0 && (
                <li className="text-xs text-muted-foreground">No bearish factors identified</li>
              )}
            </ul>
          </div>
        </div>

        {/* Key News Headlines */}
        {sentiment.keyNews.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              Key News
            </h4>
            <div className="space-y-2">
              {sentiment.keyNews.slice(0, 5).map((news, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-xs">
                  <Badge 
                    variant={
                      news.sentiment === 'positive' ? 'default' :
                      news.sentiment === 'negative' ? 'destructive' : 'secondary'
                    }
                    className="shrink-0"
                  >
                    {news.sentiment}
                  </Badge>
                  <span className="flex-1 text-muted-foreground line-clamp-2">
                    {news.headline}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {news.impact}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Momentum indicator */}
        <div className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
          <span className="text-muted-foreground">Sentiment Momentum</span>
          <span className={`font-medium capitalize flex items-center gap-1 ${
            sentiment.momentum === 'improving' ? 'text-green-600' :
            sentiment.momentum === 'deteriorating' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {momentumIcon}
            {sentiment.momentum}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
