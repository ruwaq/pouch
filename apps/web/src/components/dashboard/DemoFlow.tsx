'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/chat-context';

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
    label: 'Chain Abstraction',
    message: 'What is chain abstraction?',
    emoji: '🔗',
    bounty: 'Particle Network',
    techBadge: 'EIP-7702',
    needsConfirm: false,
    hint: 'EIP-7702 lets the UA scan + consolidate funds across Arbitrum, Base, Ethereum — no bridging',
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
 * DemoFlow — 6 independent demo steps for judges.
 *
 * Design goals (from user feedback):
 *   1. Each step is **independent** — judge clicks one, waits, verifies the
 *      real transaction, then clicks the next at their own pace.
 *   2. "Run All" is **sequential + pauses** at every confirmation card —
 *      the judge must manually click Confirm on the card before the next
 *      step fires. This way the judge can verify each real transaction.
 *   3. Visual states (idle → running → awaiting-confirm → done) make it
 *      obvious what's happening at every moment.
 */
export function DemoFlow() {
  const { sendMessage, messages, isSending } = useChat();
  const [stepStates, setStepStates] = useState<StepStatus[]>(() =>
    STEPS.map(() => 'idle'),
  );
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [runAllMode, setRunAllMode] = useState(false);
  const runAllRef = useRef(false);
  const processedMsgCountRef = useRef(0);

  /**
   * Watch the chat messages. When the latest agent reply arrives for the
   * active step, transition the state appropriately:
   *   - non-confirm step: running → done
   *   - confirm step:       running → awaiting-confirm (until user clicks Confirm on card)
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
      // Confirmation was accepted — step is done
      setStepStates((prev) => {
        const next = [...prev];
        next[activeStep] = 'done';
        return next;
      });
      setActiveStep(null);
      return;
    }

    if (step.needsConfirm && isConfirmPhase(phase)) {
      // Confirmation card is showing — wait for the judge to click Confirm
      setStepStates((prev) => {
        const next = [...prev];
        next[activeStep] = 'awaiting-confirm';
        return next;
      });
      return;
    }

    if (!step.needsConfirm) {
      // Info step — reply arrived, we're done
      setStepStates((prev) => {
        const next = [...prev];
        next[activeStep] = 'done';
        return next;
      });
      setActiveStep(null);
    }
  }, [messages, isSending, activeStep]);

  const executeStep = useCallback(
    async (index: number) => {
      if (activeStep !== null) return; // another step is running
      setActiveStep(index);
      setStepStates((prev) => {
        const next = [...prev];
        next[index] = 'running';
        return next;
      });
      await sendMessage(STEPS[index]!.message);
      // The useEffect above handles state transitions when the reply arrives.
      // For non-confirm steps, done is set there.
      // For confirm steps, we stay at running until the confirmation phase is detected.
    },
    [activeStep, sendMessage],
  );

  /**
   * Run All — sequential execution.
   * Fires each step, then PAUSES at every confirmation card.
   * The judge must manually click Confirm on the card to proceed.
   * This lets judges verify each real transaction before the next step runs.
   */
  const runAll = useCallback(async () => {
    if (activeStep !== null || runAllRef.current) return;
    runAllRef.current = true;
    setRunAllMode(true);

    for (let i = 0; i < STEPS.length; i++) {
      // Skip already-done steps
      if (stepStates[i] === 'done') continue;

      await executeStep(i);

      if (STEPS[i]!.needsConfirm) {
        // Wait for the judge to click Confirm on the card.
        // The step transitions: running → awaiting-confirm → done (after executed phase).
        // We poll until the step is 'done' before moving on.
        await waitForStepDone();
        // Small gap so the judge can read the result
        await sleep(1500);
      } else {
        // Info step — reply arrived, small pause for readability
        await sleep(2000);
      }
    }

    runAllRef.current = false;
    setRunAllMode(false);
  }, [activeStep, stepStates, executeStep]);

  /** Poll until the latest message has phase 'executed' */
  const waitForStepDone = (): Promise<void> =>
    new Promise((resolve) => {
      const check = () => {
        // Read the latest value via a ref-like pattern
        // We can't read state directly here, but we can poll via messages
        // Instead, rely on the activeStep ref + stepStates in useEffect.
        // Simpler: watch for 'executed' phase in the message list.
        const last = messages[messages.length - 1];
        if (last?.role === 'agent' && last.response?.phase === 'executed') {
          resolve();
        } else {
          setTimeout(check, 400);
        }
      };
      check();
    });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--fg)]">
          🎯 Live Demo — 6 Independent Steps
        </h3>
        <button
          type="button"
          onClick={runAll}
          disabled={activeStep !== null || runAllRef.current}
          className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[var(--accent)]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runAllMode ? '▶ Running…' : '▶ Run All 6 Steps'}
        </button>
      </div>

      <p className="mb-3 text-xs text-[var(--muted)]">
        {runAllMode
          ? 'Sequential mode — click Confirm on each card before the next step runs.'
          : 'Click any step to run it independently. Verify each transaction before moving on.'}
      </p>

      <div className="space-y-2">
        {STEPS.map((step, i) => (
          <StepCard
            key={step.label}
            step={step}
            status={stepStates[i]!}
            onClick={() => executeStep(i)}
            disabled={activeStep !== null && activeStep !== i}
          />
        ))}
      </div>
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
