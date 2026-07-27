'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/chat-context';
import { apiPost } from '../../lib/api-client';
import type { UaConsolidateReceipt } from '../../lib/types';
import { UaReceiptCard } from '../chat/UaReceiptCard';

const COOLDOWN_MS = 70_000;

interface DemoStep {
  label: string;
  message: string;
  emoji: string;
  bounty: string;
  techBadge: string;
  /** true = shows a confirmation card that needs manual "yes" */
  needsConfirm: boolean;
  hint: string;
}

const STEPS: DemoStep[] = [
  {
    label: 'Check Balance',
    message: 'Show my balance',
    emoji: '💰',
    bounty: 'Arbitrum Bounty',
    techBadge: 'Live RPC',
    needsConfirm: false,
    hint: 'Reads real on-chain balances from Arbitrum via RPC — 4 wallets, all chains',
  },
  {
    label: 'Consolidate $2 (Cross-Chain)',
    message: '__ua_consolidate__', // sentinel: handled by direct API, not chat
    emoji: '🔗',
    bounty: 'Particle Network',
    techBadge: 'EIP-7702',
    needsConfirm: false,
    hint: 'One signature moves $2 USDC Base→Arbitrum via EIP-7702. 70s cooldown (Particle rate-limit).',
  },
  {
    label: 'Fund Gas (Openfort)',
    message: 'Fund gas',
    emoji: '⛽',
    bounty: 'Openfort',
    techBadge: 'Gasless',
    needsConfirm: true,
    hint: 'Openfort sends 0.00005 ETH for gas — $0 to the user. Confirm the card to proceed.',
  },
  {
    label: 'Swap ARB → ETH',
    message: 'swap 0.05 ARB for ETH',
    emoji: '🔄',
    bounty: 'Arbitrum Bounty',
    techBadge: 'Uniswap V3',
    needsConfirm: true,
    hint: 'Real Uniswap V3 swap on Arbitrum. Check the card for details, then confirm.',
  },
  {
    label: 'Send to Wallet 3',
    message: 'send 0.5 ARB to Wallet 3',
    emoji: '💸',
    bounty: 'Arbitrum Bounty',
    techBadge: 'Real TX',
    needsConfirm: true,
    hint: 'Real Arbitrum transfer between wallets. Confirm the card to execute.',
  },
  {
    label: 'Cash Out',
    message: 'cash out $2 to Amazon',
    emoji: '🎁',
    bounty: 'UA Track',
    techBadge: 'UA 7702',
    needsConfirm: true,
    hint: 'Full flow: balance → security → routing → order → payment [NO POPUP]',
  },
];

type StepStatus = 'idle' | 'running' | 'awaiting-confirm' | 'done';

/**
 * DemoFlow — 6 INDEPENDENT demo steps for judges.
 *
 * Each step is run on its own: the judge clicks a step, waits, verifies the
 * real transaction, then clicks the next at their own pace. There is no
 * "Run All" — every step has its own visual status indicator.
 */
