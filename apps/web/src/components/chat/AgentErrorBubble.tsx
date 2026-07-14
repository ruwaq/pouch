'use client';

const FRIENDLY_PREFIX: Record<string, string> = {
  INSUFFICIENT_FUNDS: "You don't have enough balance for that. ",
  NO_PROVIDER_AVAILABLE: "I couldn't find a provider for that. ",
  ALL_PROVIDERS_FAILED: 'All providers are unavailable right now. ',
  AGENT_WALLET_SETTLE_FAILED: 'The gasless settlement failed. ',
  AGENT_WALLET_NOT_CONFIGURED: 'Gasless settlement is not configured. ',
};

export function AgentErrorBubble({ message, type }: { message: string; type?: string | null }) {
  const prefix = (type && FRIENDLY_PREFIX[type]) ?? "I couldn't complete that. ";
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] break-words rounded-2xl rounded-bl-sm border border-red-500/20 bg-red-500/5 px-4 py-3">
        <p className="text-sm text-[var(--fg)]">
          <span className="text-red-300">⚠ </span>
          {prefix}
          <span className="text-[var(--muted-2)]">{message}</span>
        </p>
      </div>
    </div>
  );
}
