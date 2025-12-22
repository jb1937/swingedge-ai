// src/components/trading/TradeIdeasPanel.tsx

'use client';

import { useState } from 'react';
import { useTradingStore, useTradeIdeas, useTradeIdeasPanelOpen, TradeIdea } from '@/stores/trading-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import Link from 'next/link';

function TradeIdeaCard({ idea, onRemove, onTrade }: { 
  idea: TradeIdea; 
  onRemove: () => void;
  onTrade: () => void;
}) {
  const riskReward = idea.stopLoss > 0 && idea.takeProfit > 0
    ? Math.abs(idea.takeProfit - idea.entryPrice) / Math.abs(idea.entryPrice - idea.stopLoss)
    : 0;
  
  const potentialProfit = idea.side === 'long'
    ? ((idea.takeProfit - idea.entryPrice) / idea.entryPrice) * 100
    : ((idea.entryPrice - idea.takeProfit) / idea.entryPrice) * 100;
    
  const potentialLoss = idea.side === 'long'
    ? ((idea.entryPrice - idea.stopLoss) / idea.entryPrice) * 100
    : ((idea.stopLoss - idea.entryPrice) / idea.entryPrice) * 100;

  return (
    <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{idea.symbol}</span>
          <Badge className={idea.side === 'long' ? 'bg-green-600' : 'bg-red-600'}>
            {idea.side.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">
            Score: {idea.technicalScore}
          </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-gray-400">Entry</span>
          <p className="font-mono text-white">${idea.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-400">Stop Loss</span>
          <p className="font-mono text-red-400">${idea.stopLoss.toFixed(2)}</p>
          <p className="text-red-400">(-{potentialLoss.toFixed(1)}%)</p>
        </div>
        <div>
          <span className="text-gray-400">Target</span>
          <p className="font-mono text-green-400">${idea.takeProfit.toFixed(2)}</p>
          <p className="text-green-400">(+{potentialProfit.toFixed(1)}%)</p>
        </div>
      </div>
      
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          R:R {riskReward.toFixed(2)}:1
        </span>
        <span className="text-gray-500">
          via {idea.source}
        </span>
      </div>
      
      {idea.notes && (
        <p className="text-xs text-gray-400 italic">{idea.notes}</p>
      )}
      
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" onClick={onTrade}>
          Trade
        </Button>
        <Link href={`/analysis?symbol=${idea.symbol}`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full">
            Analyze
          </Button>
        </Link>
        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={onRemove}>
          ✕
        </Button>
      </div>
    </div>
  );
}

function AddTradeIdeaDialog() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [notes, setNotes] = useState('');
  
  const addTradeIdea = useTradingStore((state) => state.addTradeIdea);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !entryPrice || !stopLoss || !takeProfit) return;
    
    addTradeIdea({
      symbol: symbol.toUpperCase(),
      price: parseFloat(entryPrice),
      entryPrice: parseFloat(entryPrice),
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      side,
      technicalScore: 0,
      signalStrength: 0,
      notes: notes || undefined,
      source: 'manual',
    });
    
    // Reset form
    setSymbol('');
    setEntryPrice('');
    setStopLoss('');
    setTakeProfit('');
    setNotes('');
    setOpen(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          + Add Trade Idea
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">Add Trade Idea</DialogTitle>
          <DialogDescription>
            Manually add a trade idea to your watchlist
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Side</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className={`flex-1 ${side === 'long' ? 'bg-green-600' : 'bg-gray-700'}`}
                  onClick={() => setSide('long')}
                >
                  Long
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={`flex-1 ${side === 'short' ? 'bg-red-600' : 'bg-gray-700'}`}
                  onClick={() => setSide('short')}
                >
                  Short
                </Button>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry">Entry Price</Label>
              <Input
                id="entry"
                type="number"
                step="0.01"
                placeholder="150.00"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stop">Stop Loss</Label>
              <Input
                id="stop"
                type="number"
                step="0.01"
                placeholder="145.00"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">Take Profit</Label>
              <Input
                id="target"
                type="number"
                step="0.01"
                placeholder="165.00"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="Breakout above resistance..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-gray-800 border-gray-700"
            />
          </div>
          
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
            Add Trade Idea
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TradeIdeasPanel() {
  const tradeIdeas = useTradeIdeas();
  const isOpen = useTradeIdeasPanelOpen();
  const { toggleTradeIdeasPanel, removeTradeIdea, clearTradeIdeas } = useTradingStore();
  const [selectedIdea, setSelectedIdea] = useState<TradeIdea | null>(null);
  
  if (!isOpen) {
    return (
      <button
        onClick={toggleTradeIdeasPanel}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-blue-700 transition-colors z-50"
        style={{ writingMode: 'vertical-rl' }}
      >
        Trade Ideas ({tradeIdeas.length})
      </button>
    );
  }
  
  return (
    <>
      <div className="fixed right-0 top-16 bottom-0 w-80 bg-gray-900 border-l border-gray-700 shadow-xl z-40 flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-bold text-white">Trade Ideas</h2>
          <div className="flex items-center gap-2">
            {tradeIdeas.length > 0 && (
              <Button size="sm" variant="ghost" className="text-red-400 text-xs" onClick={clearTradeIdeas}>
                Clear All
              </Button>
            )}
            <button
              onClick={toggleTradeIdeasPanel}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tradeIdeas.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="mb-2">No trade ideas saved</p>
              <p className="text-xs">Pin stocks from Analysis or Screener</p>
            </div>
          ) : (
            tradeIdeas.map((idea) => (
              <TradeIdeaCard
                key={idea.id}
                idea={idea}
                onRemove={() => removeTradeIdea(idea.id)}
                onTrade={() => setSelectedIdea(idea)}
              />
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-gray-700">
          <AddTradeIdeaDialog />
        </div>
      </div>
      
      {/* Trade Dialog */}
      {selectedIdea && (
        <TradeDialog 
          idea={selectedIdea} 
          onClose={() => setSelectedIdea(null)} 
        />
      )}
    </>
  );
}

function TradeDialog({ idea, onClose }: { idea: TradeIdea; onClose: () => void }) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Trade {idea.symbol}</DialogTitle>
          <DialogDescription>
            Execute this trade idea with bracket order
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800 rounded-lg">
            <div className="text-center">
              <span className="text-xs text-gray-400">Entry</span>
              <p className="font-mono text-white">${idea.entryPrice.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <span className="text-xs text-gray-400">Stop Loss</span>
              <p className="font-mono text-red-400">${idea.stopLoss.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <span className="text-xs text-gray-400">Target</span>
              <p className="font-mono text-green-400">${idea.takeProfit.toFixed(2)}</p>
            </div>
          </div>
          
          <p className="text-sm text-gray-400">
            To execute this trade, go to the Trading page and use the Bracket Order entry 
            with the values above pre-filled.
          </p>
          
          <div className="flex gap-2">
            <Link href={`/dashboard?trade=${idea.symbol}&entry=${idea.entryPrice}&sl=${idea.stopLoss}&tp=${idea.takeProfit}&side=${idea.side}`} className="flex-1">
              <Button className="w-full bg-green-600 hover:bg-green-700">
                Go to Trading
              </Button>
            </Link>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Toggle button component for navigation
export function TradeIdeasToggle() {
  const tradeIdeas = useTradeIdeas();
  const { toggleTradeIdeasPanel } = useTradingStore();
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTradeIdeasPanel}
      className="relative"
    >
      Trade Ideas
      {tradeIdeas.length > 0 && (
        <Badge className="ml-2 bg-blue-600">{tradeIdeas.length}</Badge>
      )}
    </Button>
  );
}
