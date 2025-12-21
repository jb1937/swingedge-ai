// src/app/backtest/page.tsx

import { BacktestRunner } from '@/components/backtest/BacktestRunner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function BacktestPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Backtesting</h1>
          <p className="text-muted-foreground">
            Test trading strategies against historical data
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">← Back to Home</Button>
        </Link>
      </div>
      
      <BacktestRunner />
    </div>
  );
}
