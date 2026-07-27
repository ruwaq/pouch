'use client';
import type { UaConsolidateReceipt } from '../../lib/types';

/**
 * Receipt for a UA cross-chain consolidation.
 *
 * The authoritative link is the universalx.app activity URL (always present).
 * Per-leg Arbiscan/BaseScan links are added when the backend surfaces them
 * (the getTransaction() shape is being finalized — this card degrades
 * gracefully to just the activity link until then).
 */
export function UaReceiptCard({ receipt }: { receipt: UaConsolidateReceipt }) {
  const shortId = receipt.transactionId
    ? `${receipt.transactionId.slice(0, 10)}...${receipt.transactionId.slice(-6)}`
    : '—';

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔗</span>
          <span className="text-sm font-semibold text-[var(--fg)]">
            {receipt.ok
              ? 'Cross-Chain Consolidated'
              : receipt.timedOut
                ? 'Consolidation In Progress'
                : 'Consolidation Failed'}
          </span>
        </div>
        <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
          EIP-7702 · Particle UA
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">🔀 Route</span>
          <span className="text-[var(--fg)]">Base → Arbitrum</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">💰 Amount</span>
          <span className="font-semibold text-[var(--fg)]">$2.00 USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">✍️ Signed</span>
          <span className="text-emerald-400">Single signature (server-side)</span>
        </div>
        {receipt.rateLimited && (
          <div className="rounded bg-amber-400/10 px-2 py-1 text-xs text-amber-400">
            ⏱️ Particle limits 1 convert/minute. Wait ~70s and retry.
          </div>
        )}
        {receipt.error && !receipt.rateLimited && (
          <div className={`rounded px-2 py-1 text-xs ${receipt.timedOut ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
            {receipt.timedOut
              ? `${receipt.error} Check the activity link below — cross-chain converts keep settling after this view closes.`
              : receipt.error}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg bg-black/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">UA Tx ID</span>
          <span className="font-mono text-xs text-[var(--muted-2)]">{shortId}</span>
        </div>
      </div>

      {receipt.activityUrl && (
        <a
          href={receipt.activityUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex-1 rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-center text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors block"
        >
          🔗 View on Universal (both legs)
        </a>
      )}

      <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        💡 One signature moved USDC across chains via EIP-7702. The UA scanned holdings,
        routed the bridge, and settled — no manual bridging. Verify both legs on the activity link.
      </p>
    </div>
  );
}
