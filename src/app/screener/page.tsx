// src/app/screener/page.tsx

import { StockScreener } from '@/components/screener/StockScreener';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ScreenerPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Stock Screener</h1>
          <p className="text-muted-foreground">
            Find trading opportunities with technical analysis screening
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">← Back to Home</Button>
        </Link>
      </div>
      
      <StockScreener />
    </div>
  );
}
