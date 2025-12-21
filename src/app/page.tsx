// src/app/page.tsx

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="container mx-auto py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">SwingEdge AI</h1>
        <p className="text-xl text-muted-foreground">
          AI-Powered Swing Trading Platform
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>
              View your portfolio, positions, and account summary
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button className="w-full">Open Dashboard</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technical Analysis</CardTitle>
            <CardDescription>
              Analyze stocks with RSI, MACD, Bollinger Bands, and more
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/analysis">
              <Button className="w-full">Open Analysis</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Screener</CardTitle>
            <CardDescription>
              Find trading opportunities with technical screening
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/screener">
              <Button className="w-full">Open Screener</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backtest</CardTitle>
            <CardDescription>
              Test strategies against historical data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/backtest">
              <Button className="w-full">Open Backtest</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
