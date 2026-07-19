'use client';
import type { FundGasReceipt } from '../../lib/types';
import { getExplorerName, getExplorerUrl } from '@pouch/shared';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
  8453: 'Base',
  43114: 'Avalanche C-Chain',
  1: 'Ethereum',
  137: 'Polygon',
};

/**
 * Receipt card for gas funding operations (Openfort sendEth).
 * Shows the ETH sent, from/to with clickable addresses,
 * gas sponsorship info, and explorer links.
 */
export function FundGasReceiptCard({ receipt }: { receipt: FundGasReceipt }) {
  const chainName = CHAIN_NAMES[receipt.chainId] ?? `Chain ${receipt.chainId}`;
  const explorerUrl = receipt.explorerUrl ?? getExplorerUrl(receipt.chainId, 'tx', receipt.txHash);
  const explorerName = getExplorerName(receipt.chainId);
  const shortTxHash = `${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-8)}`;
  const shortFrom = receipt.fromAddress.length > 12
    ? `${receipt.fromAddress.slice(0, 6)}...${receipt.fromAddress.slice(-4)}`
    : receipt.fromAddress;
  const shortTo = receipt.toAddress.length > 12
    ? `${receipt.toAddress.slice(0, 6)}...${receipt.toAddress.slice(-4)}`
    : receipt.toAddress;
  const fromExplorerUrl = receipt.fromAddress
    ? getExplorerUrl(receipt.chainId, 'address', receipt.fromAddress)
    : null;
  const toExplorerUrl = receipt.toAddress
    ? getExplorerUrl(receipt.chainId, 'address', receipt.toAddress)
    : null;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⛽</span>
          <span className="text-sm font-semibold text-[var(--fg)]">Gas Funded</span>
        </div>
        {receipt.blockNumber ? (
          <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            Block #{receipt.blockNumber}
          </span>
        ) : null}
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📤 From</span>
          <span className="text-[var(--fg)]">
            {receipt.fromLabel}
            {receipt.fromAddress && fromExplorerUrl ? (
              <>
                {' '}
                <a
                  href={fromExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--accent)] underline"
                >
                  ({shortFrom})
                </a>
              </>
            ) : (
              <span className="text-xs text-[var(--muted)]">({shortFrom})</span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📥 To</span>
          <span className="text-[var(--fg)]">
            {receipt.toLabel}
            {toExplorerUrl ? (
              <>
                {' '}
                <a
                  href={toExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--accent)] underline"
                >
                  ({shortTo})
                </a>
              </>
            ) : (
              <span className="text-xs text-[var(--muted)]">({shortTo})</span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">💰 Amount</span>
          <span className="font-semibold text-[var(--fg)]">
            {receipt.amountEth} ETH
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛽ Gas</span>
          <span className="text-emerald-400">
            Sponsored by Openfort 🛡️ $0.00
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
          🔗 View on {explorerName}
        </a>
        <a
          href="https://dashboard.openfort.io"
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-purple-400/10 px-3 py-2 text-center text-xs font-medium text-purple-400 hover:bg-purple-400/20 transition-colors"
        >
          🛡️ Openfort Dashboard
        </a>
      </div>

      {/* Educational footer */}
      <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        💡 Openfort sent {receipt.amountEth} ETH to {receipt.toLabel} for gas — <strong>free for you</strong>.
        This covers ~{Math.floor(receipt.amountEth / 0.000002)} transactions on {chainName}.
        {' '}The transaction is verifiable on-chain via the explorer link above.
      </p>
    </div>
  );
}