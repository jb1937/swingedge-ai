// src/app/dashboard/page.tsx

import { AccountSummary } from '@/components/dashboard/AccountSummary';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { BracketOrderEntry } from '@/components/trading/BracketOrderEntry';
import { TradeHistory } from '@/components/dashboard/TradeHistory';
import { PnLChart } from '@/components/dashboard/PnLChart';
import { OrdersPanel } from '@/components/dashboard/OrdersPanel';
import { AutomationLog } from '@/components/dashboard/AutomationLog';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">SwingEdge AI — Day Trading</p>
      </div>

      <AccountSummary />

      {/* Active Positions + Day Trading Controls */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PositionsTable />
          <OrdersPanel />
        </div>
        <AutomationLog />
      </div>

      {/* P&L Analytics + Trade History */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PnLChart />
        </div>
        <TradeHistory />
      </div>

      {/* Manual Order Entry — collapsed by default */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-300 select-none list-none flex items-center gap-2 py-2">
          <span className="text-gray-600 group-open:rotate-90 transition-transform inline-block">▶</span>
          Manual Order Entry
        </summary>
        <div className="mt-4">
          <BracketOrderEntry />
        </div>
      </details>
    </div>
  );
}
