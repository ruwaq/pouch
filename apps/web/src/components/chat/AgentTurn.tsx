'use client';
import type { AgentChatResponse } from '../../lib/types';
import { TraceTimeline } from './TraceTimeline';
import { ReceiptCard } from './ReceiptCard';
import { ConfirmationCard } from './ConfirmationCard';

export function AgentTurn({ response }: { response: AgentChatResponse }) {
  const isConfirmation = response.phase === 'confirmation';

  return (
    <div className="mt-2 space-y-2">
      {/* Reply text — hidden when confirmation card is shown */}
      {!isConfirmation ? (
        <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">{response.reply}</p>
      ) : null}

      {/* Confirmation card with transaction details + Confirm/Cancel buttons */}
      {isConfirmation ? <ConfirmationCard response={response} /> : null}

      {response.trace.length > 0 ? (
        <>
          <div className="flex items-center gap-2 pt-1">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              🔍 Under the hood
            </span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <TraceTimeline trace={response.trace} />
        </>
      ) : null}
      {response.status === 'delivered' ? <ReceiptCard orderId={response.orderId} /> : null}
    </div>
  );
}