'use client';
import type { AgentChatResponse } from '../../lib/types';
import { useChat } from '../../context/chat-context';

/**
 * Confirmation card for gas funding via Openfort.
 * Shows the amount to be sent, the destination wallet,
 * and confirm/cancel buttons.
 */
export function FundGasConfirmationCard({ response }: { response: AgentChatResponse }) {
  const { sendMessage } = useChat();
  const intent = response.intent;
  const amountEth = intent.amount.value > 0 ? intent.amount.value : 0.00005;
  const fromLabel = intent.fromLabel ?? 'Wallet 1';

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⛽</span>
        <span className="text-sm font-semibold text-[var(--fg)]">Confirm Gas Funding</span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📤 From</span>
          <span className="text-[var(--fg)]">Openfort Backend</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📥 To</span>
          <span className="text-[var(--fg)]">{fromLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">💰 Amount</span>
          <span className="font-semibold text-[var(--fg)]">{amountEth} ETH</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛽ Gas Cost</span>
          <span className="text-emerald-400">Sponsored by Openfort ($0.00)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛓️ Network</span>
          <span className="text-[var(--fg)]">Arbitrum One</span>
        </div>
      </div>

      {response.planSummary ? (
        <p className="text-xs text-[var(--muted)] mb-3">{response.planSummary}</p>
      ) : null}

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => sendMessage('yes')}
          className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors active:scale-[0.98]"
        >
          ✅ Confirm
        </button>
        <button
          onClick={() => sendMessage('cancel')}
          className="flex-1 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors active:scale-[0.98]"
        >
          ❌ Cancel
        </button>
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)] text-center">
        Openfort will send ETH to your wallet for gas — <strong>free for you</strong>.
        Reply &ldquo;yes&rdquo; to confirm or &ldquo;cancel&rdquo; to abort.
      </p>
    </div>
  );
}