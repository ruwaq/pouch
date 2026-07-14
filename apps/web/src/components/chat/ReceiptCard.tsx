'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api-client';
import type { Order } from '../../lib/types';

export function ReceiptCard({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    const terminal = new Set(['delivered', 'failed', 'refunded']);
    let timer = 0;
    async function load() {
      try {
        const o = await apiGet<Order>(`/orders/${orderId}`);
        if (cancelled) return;
        setOrder(o);
        if (terminal.has(o.status)) return;
        timer = window.setTimeout(load, 4000);
      } catch {
        // non-fatal — the trace already shows the outcome
      }
    }
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orderId]);

  if (!order) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--fg)]">{order.product.name}</span>
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{order.status}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-2)]">
        ${order.faceValue.value.toFixed(2)} via {order.providerId}
      </p>
      {order.redemption?.code ? (
        <p className="mt-2 break-all rounded-lg bg-black/30 p-2 font-mono text-xs text-emerald-300">
          {order.redemption.code}
        </p>
      ) : null}
      {order.redemption?.link ? (
        <a
          href={order.redemption.link}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-[var(--accent)] underline"
        >
          Open redemption link →
        </a>
      ) : null}
    </div>
  );
}
