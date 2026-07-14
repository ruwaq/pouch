'use client';
import type { AgentChatResponse } from '../../lib/types';
import { TraceTimeline } from './TraceTimeline';
import { ReceiptCard } from './ReceiptCard';

export function AgentTurn({ response }: { response: AgentChatResponse }) {
  return (
    <div className="mt-2 space-y-2">
      <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">{response.reply}</p>
      {response.trace.length > 0 ? <TraceTimeline trace={response.trace} /> : null}
      {response.status === 'delivered' ? <ReceiptCard orderId={response.orderId} /> : null}
    </div>
  );
}
