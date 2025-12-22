// src/app/screener/page.tsx

import { StockScreener } from '@/components/screener/StockScreener';
import { MarketRegimeCard } from '@/components/analysis/MarketRegimeCard';

export default function ScreenerPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Stock Screener</h1>
        <p className="text-muted-foreground">
          Find trading opportunities with AI-powered analysis
        </p>
      </div>
      
      {/* Market Regime Analysis */}
      <div className="grid lg:grid-cols-2 gap-6">
        <MarketRegimeCard symbol="SPY" />
        <MarketRegimeCard symbol="QQQ" />
      </div>
      
      {/* Stock Screener */}
      <StockScreener />
    </div>
  );
}
