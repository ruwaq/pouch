'use client';
import type { AgentChatResponse } from '../../lib/types';
import { useChat } from '../../context/chat-context';

/**
 * Confirmation card for wallet-to-wallet transfers.
 * Shows the transfer details and asks the user to confirm or cancel.
 */
export function SendConfirmationCard({ response }: { response: AgentChatResponse }) {
  const { sendMessage } = useChat();
  const intent = response.intent;
  const balance = response.balanceSnapshot;

  const token = intent.token ?? intent.brand ?? 'ETH';
  const amount = intent.amount.value;
  const fromLabel = intent.fromLabel ?? 'Wallet 1';
  const toLabel = intent.toLabel ?? 'Wallet 3';
  const chainId = intent.chainId ?? 42161;
  const chainName = chainId === 42161 ? 'Arbitrum One' : `Chain ${chainId}`;

  // Find the source wallet balance for this token
  const sourceAssets = balance?.assets?.filter(
    (a) => a.walletLabel === fromLabel && a.symbol?.toUpperCase() === token.toUpperCase(),
  ) ?? [];
  const availableBalance = sourceAssets.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">💸</span>
        <span className="text-sm font-semibold text-[var(--fg)]">Confirm Transfer</span>
      </div>

      {/* Transfer details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Amount</span>
          <span className="font-semibold text-[var(--fg)]">
            {amount} {token}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">From</span>
          <span className="text-[var(--fg)]">{fromLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">To</span>
          <span className="text-[var(--fg)]">{toLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Network</span>
          <span className="text-[var(--fg)]">{chainName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Gas</span>
          <span className="text-emerald-400 font-medium">Sponsored by Openfort</span>
        </div>
        {availableBalance > 0 && (
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Available</span>
            <span className="text-[var(--muted-2)]">
              {availableBalance.toFixed(4)} {token}
            </span>
          </div>
        )}
      </div>

      {/* Security note */}
      {response.securityVerdict && (
        <div className="mt-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
          🛡️ Security: {response.securityVerdict.verdict === 'ALLOW' ? 'Approved' : response.securityVerdict.verdict === 'WARN' ? 'Warning — proceed with caution' : 'Blocked'}
          {response.securityVerdict.riskScore > 0 && (
            <span className="ml-1">(Risk: {response.securityVerdict.riskScore}/100)</span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => sendMessage('yes')}
          className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
        >
          ✅ Confirm
        </button>
        <button
          onClick={() => sendMessage('no')}
          className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--card)] transition-colors"
        >
          ❌ Cancel
        </button>
      </div>

      <p className="mt-2 text-[10px] text-[var(--muted)] text-center">
        This will send a real transaction on Arbitrum. Gas is sponsored by Openfort.
      </p>
    </div>
  );
}