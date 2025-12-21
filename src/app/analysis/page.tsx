// src/app/analysis/page.tsx

import { TechnicalAnalysis } from '@/components/analysis/TechnicalAnalysis';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AnalysisPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Technical Analysis</h1>
          <p className="text-muted-foreground">
            Analyze stocks with comprehensive technical indicators
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">← Back to Home</Button>
        </Link>
      </div>
      
      <TechnicalAnalysis />
    </div>
  );
}
