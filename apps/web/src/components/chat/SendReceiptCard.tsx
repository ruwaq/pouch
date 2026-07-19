'use client';
import type { SendReceipt } from '../../lib/types';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
  8453: 'Base',
  43114: 'Avalanche C-Chain',
  1: 'Ethereum',
  137: 'Polygon',
};

/**
 * Receipt card for wallet-to-wallet transfers.
 * Shows tx hash, block number, gas cost, from/to addresses,
 * and links to Arbiscan/block explorer.
 */
export function SendReceiptCard({ receipt }: { receipt: SendReceipt }) {
  const chainName = CHAIN_NAMES[receipt.chainId] ?? `Chain ${receipt.chainId}`;
  const explorerUrl = receipt.explorerUrl ?? `https://arbiscan.io/tx/${receipt.txHash}`;
  const shortTxHash = `${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-8)}`;
  const shortFrom = receipt.fromAddress.length > 12
    ? `${receipt.fromAddress.slice(0, 6)}...${receipt.fromAddress.slice(-4)}`
    : receipt.fromAddress;
  const shortTo = receipt.toAddress.length > 12
    ? `${receipt.toAddress.slice(0, 6)}...${receipt.toAddress.slice(-4)}`
    : receipt.toAddress;

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">✅</span>
          <span className="text-sm font-semibold text-[var(--fg)]">Transfer Complete</span>
        </div>
        {receipt.blockNumber ? (
          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
            Block #{receipt.blockNumber}
          </span>
        ) : null}
      </div>

      {/* Transfer details */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📤 From</span>
          <span className="text-[var(--fg)]">
            {receipt.fromLabel} <span className="text-xs text-[var(--muted)]">({shortFrom})</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📥 To</span>
          <span className="text-[var(--fg)]">
            {receipt.toLabel} <span className="text-xs text-[var(--muted)]">({shortTo})</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">💰 Amount</span>
          <span className="font-semibold text-[var(--fg)]">
            {receipt.amount.value} {receipt.token}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛽ Gas</span>
          <span className={receipt.gasSponsored ? 'text-emerald-400' : 'text-[var(--muted-2)]'}>
            {receipt.gasSponsored
              ? 'Sponsored by Openfort ($0.00)'
              : receipt.gasCostUsd
                ? `$${receipt.gasCostUsd.toFixed(4)}`
                : receipt.gasUsed
                  ? receipt.gasUsed
                  : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛓️ Network</span>
          <span className="text-[var(--fg)]">{chainName}</span>
        </div>
      </div>

      {/* Transaction hash */}
      <div className="mt-3 rounded-lg bg-black/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Tx Hash</span>
          <span className="font-mono text-xs text-[var(--muted-2)]">{shortTxHash}</span>
        </div>
      </div>

      {/* Explorer links */}
      <div className="mt-3 flex gap-2">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-center text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
        >
          🔗 View on Arbiscan
        </a>
        {receipt.gasSponsored && (
          <a
            href="https://dashboard.openfort.io"
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-lg bg-purple-400/10 px-3 py-2 text-center text-xs font-medium text-purple-400 hover:bg-purple-400/20 transition-colors"
          >
            ⛽ Openfort Dashboard
          </a>
        )}
      </div>

      {/* Educational footer */}
      <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        💡 This transfer was executed on <strong>{chainName}</strong> using a blind signature
        (Magic) — no wallet popup was needed.
        {receipt.gasSponsored
          ? ' Gas fees were sponsored by Openfort.'
          : ` Gas cost: ${receipt.gasCostUsd ? `$${receipt.gasCostUsd.toFixed(4)}` : 'minimal'}.`}
        {' '}The transaction is verifiable on-chain via the explorer link above.
      </p>
    </div>
  );
}