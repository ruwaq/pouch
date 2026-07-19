'use client';
import type { AgentChatResponse } from '../../lib/types';
import { TraceTimeline } from './TraceTimeline';
import { ReceiptCard } from './ReceiptCard';
import { ConfirmationCard } from './ConfirmationCard';
import { SendConfirmationCard } from './SendConfirmationCard';
import { SendReceiptCard } from './SendReceiptCard';
import { SwapConfirmationCard } from './SwapConfirmationCard';
import { SwapReceiptCard } from './SwapReceiptCard';
import { FundGasReceiptCard } from './FundGasReceiptCard';
import { FundGasConfirmationCard } from './FundGasConfirmationCard';

export function AgentTurn({ response }: { response: AgentChatResponse }) {
  const isConfirmation = response.phase === 'confirmation';
  const isSendConfirmation = response.phase === 'send_confirmation';
  const isSwapConfirmation = response.phase === 'swap_confirmation';
  const isFundGasConfirmation = response.phase === 'fund_gas_confirmation';
  const isExecuted = response.phase === 'executed';
  const isSend = response.intent.action === 'send';
  const isSwap = response.intent.action === 'swap';

  return (
    <div className="mt-2 space-y-2">
      {/* Reply text — hidden when confirmation card is shown */}
      {!isConfirmation && !isSendConfirmation && !isSwapConfirmation && !isFundGasConfirmation ? (
        <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">{response.reply}</p>
      ) : null}

      {/* Send confirmation card */}
      {isSendConfirmation ? <SendConfirmationCard response={response} /> : null}

      {/* Swap confirmation card */}
      {isSwapConfirmation ? <SwapConfirmationCard response={response} /> : null}

      {/* Fund gas confirmation card */}
      {isFundGasConfirmation ? <FundGasConfirmationCard response={response} /> : null}

      {/* Cash-out confirmation card */}
      {isConfirmation ? <ConfirmationCard response={response} /> : null}

      {/* Send receipt card */}
      {isExecuted && isSend && response.sendReceipt ? (
        <SendReceiptCard receipt={response.sendReceipt} />
      ) : null}

      {/* Swap receipt card */}
      {isExecuted && isSwap && response.swapReceipt ? (
        <SwapReceiptCard receipt={response.swapReceipt} />
      ) : null}

      {/* Fund gas receipt card */}
      {isExecuted && response.fundGasReceipt ? (
        <FundGasReceiptCard receipt={response.fundGasReceipt} />
      ) : null}

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
      {response.status === 'delivered' && !isSend ? <ReceiptCard orderId={response.orderId} /> : null}
    </div>
  );
}