export function DemoFlow() {
  const { sendMessage, messages, isSending } = useChat();
  const [stepStates, setStepStates] = useState<StepStatus[]>(() =>
    STEPS.map(() => 'idle'),
  );
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const processedMsgCountRef = useRef(0);

  /**
   * Watch the chat messages. When the latest agent reply arrives for the
   * active step, transition the state appropriately:
   *   - non-confirm step: running → done
   *   - confirm step:     running → awaiting-confirm (until user confirms on the card)
   */
  useEffect(() => {
    if (activeStep === null) return;
    if (isSending) return; // still loading
    if (messages.length <= processedMsgCountRef.current) return;

    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== 'agent' || !latest.response) return;
    processedMsgCountRef.current = messages.length;

    const step = STEPS[activeStep]!;
    const phase = latest.response.phase;

    if (phase === 'executed') {
      // Confirmation was accepted — step is done.
      setStepStates((prev) => {
        const next = [...prev];
        next[activeStep] = 'done';
        return next;
      });
      setActiveStep(null);
      return;
    }

    if (step.needsConfirm && isConfirmPhase(phase)) {
      // Confirmation card is showing — wait for the judge to confirm on it.
      setStepStates((prev) => {
        const next = [...prev];
        next[activeStep] = 'awaiting-confirm';
        return next;
      });
      return;
    }

    if (!step.needsConfirm) {
      // Info step — reply arrived, we're done.
      setStepStates((prev) => {
        const next = [...prev];
        next[activeStep] = 'done';
        return next;
      });
      setActiveStep(null);
    }
  }, [messages, isSending, activeStep]);

  const [uaReceipt, setUaReceipt] = useState<UaConsolidateReceipt | null>(null);
  const [uaRunning, setUaRunning] = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick once a second while a cooldown is active (for the countdown display).
  useEffect(() => {
    if (cooldownEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  const runConsolidate = useCallback(async () => {
    if (uaRunning || activeStep !== null) return;
    if (cooldownEndsAt !== null && Date.now() < cooldownEndsAt) return;
    setUaRunning(true);
    setUaReceipt(null);
    setStepStates((prev) => {
      const next = [...prev];
      next[1] = 'running'; // the consolidate step
      return next;
    });
    try {
      const receipt = await apiPost<UaConsolidateReceipt>('/transactions/execute', {
        targetChainId: 42161,
        token: 'USDC',
        amount: '2',
      });
      setUaReceipt(receipt);
      setStepStates((prev) => {
        const next = [...prev];
        next[1] = receipt.ok ? 'done' : 'idle';
        return next;
      });
      if (receipt.ok) {
        setCooldownEndsAt(Date.now() + COOLDOWN_MS);
      }
    } catch (e) {
      setUaReceipt({
        ok: false,
        transactionId: '',
        activityUrl: '',
        error: e instanceof Error ? e.message : 'Consolidation request failed.',
      });
      setStepStates((prev) => {
        const next = [...prev];
        next[1] = 'idle';
        return next;
      });
    } finally {
      setUaRunning(false);
    }
  }, [uaRunning, activeStep, cooldownEndsAt]);

  const executeStep = useCallback(
    async (index: number) => {
      if (activeStep !== null) return; // another step is running
      const step = STEPS[index]!;
      if (step.message === '__ua_consolidate__') {
        await runConsolidate();
        return;
      }
      setActiveStep(index);
      setStepStates((prev) => {
        const next = [...prev];
        next[index] = 'running';
        return next;
      });
      await sendMessage(step.message);
      // The useEffect above handles state transitions when the reply arrives.
    },
    [activeStep, sendMessage, runConsolidate],
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--fg)]">
          🎯 Live Demo — 6 Independent Steps
        </h3>
      </div>

      <p className="mb-3 text-xs text-[var(--muted)]">
        Click any step to run it. Verify each transaction before moving on. Gas is FREE via Openfort.
      </p>

      <div className="space-y-2">
        {STEPS.map((step, i) => (
          <StepCard
            key={step.label}
            step={step}
            status={stepStates[i]!}
            onClick={() => executeStep(i)}
            disabled={(activeStep !== null && activeStep !== i) || uaRunning}
          />
        ))}
      </div>

      {uaReceipt && <UaReceiptCard receipt={uaReceipt} />}
      {cooldownEndsAt !== null && now < cooldownEndsAt && (
        <p className="text-[11px] font-medium text-amber-400">
          ⏱️ Cooldown: {Math.ceil((cooldownEndsAt - now) / 1000)}s before next consolidate
        </p>
      )}
    </div>
  );
}

function StepCard({
  step,
  status,
  onClick,
  disabled,
}: {
  step: DemoStep;
  status: StepStatus;
  onClick: () => void;
  disabled: boolean;
}) {
  const borderClass =
    status === 'done'
      ? 'border-emerald-500/40'
      : status === 'running' || status === 'awaiting-confirm'
        ? 'border-[var(--accent)]/60'
        : 'border-[var(--border)]/40 hover:border-[var(--border)]';

  const bgClass =
    status === 'done'
      ? 'bg-emerald-500/5'
      : status === 'awaiting-confirm'
        ? 'bg-[var(--accent)]/5'
        : 'bg-[var(--card)]/60';

  const cta =
    status === 'done'
      ? '✓ Done'
      : status === 'running'
        ? '⏳ Running…'
        : status === 'awaiting-confirm'
          ? '🔐 Confirm below'
          : 'Run ▶';

  const ctaClass =
    status === 'done'
      ? 'text-emerald-500'
      : status === 'running' || status === 'awaiting-confirm'
        ? 'text-[var(--accent)]'
        : 'text-[var(--accent)]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || status === 'done' || status === 'running' || status === 'awaiting-confirm'}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed ${borderClass} ${bgClass}`}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center text-sm">
        {status === 'done' ? (
          <span className="text-emerald-500">✅</span>
        ) : status === 'running' ? (
          <span className="animate-pulse text-[var(--accent)]">⏳</span>
        ) : status === 'awaiting-confirm' ? (
          <span className="text-[var(--accent)]">🔐</span>
        ) : (
          <span>{step.emoji}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--fg)]">{step.label}</span>
          <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
            {step.techBadge}
          </span>
          <span className="text-[10px] text-[var(--muted)]">{step.bounty}</span>
          {/* Visual status indicator (NOT a nested button — keeps DOM valid). */}
          <span className={`ml-auto shrink-0 text-[10px] font-semibold ${ctaClass}`}>{cta}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
          {step.hint}
        </p>
        {status === 'awaiting-confirm' && (
          <p className="mt-1 text-[11px] font-medium text-[var(--accent)]">
            ⬇ Scroll down and click Confirm on the card
          </p>
        )}
        {status === 'done' && (
          <p className="mt-1 text-[11px] font-medium text-emerald-500">
            ✓ Transaction verified on-chain
          </p>
        )}
      </div>
    </button>
  );
}

function isConfirmPhase(phase: string): boolean {
  return (
    phase === 'confirmation' ||
    phase === 'send_confirmation' ||
    phase === 'swap_confirmation' ||
    phase === 'fund_gas_confirmation'
  );
}
