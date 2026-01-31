// src/components/dashboard/SectorExposureMonitor.tsx

'use client';

import { useState, useMemo } from 'react';
import { usePositions } from '@/hooks/usePositions';
import { useOrders } from '@/hooks/useOrders';
import { useAccount } from '@/hooks/useAccount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  calculateSectorExposure,
  SectorExposure,
  CorrelationWarning,
} from '@/lib/trading/sector-mapping';

// Alert level colors and icons
const ALERT_STYLES = {
  safe: {
    bg: 'bg-green-500',
    text: 'text-green-600',
    badge: 'bg-green-100 text-green-800',
    icon: '✅',
  },
  moderate: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-600',
    badge: 'bg-yellow-100 text-yellow-800',
    icon: '🟡',
  },
  high: {
    bg: 'bg-orange-500',
    text: 'text-orange-600',
    badge: 'bg-orange-100 text-orange-800',
    icon: '🟠',
  },
  excessive: {
    bg: 'bg-red-500',
    text: 'text-red-600',
    badge: 'bg-red-100 text-red-800',
    icon: '🔴',
  },
};

function ProgressBar({ 
  current, 
  projected, 
  alertLevel,
  projectedAlertLevel,
}: { 
  current: number;
  projected: number;
  alertLevel: 'safe' | 'moderate' | 'high' | 'excessive';
  projectedAlertLevel: 'safe' | 'moderate' | 'high' | 'excessive';
}) {
  const maxWidth = Math.min(Math.max(projected, current), 50); // Cap at 50% for display
  
  return (
    <div className="relative h-4 bg-gray-700 rounded-full overflow-hidden w-full">
      {/* Projected (background) */}
      {projected > current && (
        <div 
          className={`absolute inset-y-0 left-0 ${ALERT_STYLES[projectedAlertLevel].bg} opacity-40`}
          style={{ width: `${(projected / maxWidth) * 100}%` }}
        />
      )}
      {/* Current (foreground) */}
      <div 
        className={`absolute inset-y-0 left-0 ${ALERT_STYLES[alertLevel].bg} transition-all duration-300`}
        style={{ width: `${(current / maxWidth) * 100}%` }}
      />
      {/* Threshold markers */}
      <div className="absolute inset-y-0 left-[40%] w-px bg-yellow-400 opacity-50" title="20% warning" />
      <div className="absolute inset-y-0 left-[50%] w-px bg-orange-400 opacity-50" title="25% caution" />
      <div className="absolute inset-y-0 left-[70%] w-px bg-red-400 opacity-50" title="35% excessive" />
    </div>
  );
}

