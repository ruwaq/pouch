'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api-client';

interface BalanceAsset {
  chainId: number;
  symbol: string;
  amount: number;
  usdValue: number;
  walletLabel?: string;
}

interface BalanceData {
  total: number;
  assets: BalanceAsset[];
  requiresConsolidation: boolean;
}

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum',
  8453: 'Base',
  1: 'Ethereum',
  137: 'Polygon',
  43114: 'Avalanche',
};

export function WalletPanel() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchBalance() {
      try {
        const data = await apiGet<BalanceData>('/balance?userId=demo-user');
        if (!cancelled) setBalance(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchBalance();
    const interval = setInterval(fetchBalance, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <PanelCard title="💰 Wallets">
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--border)]" />
        </div>
      </PanelCard>
    );
  }

  if (!balance || balance.assets.length === 0) {
    return (
      <PanelCard title="💰 Wallets">
        <p className="text-xs text-[var(--muted)]">No funds detected on any wallet or chain.</p>
      </PanelCard>
    );
  }

  // Group assets by wallet label
  const byWallet = new Map<string, BalanceAsset[]>();
  for (const a of balance.assets) {
    const key = a.walletLabel ?? 'Wallet';
    const list = byWallet.get(key) ?? [];
    list.push(a);
    byWallet.set(key, list);
  }

  const walletCount = byWallet.size;
  const chainCount = new Set(balance.assets.map((a) => a.chainId)).size;

  return (
    <PanelCard title={`💰 Wallets (${walletCount} wallet${walletCount > 1 ? 's' : ''})`}>
      <div className="space-y-3">
        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-[var(--accent)]/10 px-3 py-2">
          <span className="text-xs font-medium text-[var(--fg)]">
            Total Balance · {chainCount} chain{chainCount > 1 ? 's' : ''}
          </span>
          <span className="text-sm font-bold text-[var(--accent)]">${balance.total.toFixed(2)}</span>
        </div>

        {/* Per-wallet breakdown */}
        {Array.from(byWallet.entries()).map(([walletLabel, assets]) => {
          const walletTotal = assets.reduce((sum, a) => sum + a.usdValue, 0);
          return (
            <div key={walletLabel} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--fg)]">{walletLabel}</span>
                <span className="text-[11px] font-medium text-[var(--accent)]">${walletTotal.toFixed(2)}</span>
              </div>
              {assets.map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-[var(--border)]/50 bg-[var(--bg)] px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[var(--border)]/50 px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                      {CHAIN_NAMES[a.chainId] ?? `Chain ${a.chainId}`}
                    </span>
                    <span className="text-xs text-[var(--fg)]">
                      {a.amount} {a.symbol}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[var(--fg)]">${a.usdValue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Consolidation status */}
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
          balance.requiresConsolidation
            ? 'bg-amber-400/10 text-amber-300'
            : 'bg-emerald-400/10 text-emerald-300'
        }`}>
          <span>{balance.requiresConsolidation ? '⚠️' : '✅'}</span>
          <span>
            {balance.requiresConsolidation
              ? `${walletCount > 1 ? 'Multi-wallet' : 'Multi-chain'} detected — Particle UA EIP-7702 consolidation ready`
              : 'Single wallet, single chain — no consolidation needed'}
          </span>
        </div>
      </div>
    </PanelCard>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
      {children}
    </div>
  );
}