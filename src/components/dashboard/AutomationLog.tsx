// src/components/dashboard/AutomationLog.tsx
//
// Day Trading Controls — three human override knobs + SPY regime + automation status:
//   1. Auto ON/OFF master toggle
//   2. Pause Today / Resume Today — daily go/no-go toggle
//   3. Sector Blocklist — sectors to skip in auto-trade
//   4. Signal Performance table — win rate per signal type (auto-tracked)
//   + SPY regime pill (live)

'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface SignalStatsRow {
  signalType: string;
  wins: number;
  losses: number;
  totalTrades: number;
  winRate: number;
  avgRR: number;
}

interface SectorFlag {
  sector: string;
  etf: string;
  reason: string;
  change5d: number;
}

interface SectorBrief {
  generatedAt: string;
  flags: SectorFlag[];
  autoApply: boolean;
}

const SIGNAL_LABELS: Record<string, string> = {
  gap_fade: 'Gap Fade',
  vwap_reversion: 'VWAP Reversion',
  orb: 'Opening Range',
};

const SECTOR_OPTIONS = [
  'Technology', 'Financials', 'Healthcare', 'Energy',
  'Consumer', 'Industrials', 'Materials', 'Real Estate', 'Utilities',
];

function spyRegimePillClass(regime: string) {
  if (regime === 'strong-bull' || regime === 'bull') return 'bg-green-900 text-green-300 border-green-700';
  if (regime === 'neutral') return 'bg-yellow-900 text-yellow-300 border-yellow-700';
  return 'bg-red-900 text-red-300 border-red-700';
}

function spyRegimeLabel(regime: string) {
  const labels: Record<string, string> = {
    'strong-bull': 'Strong Bull',
    'bull': 'Bull',
    'neutral': 'Neutral',
    'bear': 'Bear',
    'strong-bear': 'Strong Bear',
  };
  return labels[regime] ?? regime;
}

function winRateColor(winRate: number, totalTrades: number) {
  if (totalTrades < 5) return 'text-gray-500';
  if (winRate >= 55) return 'text-green-400';
  if (winRate >= 45) return 'text-yellow-400';
  return 'text-red-400';
}