function SectorRow({ 
  sector, 
  isExpanded,
  onToggle,
}: { 
  sector: SectorExposure;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasProjectedChange = sector.projectedPercent > sector.currentPercent;
  const hasWarning = sector.alertLevel === 'high' || sector.alertLevel === 'excessive' ||
                     sector.projectedAlertLevel === 'high' || sector.projectedAlertLevel === 'excessive';

  return (
    <div className="border-b border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full p-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm">{isExpanded ? '▼' : '▶'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-white truncate">{sector.sector}</span>
              {hasWarning && (
                <Badge className={ALERT_STYLES[sector.projectedAlertLevel].badge}>
                  {ALERT_STYLES[sector.projectedAlertLevel].icon}
                </Badge>
              )}
            </div>
            <ProgressBar 
              current={sector.currentPercent}
              projected={sector.projectedPercent}
              alertLevel={sector.alertLevel}
              projectedAlertLevel={sector.projectedAlertLevel}
            />
          </div>
          <div className="text-right min-w-[100px]">
            <div className="text-sm font-mono text-white">
              {sector.currentPercent.toFixed(1)}%
              {hasProjectedChange && (
                <span className={`ml-1 ${ALERT_STYLES[sector.projectedAlertLevel].text}`}>
                  → {sector.projectedPercent.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-xs text-gray-300">
              ${sector.currentValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </button>
      
      {/* Expanded details */}
      {isExpanded && (
        <div className="px-8 pb-3 space-y-2">
          {/* Current positions */}
          {sector.positions.length > 0 && (
            <div className="space-y-1">
              {sector.positions.map(pos => (
                <div key={pos.symbol} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{pos.symbol}</span>
                  <span className="text-gray-300 font-mono">
                    ${pos.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({pos.percent.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Pending orders */}
          {sector.pendingOrders.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-gray-700">
              <div className="text-xs text-gray-400 uppercase tracking-wider">Pending Orders</div>
              {sector.pendingOrders.map((order, idx) => (
                <div key={`${order.symbol}-${idx}`} className="flex items-center justify-between text-sm">
                  <span className="text-blue-400">
                    📋 {order.symbol} ({order.qty} @ ${order.price.toFixed(2)})
                  </span>
                  <span className="text-blue-400 font-mono">
                    +${order.estimatedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CorrelationWarningItem({ warning }: { warning: CorrelationWarning }) {
  const isCritical = warning.severity === 'critical';
  
  return (
    <div className={`p-3 rounded-lg ${isCritical ? 'bg-red-900/30 border border-red-700' : 'bg-yellow-900/30 border border-yellow-700'}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{isCritical ? '🔴' : '⚠️'}</span>
        <div className="flex-1">
          <div className="font-medium text-white">{warning.groupName}</div>
          <div className={`text-sm ${isCritical ? 'text-red-300' : 'text-yellow-300'}`}>
            {warning.message}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectorExposureMonitor() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  
  const { data: positions, isLoading: positionsLoading, error: positionsError } = usePositions();
  const { data: orders, isLoading: ordersLoading, error: ordersError } = useOrders();
  const { data: account, isLoading: accountLoading, error: accountError } = useAccount();
  
  const isLoading = positionsLoading || ordersLoading || accountLoading;
  const hasError = positionsError || ordersError || accountError;
  
  const exposureData = useMemo(() => {
    // Validate that we have proper array data (not error objects)
    const validPositions = Array.isArray(positions) ? positions : [];
    const validOrders = Array.isArray(orders) ? orders : [];
    const validPortfolioValue = account?.portfolioValue ?? 0;
    
    if (validPortfolioValue <= 0) {
      return null;
    }
    
    return calculateSectorExposure(validPositions, validOrders, validPortfolioValue);
  }, [positions, orders, account]);
  
  const toggleSector = (sector: string) => {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      if (next.has(sector)) {
        next.delete(sector);
      } else {
        next.add(sector);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
      </Card>
    );
  }

  if (!exposureData) {
    return null;
  }

  const { sectors, correlationWarnings, hasWarnings, warningCount, totalInvestedPercent, projectedInvestedPercent, cashPercent } = exposureData;

  return (
    <Card className="bg-gray-900 border-gray-700">
      {/* Collapsible Header */}
      <CardHeader 
        className="py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
            <CardTitle className="text-lg">🎯 Sector Exposure</CardTitle>
            {hasWarnings && (
              <Badge variant="destructive" className="animate-pulse">
                {warningCount} warning{warningCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-gray-300">
              Invested: <span className="text-white font-mono">{totalInvestedPercent.toFixed(0)}%</span>
              {projectedInvestedPercent > totalInvestedPercent && (
                <span className="text-blue-400 ml-1">→ {projectedInvestedPercent.toFixed(0)}%</span>
              )}
            </div>
            <div className="text-gray-300">
              Cash: <span className="text-green-400 font-mono">{cashPercent.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Expanded Content */}
      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Correlation Warnings */}
          {correlationWarnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400 uppercase tracking-wider px-1">
                Correlation Warnings
              </div>
              {correlationWarnings.map((warning, idx) => (
                <CorrelationWarningItem key={idx} warning={warning} />
              ))}
            </div>
          )}

          {/* Sector Breakdown */}
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-300">
                <span>Sector</span>
                <span>Current → Projected</span>
              </div>
            </div>
            
            {sectors.length > 0 ? (
              sectors.map(sector => (
                <SectorRow 
                  key={sector.sector}
                  sector={sector}
                  isExpanded={expandedSectors.has(sector.sector)}
                  onToggle={() => toggleSector(sector.sector)}
                />
              ))
            ) : (
              <div className="p-4 text-center text-gray-400">
                No positions to analyze
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 text-xs text-gray-400 pt-2">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-500"></span> Safe (&lt;20%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-yellow-500"></span> Moderate (20-25%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-orange-500"></span> High (25-35%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-500"></span> Excessive (&gt;35%)
            </span>
          </div>

          {/* Expand/Collapse All */}
          <div className="flex justify-center gap-2 pt-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedSectors(new Set(sectors.map(s => s.sector)));
              }}
            >
              Expand All
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedSectors(new Set());
              }}
            >
              Collapse All
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
