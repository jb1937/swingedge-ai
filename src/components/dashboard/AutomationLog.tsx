// src/components/dashboard/AutomationLog.tsx
//
// Displays a live feed of today's automation activity:
// - Daily scan results (from /api/cron/opportunities)
// - Recent auto-trade and position-monitor actions (from Upstash Redis logs
//   served by a lightweight /api/cron/automation-log endpoint)

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface DailyScanData {
  date: string;
  scannedAt: string;
  regimeGate?: {
    allowLongs: boolean;
    warningLevel: string;
    reason: string;
    positionSizeMultiplier: number;
  };
  opportunities?: Array<{
    symbol: string;
    tradeQuality?: string;
    signalStrength?: number;
    suggestedEntry?: number;
    suggestedStop?: number;
    suggestedTarget?: number;
    riskRewardRatio?: number;
  }>;
  message?: string;
}

async function fetchOpportunities(): Promise<DailyScanData> {
  const res = await fetch('/api/cron/opportunities');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

async function triggerScan(): Promise<{ opportunitiesFound: number }> {
  const res = await fetch('/api/cron/daily-scan', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Scan failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  return { opportunitiesFound: data?.opportunities?.length ?? 0 };
}

function regimeBadgeClass(level: string) {
  if (level === 'danger') return 'bg-red-900 text-red-300 border-red-700';
  if (level === 'warning') return 'bg-orange-900 text-orange-300 border-orange-700';
  if (level === 'caution') return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  return 'bg-green-900 text-green-300 border-green-700';
}

function qualityBadgeClass(quality?: string) {
  if (quality === 'excellent') return 'bg-green-900 text-green-300 border-green-700';
  if (quality === 'good') return 'bg-blue-900 text-blue-300 border-blue-700';
  return 'bg-gray-700 text-gray-300 border-gray-600';
}

export function AutomationLog() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['opportunities'],
    queryFn: fetchOpportunities,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000, // refresh every 15 min
  });

  const [scanState, setScanState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState('');

  const handleManualScan = async () => {
    setScanState('running');
    setScanMessage('');
    try {
      const result = await triggerScan();
      setScanMessage(`Scan complete — ${result.opportunitiesFound} setup${result.opportunitiesFound !== 1 ? 's' : ''} found`);
      setScanState('done');
      setTimeout(() => refetch(), 2000);
      setTimeout(() => setScanState('idle'), 6000);
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Scan failed');
      setScanState('error');
      setTimeout(() => setScanState('idle'), 8000);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          Daily Scan &amp; Automation
          <div className="flex items-center gap-2">
            {data?.scannedAt && (
              <span className="text-xs text-gray-500 font-normal">
                Last scan: {new Date(data.scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 text-xs hover:text-white ${
                scanState === 'done' ? 'text-green-400' :
                scanState === 'error' ? 'text-red-400' :
                'text-gray-400'
              }`}
              onClick={handleManualScan}
              disabled={scanState === 'running' || isFetching}
            >
              {scanState === 'running' ? 'Scanning…' :
               scanState === 'done' ? 'Done ✓' :
               scanState === 'error' ? 'Failed' :
               'Run Scan'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-lg p-3 bg-red-950/30 border border-red-900 text-xs space-y-1">
            <p className="text-red-400 font-medium">Failed to load scan results</p>
            <p className="text-red-300/70">{error.message}</p>
            {(error.message.toLowerCase().includes('redis') ||
              error.message.includes('500') ||
              error.message.toLowerCase().includes('upstash')) && (
              <p className="text-yellow-400/80 mt-1">
                Check that <code className="font-mono">UPSTASH_REDIS_REST_URL</code> and{' '}
                <code className="font-mono">UPSTASH_REDIS_REST_TOKEN</code> are set in Vercel env vars.
              </p>
            )}
          </div>
        )}

        {/* Scan button feedback */}
        {scanMessage && (
          <p className={`text-xs ${scanState === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {scanMessage}
          </p>
        )}

        {data && !isLoading && (
          <>
            {/* Market Regime Gate */}
            {data.regimeGate && (
              <div className={`rounded-lg p-3 border text-sm ${
                data.regimeGate.allowLongs
                  ? 'bg-gray-900 border-gray-700'
                  : 'bg-red-950/40 border-red-800'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 font-medium">Market Regime Gate</span>
                  <Badge variant="outline" className={`text-xs ${regimeBadgeClass(data.regimeGate.warningLevel)}`}>
                    {data.regimeGate.warningLevel === 'none' ? 'Clear' : data.regimeGate.warningLevel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-gray-300">{data.regimeGate.reason}</p>
                {data.regimeGate.positionSizeMultiplier < 1 && (
                  <p className="text-xs text-yellow-400 mt-1">
                    Position size: {(data.regimeGate.positionSizeMultiplier * 100).toFixed(0)}% of normal
                  </p>
                )}
              </div>
            )}

            {/* No scan yet */}
            {data.message && (
              <p className="text-gray-500 text-sm">{data.message}</p>
            )}

            {/* Opportunities */}
            {data.opportunities && data.opportunities.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2 font-medium">
                  Top Setups — {data.date ?? 'Today'}
                </p>
                <div className="space-y-2">
                  {data.opportunities.map((opp) => (
                    <div key={opp.symbol} className="flex items-start justify-between p-2 bg-gray-900 rounded-lg border border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{opp.symbol}</span>
                        <Badge variant="outline" className={`text-xs ${qualityBadgeClass(opp.tradeQuality)}`}>
                          {opp.tradeQuality ?? '—'}
                        </Badge>
                      </div>
                      <div className="text-right text-xs text-gray-400 space-y-0.5">
                        {opp.suggestedEntry && (
                          <div>
                            Entry: <span className="text-white font-mono">${opp.suggestedEntry.toFixed(2)}</span>
                            {' '}Stop: <span className="text-red-400 font-mono">${opp.suggestedStop?.toFixed(2)}</span>
                          </div>
                        )}
                        {opp.riskRewardRatio && (
                          <div>
                            R:R <span className={`font-bold ${opp.riskRewardRatio >= 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                              {opp.riskRewardRatio.toFixed(1)}:1
                            </span>
                            {' '}· Signal <span className="text-blue-400">{((opp.signalStrength ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.opportunities && data.opportunities.length === 0 && !data.message && (
              <p className="text-gray-500 text-sm">No qualifying setups found in today&apos;s scan.</p>
            )}
          </>
        )}

        {/* Automation status */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-500">
            Auto-trading: {' '}
            <span className={process.env.NEXT_PUBLIC_AUTO_TRADE_ENABLED === 'true' ? 'text-green-400' : 'text-gray-400'}>
              {process.env.NEXT_PUBLIC_AUTO_TRADE_ENABLED === 'true' ? 'Enabled' : 'Manual only'}
            </span>
            {' '}· Cron schedules: 8:30 AM scan, 9:35 AM trade, 30-min monitor, 3:55 PM cleanup
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
