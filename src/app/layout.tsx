// src/app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ChatWrapper } from '@/components/chat/ChatWrapper';
import { Navigation } from '@/components/layout/Navigation';
import { TradeIdeasPanelWrapper } from '@/components/trading/TradeIdeasPanelWrapper';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SwingEdge AI',
  description: 'AI-powered swing trading platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-900 text-white min-h-screen`}>
        <Providers>
          <Navigation />
          <main>{children}</main>
          <ChatWrapper />
          <TradeIdeasPanelWrapper />
        </Providers>
      </body>
    </html>
  );
}