export function AutomationLog() {
  const queryClient = useQueryClient();

  const { data: autoTradeLog } = useQuery({
    queryKey: ['auto-trade-log'],
    queryFn: async () => {
      const res = await fetch('/api/cron/automation-log');
      if (!res.ok) return { entries: [] };
      return res.json() as Promise<{ entries: Array<{
        ts: string;
        placed: { symbol: string; signalType: string }[] | string[];
        skipped: { symbol: string; reason: string }[];
        reason?: string;
      }> }>;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: autoTradeData } = useQuery({
    queryKey: ['auto-trade-setting'],
    queryFn: async () => {
      const res = await fetch('/api/settings/auto-trade');
      if (!res.ok) return { enabled: false };
      return res.json() as Promise<{ enabled: boolean }>;
    },
    staleTime: 60 * 1000,
  });

  // Knob 1: skip-today
  const { data: skipTodayData, refetch: refetchSkipToday } = useQuery({
    queryKey: ['skip-today'],
    queryFn: async () => {
      const res = await fetch('/api/settings/skip-today');
      if (!res.ok) return { skipToday: false };
      return res.json() as Promise<{ skipToday: boolean }>;
    },
    staleTime: 60 * 1000,
  });

  // Knob 2: sector blocklist
  const { data: skipSectorsData, refetch: refetchSkipSectors } = useQuery({
    queryKey: ['skip-sectors'],
    queryFn: async () => {
      const res = await fetch('/api/settings/skip-sectors');
      if (!res.ok) return { sectors: [] };
      return res.json() as Promise<{ sectors: string[] }>;
    },
    staleTime: 60 * 1000,
  });

  // Knob 3: signal stats
  const { data: signalStatsData } = useQuery({
    queryKey: ['signal-stats'],
    queryFn: async () => {
      const res = await fetch('/api/settings/signal-stats');
      if (!res.ok) return { stats: [] };
      return res.json() as Promise<{ stats: SignalStatsRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  // SPY regime pill
  const { data: spyData } = useQuery({
    queryKey: ['spy-regime'],
    queryFn: async () => {
      const res = await fetch('/api/analysis/market-regime?symbol=SPY');
      if (!res.ok) return null;
      return res.json() as Promise<{
        regime: {
          regime: string;
          recommendation: { positionSizeAdjustment: number; bias: string };
        };
      }>;
    },
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  // Sector brief
  const { data: sectorBriefData, refetch: refetchSectorBrief } = useQuery({
    queryKey: ['sector-brief'],
    queryFn: async () => {
      const res = await fetch('/api/settings/sector-brief');
      if (!res.ok) return { brief: null, autoApply: true };
      return res.json() as Promise<{ brief: SectorBrief | null; autoApply: boolean }>;
    },
    staleTime: 15 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  const [togglingAutoTrade, setTogglingAutoTrade] = useState(false);
  const [togglingSkipToday, setTogglingSkipToday] = useState(false);
  const [addingSector, setAddingSector] = useState(false);
  const [togglingAutoApply, setTogglingAutoApply] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleAutoTradeToggle = async () => {
    setTogglingAutoTrade(true);
    const newEnabled = !autoTradeData?.enabled;
    queryClient.setQueryData(['auto-trade-setting'], { enabled: newEnabled });
    try {
      const res = await fetch('/api/settings/auto-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (!res.ok) {
        queryClient.setQueryData(['auto-trade-setting'], { enabled: !newEnabled });
        await queryClient.invalidateQueries({ queryKey: ['auto-trade-setting'] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['auto-trade-setting'] });
      }
    } catch {
      queryClient.setQueryData(['auto-trade-setting'], { enabled: !newEnabled });
    } finally {
      setTogglingAutoTrade(false);
    }
  };

  const handleSkipTodayToggle = async () => {
    setTogglingSkipToday(true);
    const currentlySkipped = skipTodayData?.skipToday ?? false;
    try {
      await fetch('/api/settings/skip-today', {
        method: currentlySkipped ? 'DELETE' : 'POST',
      });
      await refetchSkipToday();
    } finally {
      setTogglingSkipToday(false);
    }
  };

  const handleAddSector = async (sector: string) => {
    setAddingSector(true);
    try {
      await fetch('/api/settings/skip-sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector }),
      });
      await refetchSkipSectors();
    } finally {
      setAddingSector(false);
    }
  };

  const handleRemoveSector = async (sector: string) => {
    await fetch('/api/settings/skip-sectors', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sector }),
    });
    await refetchSkipSectors();
  };

  const handleAutoApplyToggle = async () => {
    setTogglingAutoApply(true);
    const newValue = !(sectorBriefData?.autoApply ?? true);
    try {
      await fetch('/api/settings/sector-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApply: newValue }),
      });
      await refetchSectorBrief();
    } finally {
      setTogglingAutoApply(false);
    }
  };

  const handleRegenerateBrief = async () => {
    setRegenerating(true);
    try {
      await fetch('/api/settings/sector-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true }),
      });
      await refetchSectorBrief();
    } finally {
      setRegenerating(false);
    }
  };

  const [tradeState, setTradeState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [tradeMessage, setTradeMessage] = useState('');

  const handleRunTrades = async () => {
    setTradeState('running');
    setTradeMessage('');
    try {
      const res = await fetch('/api/cron/auto-trade', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setTradeMessage(data?.error ?? `Failed (HTTP ${res.status})`);
        setTradeState('error');
      } else if (data.skipped === true) {
        setTradeMessage(`Skipped — ${data.reason}`);
        setTradeState('done');
      } else {
        const placedSymbols = Array.isArray(data.placed)
          ? data.placed.map((p: { symbol: string } | string) =>
              typeof p === 'string' ? p : `${p.symbol}`
            ).join(', ')
          : '';
        let msg = placedSymbols ? `Placed: ${placedSymbols}` : 'No orders placed';
        if (data.skipped?.length > 0) {
          const reasons = (data.skipped as { symbol: string; reason: string }[])
            .map(s => `${s.symbol}: ${s.reason}`)
            .join(' · ');
          msg += ` (filtered — ${reasons})`;
        }
        setTradeMessage(msg);
        setTradeState('done');
        queryClient.invalidateQueries({ queryKey: ['auto-trade-log'] });
      }
    } catch (err) {
      setTradeMessage(err instanceof Error ? err.message : 'Trade run failed');
      setTradeState('error');
    }
    setTimeout(() => setTradeState('idle'), 8000);
  };

  const blockedSectors = skipSectorsData?.sectors ?? [];
  const availableSectors = SECTOR_OPTIONS.filter(s => !blockedSectors.includes(s));
  const isSkippingToday = skipTodayData?.skipToday ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          Day Trading Controls
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 text-xs hover:text-white ${
              tradeState === 'done' ? 'text-green-400' :
              tradeState === 'error' ? 'text-red-400' :
              'text-blue-400'
            }`}
            onClick={handleRunTrades}
            disabled={tradeState === 'running'}
          >
            {tradeState === 'running' ? 'Trading…' :
             tradeState === 'done' ? 'Done ✓' :
             tradeState === 'error' ? 'Failed' :
             'Run Now'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tradeMessage && (
          <p className={`text-xs ${
            tradeState === 'error' ? 'text-red-400' :
            tradeState === 'done' && tradeMessage.startsWith('Skipped') ? 'text-yellow-400' :
            'text-green-400'
          }`}>
            {tradeMessage}
          </p>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Market Alerts — Sector Brief (Claude + news, generated at 8:30 AM) */}
        {/* ------------------------------------------------------------------ */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-gray-400 font-medium">Market Alerts</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Auto-block</span>
              <button
                onClick={handleAutoApplyToggle}
                disabled={togglingAutoApply}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
                  (sectorBriefData?.autoApply ?? true) ? 'bg-orange-600' : 'bg-gray-600'
                } ${togglingAutoApply ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title="Auto-apply sector blocks from morning brief"
              >
                <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                  (sectorBriefData?.autoApply ?? true) ? 'translate-x-3.5' : 'translate-x-0.5'
                }`} />
              </button>
              <button
                onClick={handleRegenerateBrief}
                disabled={regenerating}
                className="text-xs text-blue-500 hover:text-blue-400 disabled:opacity-40"
              >
                {regenerating ? 'Generating…' : 'Refresh'}
              </button>
            </div>
          </div>
          {sectorBriefData?.brief ? (
            <div className="space-y-1.5">
              {sectorBriefData.brief.flags.length === 0 ? (
                <p className="text-xs text-gray-600">No sector risks identified today</p>
              ) : (
                sectorBriefData.brief.flags.map((flag) => (
                  <div key={flag.sector} className="flex flex-col gap-0.5 rounded-md bg-orange-950/30 border border-orange-900/50 px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-orange-300">{flag.sector}</span>
                      {flag.etf && (
                        <span className="text-xs text-gray-500">{flag.etf}</span>
                      )}
                      {flag.change5d !== 0 && (
                        <span className={`text-xs font-mono ml-auto ${flag.change5d < 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {flag.change5d >= 0 ? '+' : ''}{flag.change5d.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{flag.reason}</p>
                  </div>
                ))
              )}
              <p className="text-xs text-gray-700">
                Updated {new Date(sectorBriefData.brief.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-600">No brief yet — generated at 8:30 AM daily</p>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Signal Performance Table (Knob 3 — auto-tracked)                   */}
        {/* ------------------------------------------------------------------ */}
        {signalStatsData && signalStatsData.stats.some(s => s.totalTrades > 0) && (
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Signal Performance</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left pb-1">Signal</th>
                  <th className="text-right pb-1">W/L</th>
                  <th className="text-right pb-1">Win%</th>
                  <th className="text-right pb-1">Avg R:R</th>
                </tr>
              </thead>
              <tbody>
                {signalStatsData.stats.map(row => (
                  <tr key={row.signalType}>
                    <td className="text-gray-300 py-0.5">{SIGNAL_LABELS[row.signalType] ?? row.signalType}</td>
                    <td className="text-right text-gray-400">{row.wins}/{row.losses}</td>
                    <td className={`text-right font-mono ${winRateColor(row.winRate, row.totalTrades)}`}>
                      {row.totalTrades >= 5 ? `${row.winRate}%` : '—'}
                    </td>
                    <td className="text-right text-gray-400 font-mono">
                      {row.totalTrades >= 5 ? row.avgRR.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-600 mt-1">Win rate shown after 5+ trades. Disable weak signals via DISABLE_SIGNALS env var.</p>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Automation Controls                                                 */}
        {/* ------------------------------------------------------------------ */}
        <div className="border-t border-gray-800 pt-3 space-y-3">
          {/* Auto-trading master toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Auto-trading</span>
            <button
              onClick={handleAutoTradeToggle}
              disabled={togglingAutoTrade}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                autoTradeData?.enabled ? 'bg-green-600' : 'bg-gray-600'
              } ${togglingAutoTrade ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title={autoTradeData?.enabled ? 'Click to disable auto-trading' : 'Click to enable auto-trading'}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                autoTradeData?.enabled ? 'translate-x-5' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Knob 1: Pause Today */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500">Today&apos;s trading</span>
              {isSkippingToday && (
                <span className="ml-2 text-xs text-orange-400">paused</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className={`h-6 text-xs ${isSkippingToday ? 'text-green-400 hover:text-green-300' : 'text-orange-400 hover:text-orange-300'}`}
              onClick={handleSkipTodayToggle}
              disabled={togglingSkipToday}
            >
              {isSkippingToday ? 'Resume Today' : 'Pause Today'}
            </Button>
          </div>

          {/* SPY regime pill */}
          {spyData?.regime && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">SPY</span>
              <Badge variant="outline" className={`text-xs ${spyRegimePillClass(spyData.regime.regime)}`}>
                {spyRegimeLabel(spyData.regime.regime)}
              </Badge>
              <span className="text-xs text-gray-500">
                {spyData.regime.recommendation.positionSizeAdjustment}x size
                {spyData.regime.recommendation.bias === 'short' && ' · longs blocked'}
              </span>
            </div>
          )}

          {/* Knob 2: Sector blocklist */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Blocked sectors</span>
              {availableSectors.length > 0 && (
                <select
                  className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-0.5 cursor-pointer"
                  defaultValue=""
                  disabled={addingSector}
                  onChange={e => {
                    if (e.target.value) {
                      handleAddSector(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">+ Block sector</option>
                  {availableSectors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
            {blockedSectors.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {blockedSectors.map(sector => (
                  <button
                    key={sector}
                    onClick={() => handleRemoveSector(sector)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-900/40 border border-orange-800 text-xs text-orange-300 hover:bg-orange-900/70"
                    title="Click to unblock"
                  >
                    {sector} ×
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No sectors blocked</p>
            )}
          </div>

          {/* Last auto-trade run result */}
          {(() => {
            const last = autoTradeLog?.entries?.[0];
            if (!last) return (
              <p className="text-xs text-gray-600">Auto-trade: no runs recorded yet</p>
            );
            const t = new Date(last.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const d = new Date(last.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const placedLabels = Array.isArray(last.placed)
              ? last.placed.map((p: { symbol: string; signalType?: string } | string) =>
                  typeof p === 'string' ? p : `${p.symbol}${p.signalType ? ` (${p.signalType.replace('_', ' ')})` : ''}`
                ).join(', ')
              : '';
            if (last.reason) return (
              <p className="text-xs text-yellow-600">Last run {d} {t}: skipped — {last.reason}</p>
            );
            if (placedLabels) return (
              <p className="text-xs text-green-500">Last run {d} {t}: placed {placedLabels}</p>
            );
            return (
              <p className="text-xs text-gray-500">
                Last run {d} {t}: no qualifying setups
                {last.skipped.length > 0 && ` (${last.skipped.length} skipped)`}
              </p>
            );
          })()}

          <p className="text-xs text-gray-600">
            Cron: 8:30 AM scan · 9:35 AM + 9:47 AM trade · 30-min monitor · 3:45 PM close all
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
