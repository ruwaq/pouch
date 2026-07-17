'use client';

import { useChat } from '../../context/chat-context';
import type { AgentChatResponse } from '../../lib/types';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum',
  8453: 'Base',
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
};

const CATEGORY_LABELS: Record<string, string> = {
  giftcard: 'Gift Card',
  topup: 'Mobile Top-Up',
  esim: 'eSIM',
  billpay: 'Bill Pay',
  bank: 'Bank Transfer',
  card: 'Card',
};

interface ConfirmationCardProps {
  response: AgentChatResponse;
}

export function ConfirmationCard({ response }: ConfirmationCardProps) {
  const { sendMessage, isSending } = useChat();
  const { intent, balanceSnapshot, planSummary } = response;
  const brand = intent.brand
    ? intent.brand.charAt(0).toUpperCase() + intent.brand.slice(1)
    : 'your selection';
  const categoryLabel = CATEGORY_LABELS[intent.category] ?? intent.category;
  const chains = balanceSnapshot?.assets.length ?? 0;
  const chainNames = balanceSnapshot?.assets
    .map((a) => CHAIN_NAMES[a.chainId] ?? `Chain ${a.chainId}`)
    .filter((v, i, arr) => arr.indexOf(v) === i); // unique

  return (
    <div className="mt-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--card)] overflow-hidden">
      {/* Header */}
      <div className="bg-[var(--accent)]/10 px-4 py-3 border-b border-[var(--accent)]/20">
        <p className="text-sm font-semibold text-[var(--fg)]">
          Confirm Transaction
        </p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Review the details before approving
        </p>
      </div>

      {/* Transaction details */}
      <div className="px-4 py-3 space-y-3">
        {/* Product & Amount */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide">
              {categoryLabel}
            </p>
            <p className="text-sm font-medium text-[var(--fg)]">
              {brand}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-[var(--fg)]">
              ${intent.amount.value.toFixed(2)}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              {intent.amount.currency}
            </p>
          </div>
        </div>

        {/* Balance info */}
        {balanceSnapshot ? (
          <div className="rounded-lg bg-white/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Your balance</span>
              <span className="text-xs font-medium text-[var(--fg)]">
                ${balanceSnapshot.total.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Across</span>
              <span className="text-xs text-[var(--muted-2)]">
                {chains} chain{chains === 1 ? '' : 's'}
                {chainNames && chainNames.length > 0 ? ` (${chainNames.join(', ')})` : ''}
              </span>
            </div>
            {balanceSnapshot.requiresConsolidation ? (
              <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border)]">
                <span className="text-[10px] text-amber-300">
                  ⚡ Will consolidate via UA 7702
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Plan summary */}
        {planSummary ? (
          <p className="text-xs text-[var(--muted)] italic">
            {planSummary}
          </p>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 py-3 border-t border-[var(--border)]">
        <button
          disabled={isSending}
          onClick={() => void sendMessage('no')}
          className="
            flex-1 rounded-lg border border-[var(--border)]
            px-4 py-2 text-sm font-medium text-[var(--muted)]
            hover:bg-white/5 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Cancel
        </button>
        <button
          disabled={isSending}
          onClick={() => void sendMessage('yes')}
          className="
            flex-1 rounded-lg bg-[var(--accent)]
            px-4 py-2 text-sm font-semibold text-white
            hover:brightness-110 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed
            active:scale-[0.98]
          "
        >
          {isSending ? 'Confirming…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}