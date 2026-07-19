'use client';
import type { SwapResult } from '../../lib/types';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
  8453: 'Base',
  43114: 'Avalanche C-Chain',
};

/**
 * Receipt card for token swaps (ARB → ETH via Uniswap V3).
 */
export function SwapReceiptCard({ receipt }: { receipt: SwapResult }) {
  const chainName = CHAIN_NAMES[receipt.chainId] ?? `Chain ${receipt.chainId}`;
  const explorerUrl = receipt.explorerUrl ?? `https://arbiscan.io/tx/${receipt.txHash}`;
  const shortTxHash = `${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-8)}`;

  return (
    <div className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔄</span>
          <span className="text-sm font-semibold text-[var(--fg)]">Swap Complete</span>
        </div>
        {receipt.blockNumber ? (
          <span className="text-[10px] font-medium text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">
            Block #{receipt.blockNumber}
          </span>
        ) : null}
      </div>

      {/* Swap details */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📤 Sold</span>
          <span className="font-semibold text-[var(--fg)]">
            {receipt.amountIn} {receipt.tokenIn}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📥 Received</span>
          <span className="font-semibold text-emerald-400">
            {receipt.amountOut} {receipt.tokenOut}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">👛 Wallet</span>
          <span className="text-[var(--fg)]">{receipt.walletLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">🔄 Route</span>
          <span className="text-[var(--fg)]">Uniswap V3</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛽ Gas</span>
          <span className="text-[var(--muted-2)]">
            {receipt.gasCostUsd ? `$${receipt.gasCostUsd.toFixed(4)}` : receipt.gasUsed ?? 'N/A'}
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

      {/* Explorer link */}
      <div className="mt-3">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-center text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
        >
          🔗 View on Arbiscan
        </a>
      </div>

      {/* Educational footer */}
      <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        💡 This swap used <strong>Uniswap V3</strong> on {chainName} to convert {receipt.tokenIn} → {receipt.tokenOut}.
        You now have ETH for gas! Try sending ARB to another wallet.
        {' '}The transaction is verifiable on-chain via the explorer link above.
      </p>
    </div>
  );
}