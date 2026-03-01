// src/components/dashboard/OrdersPanel.tsx

'use client';

import { useState } from 'react';
import { useOrders, useCancelOrder, useReplaceOrder } from '@/hooks/useOrders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Order } from '@/types/trading';

type OrderGroup = {
  symbol: string;
  entry: Order | null;
  stop: Order | null;
  target: Order | null;
  others: Order[];
};

function groupOrdersBySymbol(orders: Order[]): OrderGroup[] {
  const map: Record<string, OrderGroup> = {};

  for (const order of orders) {
    if (!map[order.symbol]) {
      map[order.symbol] = { symbol: order.symbol, entry: null, stop: null, target: null, others: [] };
    }
    const g = map[order.symbol];

    if (order.side === 'buy') {
      g.entry = order;
    } else if (order.type === 'stop' || order.type === 'stop_limit') {
      g.stop = order;
    } else if (order.type === 'limit') {
      g.target = order;
    } else {
      g.others.push(order);
    }
  }

  return Object.values(map).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function statusBadge(status: Order['status']) {
  const cfg: Record<Order['status'], string> = {
    new: 'bg-blue-900 text-blue-300 border-blue-700',
    filled: 'bg-green-900 text-green-300 border-green-700',
    partially_filled: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    canceled: 'bg-gray-700 text-gray-400 border-gray-600',
    expired: 'bg-gray-700 text-gray-400 border-gray-600',
    rejected: 'bg-red-900 text-red-300 border-red-700',
  };
  return (
    <Badge variant="outline" className={`text-xs ${cfg[status]}`}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function EditableOrderRow({
  label,
  order,
  priceField,
}: {
  label: string;
  order: Order;
  priceField: 'limitPrice' | 'stopPrice';
}) {
  const { mutate: replaceOrder, isPending } = useReplaceOrder();
  const { mutate: cancelOrder, isPending: canceling } = useCancelOrder();
  const currentPrice = order[priceField];
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState(currentPrice?.toFixed(2) ?? '');

  const handleSave = () => {
    const parsed = parseFloat(newPrice);
    if (isNaN(parsed) || parsed <= 0) return;
    replaceOrder(
      { orderId: order.id, [priceField]: parsed },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-gray-400 w-14 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1 justify-end">
        {statusBadge(order.status)}
        {editing ? (
          <>
            <Input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-24 h-7 text-xs bg-gray-800 border-gray-600"
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={isPending}>
              {isPending ? '…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditing(false)}>
              ✕
            </Button>
          </>
        ) : (
          <>
            <span className="font-mono text-xs">${currentPrice?.toFixed(2) ?? '—'}</span>
            {order.status === 'new' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2 text-gray-400 hover:text-white"
                onClick={() => { setNewPrice(currentPrice?.toFixed(2) ?? ''); setEditing(true); }}
              >
                Edit
              </Button>
            )}
          </>
        )}
        {order.status === 'new' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-1 text-red-400 hover:text-red-300"
            onClick={() => cancelOrder(order.id)}
            disabled={canceling}
          >
            {canceling ? '…' : '✕'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function OrdersPanel() {
  const { data: orders, isLoading, error } = useOrders();
  const { mutate: cancelOrder } = useCancelOrder();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Open Orders</CardTitle></CardHeader>
        <CardContent><div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>Open Orders</CardTitle></CardHeader>
        <CardContent><p className="text-red-400 text-sm">Failed to load orders.</p></CardContent>
      </Card>
    );
  }

  const pending = (orders ?? []).filter(o => o.status === 'new' || o.status === 'partially_filled');
  const groups = groupOrdersBySymbol(pending);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Open Orders
          {pending.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{pending.length} pending</Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-400 hover:text-red-300"
                onClick={() => cancelOrder(undefined)}
              >
                Cancel All
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pending orders.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.symbol} className="border border-gray-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-sm">{group.symbol}</span>
                  {group.entry && (
                    <Badge variant="outline" className="text-xs bg-blue-950 text-blue-300 border-blue-700">
                      {group.entry.qty} shares
                    </Badge>
                  )}
                </div>

                <div className="divide-y divide-gray-800/50">
                  {group.entry && (
                    <EditableOrderRow
                      label="Entry"
                      order={group.entry}
                      priceField="limitPrice"
                    />
                  )}
                  {group.stop && (
                    <EditableOrderRow
                      label="Stop"
                      order={group.stop}
                      priceField="stopPrice"
                    />
                  )}
                  {group.target && (
                    <EditableOrderRow
                      label="Target"
                      order={group.target}
                      priceField="limitPrice"
                    />
                  )}
                  {group.others.map((o) => (
                    <EditableOrderRow
                      key={o.id}
                      label={o.type}
                      order={o}
                      priceField={o.limitPrice !== undefined ? 'limitPrice' : 'stopPrice'}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
