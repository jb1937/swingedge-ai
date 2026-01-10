// src/components/analysis/TradeThesisCard.tsx

'use client';

import { useState } from 'react';
import { useThesis } from '@/hooks/useThesis';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TradeThesis } from '@/types/analysis';

interface TradeThesisCardProps {
  symbol: string;
  onThesisGenerated?: (thesis: TradeThesis) => void;
}

function ThesisDisplay({ thesis }: { thesis: TradeThesis }) {
  const getConvictionColor = (conviction: string) => {
    switch (conviction) {
      case 'high': return 'bg-green-600';
      case 'medium': return 'bg-yellow-600';
      case 'low': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };
  
  const getPositionSizeColor = (size: string) => {
    switch (size) {
      case 'full': return 'bg-green-600';
      case 'half': return 'bg-yellow-600';
      case 'quarter': return 'bg-orange-600';
      case 'avoid': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Thesis */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Badge className={getConvictionColor(thesis.conviction)}>
            {thesis.conviction.toUpperCase()} CONVICTION
          </Badge>
          <Badge className={getPositionSizeColor(thesis.positionSizeRecommendation)}>
            {thesis.positionSizeRecommendation.toUpperCase()} SIZE
          </Badge>
        </div>
        <p className="text-gray-800">{thesis.thesis}</p>
      </div>

      {/* Trade Parameters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-muted-foreground">Entry</p>
          <p className="text-lg font-bold">${thesis.suggestedEntry.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="text-xs text-muted-foreground">Stop Loss</p>
          <p className="text-lg font-bold text-red-600">${thesis.suggestedStop.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="text-lg font-bold text-green-600">${thesis.targetPrice.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <p className="text-xs text-muted-foreground">Risk/Reward</p>
          <p className="text-lg font-bold text-purple-600">{thesis.riskRewardRatio.toFixed(2)}:1</p>
        </div>
      </div>

      {/* Holding Period */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gray-50 rounded-lg flex-1">
          <p className="text-xs text-muted-foreground">Holding Period</p>
          <p className="text-lg font-semibold">{thesis.holdingPeriod}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg flex-1">
          <p className="text-xs text-muted-foreground">Technical Score</p>
          <p className="text-lg font-semibold">{thesis.technicalScore}/100</p>
        </div>
      </div>

      {/* Risks and Catalysts */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 bg-red-50 rounded-lg">
          <h4 className="font-semibold text-red-700 mb-2">Key Risks</h4>
          <ul className="space-y-1">
            {thesis.keyRisks.map((risk, i) => (
              <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                <span className="text-red-400">•</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <h4 className="font-semibold text-green-700 mb-2">Key Catalysts</h4>
          <ul className="space-y-1">
            {thesis.keyCatalysts.map((catalyst, i) => (
              <li key={i} className="text-sm text-green-600 flex items-start gap-2">
                <span className="text-green-400">•</span>
                {catalyst}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Generated at {new Date(thesis.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

export function TradeThesisCard({ symbol, onThesisGenerated }: TradeThesisCardProps) {
  const [thesis, setThesis] = useState<TradeThesis | null>(null);
  const { mutate: generateThesis, isPending, error } = useThesis();

  const handleGenerate = () => {
    generateThesis(symbol, {
      onSuccess: (data) => {
        setThesis(data);
        // Notify parent component when thesis is generated
        onThesisGenerated?.(data);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Trade Thesis</CardTitle>
            <CardDescription>
              Claude-powered trade analysis for {symbol}
            </CardDescription>
          </div>
          <Button 
            onClick={handleGenerate} 
            disabled={isPending}
            variant={thesis ? 'outline' : 'default'}
          >
            {isPending ? 'Generating...' : thesis ? 'Regenerate' : 'Generate Thesis'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isPending && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-4 gap-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-red-600">{error.message}</p>
          </div>
        )}

        {!isPending && !error && !thesis && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Click &quot;Generate Thesis&quot; to get AI-powered trade analysis</p>
            <p className="text-sm mt-2">
              Uses Claude to synthesize technical data into actionable insights
            </p>
          </div>
        )}

        {thesis && <ThesisDisplay thesis={thesis} />}
      </CardContent>
    </Card>
  );
}
