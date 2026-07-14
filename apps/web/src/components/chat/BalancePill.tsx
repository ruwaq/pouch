'use client';

import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api-client';
import type { BalanceResponse } from '../../lib/types';

export function BalancePill() {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      setBalance(await apiGet<BalanceResponse>('/balance'));
    } catch (e) {
      // In demo mode without a cookie this still works; a 401 means not authed.
      if (!(e instanceof ApiError && e.status === 401)) {
        setBalance(null);
      }
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
