// src/components/screener/AIRecommendations.tsx

'use client';

import { useRecommendations, ScreenerRecommendation } from '@/hooks/useRecommendations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScreenerResult } from '@/types/analysis';
import Link from 'next/link';

interface AIRecommendationsProps {
  results: ScreenerResult[];
  scanType: string;
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const variants: Record<string, string> = {
    strong_buy: 'bg-green-600 text-white',
    buy: 'bg-green-500 text-white',
    hold: 'bg-yellow-500 text-white',
    avoid: 'bg-red-500 text-white',
  };
  
  const labels: Record<string, string> = {
    strong_buy: 'STRONG BUY',
    buy: 'BUY',
    hold: 'HOLD',
    avoid: 'AVOID',
  };
  
  return (
    <Badge className={variants[recommendation] || 'bg-gray-500'}>
      {labels[recommendation] || recommendation.toUpperCase()}
    </Badge>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const variants: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };
  
  return (
    <Badge variant="outline" className={variants[risk] || ''}>
      {risk.toUpperCase()} RISK
    </Badge>
  );
}

function RecommendationsDisplay({ recommendations }: { recommendations: ScreenerRecommendation }) {
  return (
    <div className="space-y-6">
      {/* Market Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📊 Market Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{recommendations.marketOverview}</p>
        </CardContent>
      </Card>

      {/* Top Picks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🎯 Top Picks</CardTitle>
          <CardDescription>AI-recommended trading opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recommendations.topPicks.map((pick, index) => (
              <div key={pick.symbol} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold">{index + 1}</span>
                    <Link href={`/analysis?symbol=${pick.symbol}`} className="text-xl font-semibold hover:underline">
                      {pick.symbol}
                    </Link>
                  </div>
                  <div className="flex gap-2">
                    <RecommendationBadge recommendation={pick.recommendation} />
                    <RiskBadge risk={pick.riskLevel} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Analysis</p>
                    <p>{pick.reasoning}</p>
                  </div>
                  
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-700">💡 Suggested Strategy</p>
                    <p className="text-blue-600">{pick.suggestedStrategy}</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Link href={`/analysis?symbol=${pick.symbol}`}>
                    <Button size="sm" variant="outline">View Analysis</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sector Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">💡 Sector Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{recommendations.sectorInsights}</p>
        </CardContent>
      </Card>

      {/* Risk Warnings */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="text-lg text-orange-700">⚠️ Risk Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1">
            {recommendations.riskWarnings.map((warning, i) => (
              <li key={i} className="text-orange-600">{warning}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Portfolio Allocation */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="text-lg text-purple-700">📈 Portfolio Allocation Suggestion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-purple-600">{recommendations.suggestedPortfolioAllocation}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function AIRecommendations({ results, scanType }: AIRecommendationsProps) {
  const { mutate: getRecommendations, data: recommendations, isPending, error } = useRecommendations();
  
  const handleGenerate = () => {
    getRecommendations({ results, scanType });
  };
  
  if (results.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">🤖 AI Strategy Recommendations</h3>
        <Button 
          onClick={handleGenerate} 
          disabled={isPending}
          variant={recommendations ? 'outline' : 'default'}
        >
          {isPending ? 'Analyzing...' : recommendations ? 'Refresh Analysis' : 'Get AI Recommendations'}
        </Button>
      </div>
      
      {isPending && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-600">
            {error.message}
          </AlertDescription>
        </Alert>
      )}
      
      {recommendations && !isPending && (
        <RecommendationsDisplay recommendations={recommendations} />
      )}
      
      {!recommendations && !isPending && !error && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Click &quot;Get AI Recommendations&quot; to analyze your screening results and get 
              personalized swing trading strategies powered by Claude AI.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
