'use client';
import type { AgentChatResponse } from '../../lib/types';
import { useChat } from '../../context/chat-context';

/**
 * Confirmation card for token swaps (ARB → ETH via Uniswap V3).
 */
export function SwapConfirmationCard({ response }: { response: AgentChatResponse }) {
  const { sendMessage, isSending } = useChat();
  const intent = response.intent;
  const balance = response.balanceSnapshot;

  const tokenIn = intent.token ?? intent.brand ?? 'ARB';
  const tokenOut = intent.targetToken ?? 'ETH';
  const amount = intent.amount.value;
  const fromLabel = intent.fromLabel ?? 'Wallet 1';

  // Find the source wallet ARB balance
  const arbAssets = balance?.assets?.filter(
    (a) => a.walletLabel === fromLabel && a.symbol === 'ARB',
  ) ?? [];
  const availableARB = arbAssets.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔄</span>
        <span className="text-sm font-semibold text-[var(--fg)]">Confirm Swap</span>
      </div>

      {/* Swap details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Sell</span>
          <span className="font-semibold text-[var(--fg)]">
            {amount} {tokenIn}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Receive</span>
          <span className="font-semibold text-emerald-400">
            ~{tokenOut}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">From</span>
          <span className="text-[var(--fg)]">{fromLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Route</span>
          <span className="text-[var(--fg)]">Uniswap V3 · Arbitrum</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Purpose</span>
          <span className="text-[var(--muted-2)]">Get ETH for gas</span>
        </div>
        {availableARB > 0 && (
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Available</span>
            <span className="text-[var(--muted-2)]">
              {availableARB.toFixed(4)} ARB
            </span>
          </div>
        )}
      </div>

      {/* Security note */}
      {response.securityVerdict && (
        <div className="mt-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
          🛡️ Security: {response.securityVerdict.verdict === 'ALLOW' ? 'Approved' : 'Warning'}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => sendMessage('yes')}
          disabled={isSending}
          className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? '⏳ Processing…' : '✅ Confirm Swap'}
        </button>
        <button
          onClick={() => sendMessage('no')}
          disabled={isSending}
          className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--card)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ❌ Cancel
        </button>
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)] text-center">
        This will execute a real swap on Uniswap V3 (Arbitrum). You'll receive ETH for gas.
      </p>
    </div>
  );
}