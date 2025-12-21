// src/app/dashboard/page.tsx

import { AccountSummary } from '@/components/dashboard/AccountSummary';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { OrderEntry } from '@/components/trading/OrderEntry';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            SwingEdge AI - Paper Trading
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">← Back to Home</Button>
        </Link>
      </div>
      
      <AccountSummary />
      
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <PositionsTable />
        </div>
        <div>
          <OrderEntry />
        </div>
      </div>
    </div>
  );
}
