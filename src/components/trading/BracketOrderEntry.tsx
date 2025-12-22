// src/components/trading/BracketOrderEntry.tsx

'use client';

import { useState, useEffect } from 'react';
import { useSubmitBracketOrder, useSubmitOrder } from '@/hooks/useOrders';
import { useAccount } from '@/hooks/useAccount';
import { useQuote } from '@/hooks/useQuote';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradeIdeas, useTradingStore } from '@/stores/trading-store';

interface PrefilledData {
  symbol?: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  side?: 'buy' | 'sell';
}

export function BracketOrderEntry({ prefilled }: { prefilled?: PrefilledData }) {
  const [orderType, setOrderType] = useState<'simple' | 'bracket'>('bracket');
  const [symbol, setSymbol] = useState(prefilled?.symbol || '');
  const [side, setSide] = useState<'buy' | 'sell'>(prefilled?.side || 'buy');
  const [entryType, setEntryType] = useState<'market' | 'limit'>('limit');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState(prefilled?.entry?.toString() || '');
  const [stopLossPrice, setStopLossPrice] = useState(prefilled?.stopLoss?.toString() || '');
  const [takeProfitPrice, setTakeProfitPrice] = useState(prefilled?.takeProfit?.toString() || '');
  const [stopLossPercent, setStopLossPercent] = useState('5');
  const [takeProfitPercent, setTakeProfitPercent] = useState('10');
  const [usePercentage, setUsePercentage] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const { data: account } = useAccount();
  const { data: quote, isLoading: quoteLoading } = useQuote({ symbol, enabled: !!symbol });
  const { mutate: submitBracketOrder, isPending: bracketPending } = useSubmitBracketOrder();
  const { mutate: submitOrder, isPending: simplePending } = useSubmitOrder();
  const tradeIdeas = useTradeIdeas();
  const { removeTradeIdea } = useTradingStore();
  
  const isPending = bracketPending || simplePending;
  
  // Update prices based on percentage when entry price changes
  useEffect(() => {
    if (usePercentage && limitPrice) {
      const entry = parseFloat(limitPrice);
      if (!isNaN(entry)) {
        const slPercent = parseFloat(stopLossPercent) / 100;
        const tpPercent = parseFloat(takeProfitPercent) / 100;
        
        if (side === 'buy') {
          setStopLossPrice((entry * (1 - slPercent)).toFixed(2));
          setTakeProfitPrice((entry * (1 + tpPercent)).toFixed(2));
        } else {
          setStopLossPrice((entry * (1 + slPercent)).toFixed(2));
          setTakeProfitPrice((entry * (1 - tpPercent)).toFixed(2));
        }
      }
    }
  }, [limitPrice, stopLossPercent, takeProfitPercent, usePercentage, side]);
  
  // Auto-fill limit price from quote
  useEffect(() => {
    if (quote && !limitPrice) {
      setLimitPrice(quote.price.toFixed(2));
    }
  }, [quote]);
  
  const handleLoadFromTradeIdea = (ideaId: string) => {
    const idea = tradeIdeas.find(i => i.id === ideaId);
    if (idea) {
      setSymbol(idea.symbol);
      setSide(idea.side === 'long' ? 'buy' : 'sell');
      setLimitPrice(idea.entryPrice.toFixed(2));
      setStopLossPrice(idea.stopLoss.toFixed(2));
      setTakeProfitPrice(idea.takeProfit.toFixed(2));
      setOrderType('bracket');
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    if (!symbol.trim() || !quantity) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      setMessage({ type: 'error', text: 'Quantity must be a positive number' });
      return;
    }
    
    if (orderType === 'bracket') {
      // Validate bracket order
      const entry = entryType === 'limit' ? parseFloat(limitPrice) : quote?.price;
      const sl = parseFloat(stopLossPrice);
      const tp = parseFloat(takeProfitPrice);
      
      if (!sl || !tp) {
        setMessage({ type: 'error', text: 'Stop loss and take profit are required for bracket orders' });
        return;
      }
      
      if (side === 'buy') {
        if (sl >= (entry || 0)) {
          setMessage({ type: 'error', text: 'Stop loss must be below entry price for buy orders' });
          return;
        }
        if (tp <= (entry || 0)) {
          setMessage({ type: 'error', text: 'Take profit must be above entry price for buy orders' });
          return;
        }
      } else {
        if (sl <= (entry || 0)) {
          setMessage({ type: 'error', text: 'Stop loss must be above entry price for sell orders' });
          return;
        }
        if (tp >= (entry || 0)) {
          setMessage({ type: 'error', text: 'Take profit must be below entry price for sell orders' });
          return;
        }
      }
      
      submitBracketOrder({
        entry: {
          symbol: symbol.toUpperCase(),
          side,
          qty,
          type: entryType,
          timeInForce: 'gtc',
          ...(entryType === 'limit' && { limitPrice: parseFloat(limitPrice) }),
        },
        takeProfit: tp,
        stopLoss: sl,
      }, {
        onSuccess: (order) => {
          setMessage({ 
            type: 'success', 
            text: `Bracket order submitted: ${order.side.toUpperCase()} ${order.qty} ${order.symbol} with SL@${sl.toFixed(2)} TP@${tp.toFixed(2)}` 
          });
          // Reset form
          setSymbol('');
          setQuantity('');
          setLimitPrice('');
          setStopLossPrice('');
          setTakeProfitPrice('');
        },
        onError: (error) => {
          setMessage({ type: 'error', text: error.message });
        },
      });
    } else {
      // Simple order
      submitOrder({
        symbol: symbol.toUpperCase(),
        side,
        qty,
        type: entryType,
        timeInForce: 'day',
        ...(entryType === 'limit' && { limitPrice: parseFloat(limitPrice) }),
      }, {
        onSuccess: (order) => {
          setMessage({ type: 'success', text: `Order submitted: ${order.side.toUpperCase()} ${order.qty} ${order.symbol}` });
          setSymbol('');
          setQuantity('');
          setLimitPrice('');
        },
        onError: (error) => {
          setMessage({ type: 'error', text: error.message });
        },
      });
    }
  };
  
  // Calculate risk metrics
  const entry = parseFloat(limitPrice) || quote?.price || 0;
  const sl = parseFloat(stopLossPrice) || 0;
  const tp = parseFloat(takeProfitPrice) || 0;
  const qty = parseInt(quantity) || 0;
  
  const riskAmount = Math.abs(entry - sl) * qty;
  const rewardAmount = Math.abs(tp - entry) * qty;
  const riskReward = sl && tp ? Math.abs(tp - entry) / Math.abs(entry - sl) : 0;
  const estimatedCost = entry * qty;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Place Order</CardTitle>
        <CardDescription>
          Execute trades with optional stop loss and take profit
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={orderType} onValueChange={(v) => setOrderType(v as 'simple' | 'bracket')}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="simple">Simple Order</TabsTrigger>
            <TabsTrigger value="bracket">Bracket Order</TabsTrigger>
          </TabsList>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <Alert className={message.type === 'success' ? 'border-green-500 bg-green-950' : 'border-red-500 bg-red-950'}>
                <AlertDescription className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>
                  {message.text}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Trade Ideas Quick Load */}
            {tradeIdeas.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                <span className="text-xs text-gray-400">Load from Trade Ideas:</span>
                <div className="flex gap-1 flex-wrap">
                  {tradeIdeas.slice(0, 5).map((idea) => (
                    <Button
                      key={idea.id}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs h-6 px-2"
                      onClick={() => handleLoadFromTradeIdea(idea.id)}
                    >
                      {idea.symbol}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <div className="flex gap-2">
                  <Input
                    id="symbol"
                    placeholder="AAPL"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    className="bg-gray-800 border-gray-700"
                  />
                  {quote && (
                    <Badge variant="outline" className="whitespace-nowrap">
                      ${quote.price.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="100"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Side</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className={`flex-1 ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700'}`}
                    onClick={() => setSide('buy')}
                  >
                    Buy
                  </Button>
                  <Button
                    type="button"
                    className={`flex-1 ${side === 'sell' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700'}`}
                    onClick={() => setSide('sell')}
                  >
                    Sell
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Order Type</Label>
                <Select value={entryType} onValueChange={(v) => setEntryType(v as 'market' | 'limit')}>
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {entryType === 'limit' && (
              <div className="space-y-2">
                <Label htmlFor="limitPrice">Limit Price</Label>
                <Input
                  id="limitPrice"
                  type="number"
                  step="0.01"
                  placeholder="150.00"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            )}
            
            {orderType === 'bracket' && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePercentage}
                      onChange={(e) => setUsePercentage(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Use percentage for SL/TP</span>
                  </Label>
                </div>
                
                {usePercentage ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-red-400">Stop Loss %</Label>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="5"
                        value={stopLossPercent}
                        onChange={(e) => setStopLossPercent(e.target.value)}
                        className="bg-gray-800 border-gray-700"
                      />
                      {stopLossPrice && (
                        <p className="text-xs text-red-400">${stopLossPrice}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-green-400">Take Profit %</Label>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="10"
                        value={takeProfitPercent}
                        onChange={(e) => setTakeProfitPercent(e.target.value)}
                        className="bg-gray-800 border-gray-700"
                      />
                      {takeProfitPrice && (
                        <p className="text-xs text-green-400">${takeProfitPrice}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-red-400">Stop Loss Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="145.00"
                        value={stopLossPrice}
                        onChange={(e) => setStopLossPrice(e.target.value)}
                        className="bg-gray-800 border-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-green-400">Take Profit Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="165.00"
                        value={takeProfitPrice}
                        onChange={(e) => setTakeProfitPrice(e.target.value)}
                        className="bg-gray-800 border-gray-700"
                      />
                    </div>
                  </div>
                )}
                
                {/* Risk Metrics */}
                {entry > 0 && qty > 0 && sl > 0 && tp > 0 && (
                  <div className="p-3 bg-gray-800 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Risk/Reward Ratio:</span>
                      <span className={`font-bold ${riskReward >= 2 ? 'text-green-400' : riskReward >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {riskReward.toFixed(2)}:1
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Risk:</span>
                      <span className="text-red-400 font-mono">${riskAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Reward:</span>
                      <span className="text-green-400 font-mono">${rewardAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
              <div className="text-sm text-gray-400">
                <span>Buying Power: </span>
                <span className="font-semibold text-white">
                  ${account?.buyingPower.toLocaleString() || '—'}
                </span>
                {estimatedCost > 0 && (
                  <span className="ml-4">
                    Est. Cost: <span className="font-semibold text-white">${estimatedCost.toLocaleString()}</span>
                  </span>
                )}
              </div>
            </div>
            
            <Button
              type="submit"
              disabled={isPending || !symbol.trim() || !quantity}
              className={`w-full ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isPending ? 'Submitting...' : (
                orderType === 'bracket' 
                  ? `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || 'Stock'} with SL/TP`
                  : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || 'Stock'}`
              )}
            </Button>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
