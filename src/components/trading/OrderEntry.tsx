// src/components/trading/OrderEntry.tsx

'use client';

import { useState } from 'react';
import { useSubmitOrder } from '@/hooks/useOrders';
import { useAccount } from '@/hooks/useAccount';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function OrderEntry() {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const { data: account } = useAccount();
  const { mutate: submitOrder, isPending } = useSubmitOrder();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!symbol.trim() || !quantity) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }
    
    const orderRequest = {
      symbol: symbol.toUpperCase(),
      side,
      qty: parseInt(quantity),
      type: orderType,
      timeInForce: 'day' as const,
      ...(orderType === 'limit' && limitPrice ? { limitPrice: parseFloat(limitPrice) } : {}),
    };
    
    submitOrder(orderRequest, {
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
  };
  
  const estimatedCost = quantity && limitPrice 
    ? (parseInt(quantity) * parseFloat(limitPrice)).toFixed(2)
    : '—';
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Place Order</CardTitle>
        <CardDescription>
          Execute trades on Alpaca Paper Trading
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {message && (
            <Alert className={message.type === 'success' ? 'border-green-500' : 'border-red-500'}>
              <AlertDescription className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="AAPL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
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
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Side</Label>
              <Select value={side} onValueChange={(v) => setSide(v as 'buy' | 'sell')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Order Type</Label>
              <Select value={orderType} onValueChange={(v) => setOrderType(v as 'market' | 'limit')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">Market</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {orderType === 'limit' && (
            <div className="space-y-2">
              <Label htmlFor="limitPrice">Limit Price</Label>
              <Input
                id="limitPrice"
                type="number"
                step="0.01"
                placeholder="150.00"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}
          
          <div className="flex justify-between items-center pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              <span>Buying Power: </span>
              <span className="font-semibold">
                ${account?.buyingPower.toLocaleString() || '—'}
              </span>
              {orderType === 'limit' && quantity && limitPrice && (
                <span className="ml-4">
                  Est. Cost: <span className="font-semibold">${estimatedCost}</span>
                </span>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isPending || !symbol.trim() || !quantity}
              className={`flex-1 ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isPending ? 'Submitting...' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || 'Stock'}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
