'use client';

import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api-client';
import { useChat } from '../../context/chat-context';
import type { BalanceResponse } from '../../lib/types';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum',
  8453: 'Base',
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
};

export function BalancePill() {
  const { messages } = useChat();
  // Count agent turns — a new one means a cash-out just completed and the
  // server-side balance changed, so we re-fetch. (Mount = initial fetch.)
  const agentTurnCount = messages.filter((m) => m.role === 'agent').length;

  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setBalance(await apiGet<BalanceResponse>('/balance'));
    } catch (e) {
      // In demo mode without a cookie this still works; a 401 means not authed.
      if (!(e instanceof ApiError && e.status === 401)) {
        setBalance(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [agentTurnCount]);

  if (loading && !balance) {
    return (
      <span className="h-6 w-24 animate-pulse rounded-full bg-white/5" aria-label="Loading balance" />
    );
  }

  if (!balance) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-1 text-xs font-medium text-[var(--muted-2)] transition hover:bg-white/10"
        title="Your consolidated balance"
      >
        ${balance.total.toFixed(2)} · {balance.assets.length} asset{balance.assets.length === 1 ? '' : 's'}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-lg">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Unified Balance
            </p>
            {balance.assets.map((a) => {
              const chainName = CHAIN_NAMES[a.chainId] ?? `Chain ${a.chainId}`;
              return (
                <div key={`${a.chainId}-${a.symbol}`} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--fg)]">
                      {a.amount.toFixed(a.symbol === 'ETH' ? 4 : 2)} {a.symbol}
                    </span>
                    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                      {chainName}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--muted-2)]">${a.usdValue.toFixed(2)}</span>
                </div>
              );
            })}
            {balance.requiresConsolidation ? (
              <p className="mt-2 border-t border-[var(--border)] pt-2 text-[10px] text-amber-300">
                ⚡ Multi-chain — consolidates via UA 7702
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
