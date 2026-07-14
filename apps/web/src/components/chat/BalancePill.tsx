'use client';

import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api-client';
import { useChat } from '../../context/chat-context';
import type { BalanceResponse } from '../../lib/types';

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
    <button
      onClick={() => setOpen((v) => !v)}
      className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-1 text-xs font-medium text-[var(--muted-2)]"
      title="Your consolidated balance"
    >
      ${balance.total.toFixed(2)} · {balance.assets.length} asset{balance.assets.length === 1 ? '' : 's'}
      {open ? (
        <span className="mt-2 block text-left">
          {balance.assets.map((a) => (
            <span key={`${a.chainId}-${a.symbol}`} className="block">
              {a.symbol}: {a.amount.toFixed(2)} (${a.usdValue.toFixed(2)})
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
