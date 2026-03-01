// src/app/dashboard/page.tsx

import { AccountSummary } from '@/components/dashboard/AccountSummary';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { SectorExposureMonitor } from '@/components/dashboard/SectorExposureMonitor';
import { BracketOrderEntry } from '@/components/trading/BracketOrderEntry';
import { MarketRegimeCard } from '@/components/analysis/MarketRegimeCard';
import { TradeHistory } from '@/components/dashboard/TradeHistory';
import { PnLChart } from '@/components/dashboard/PnLChart';
import { OrdersPanel } from '@/components/dashboard/OrdersPanel';
import { AutomationLog } from '@/components/dashboard/AutomationLog';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">SwingEdge AI - Paper Trading</p>
      </div>

      <AccountSummary />

      {/* Market Regime Overview */}
      <div className="grid lg:grid-cols-2 gap-6">
        <MarketRegimeCard symbol="SPY" />
        <MarketRegimeCard symbol="QQQ" />
      </div>

      {/* Sector Exposure Monitor */}
      <SectorExposureMonitor />

      {/* Positions + Order Entry */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <PositionsTable />
        </div>
        <div className="space-y-6">
          <BracketOrderEntry />
          <OrdersPanel />
        </div>
      </div>

      {/* P&L Analytics */}
      <PnLChart />

      {/* Automation — daily scan results & status */}
      <AutomationLog />

      {/* Trade History */}
      <TradeHistory />
    </div>
  );
}
