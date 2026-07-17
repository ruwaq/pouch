'use client';
import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api-client';
import type { Order } from '../../lib/types';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum',
  8453: 'Base',
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
};

const BLOCK_EXPLORERS: Record<number, string> = {
  42161: 'https://arbiscan.io/tx',
  8453: 'https://basescan.org/tx',
  137: 'https://polygonscan.com/tx',
  1: 'https://etherscan.io/tx',
  10: 'https://optimistic.etherscan.io/tx',
};

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

  const chainName = order.payment?.chainId
    ? (CHAIN_NAMES[order.payment.chainId] ?? `Chain ${order.payment.chainId}`)
    : null;
  const explorerUrl = order.payment?.chainId && order.payment?.txHash
    ? `${BLOCK_EXPLORERS[order.payment.chainId] ?? '#'}/${order.payment.txHash}`
    : null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--fg)]">{order.product.name}</span>
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{order.status}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-2)]">
        ${order.faceValue.value.toFixed(2)} via {order.providerId}
        {chainName ? (
          <span className="ml-1 text-xs text-[var(--muted)]">on {chainName}</span>
        ) : null}
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

      {/* Educational footer */}
      {chainName ? (
        <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
          💡 This gift card was paid using a <strong>gasless transaction</strong> on {chainName}.
          No wallet popups were needed — the agent wallet covered all gas fees.
          {explorerUrl ? (
            <span>
              {' '}
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline"
              >
                View on block explorer →
              </a>
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}