'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '../../context/chat-context';

const DEMO_STEPS = [
  {
    label: 'Check Balance',
    message: 'Show my balance',
    icon: '💰',
    description: 'Reads real on-chain balances via RPC — 4 wallets, all chains',
    bounty: 'Arbitrum Bounty',
    tech: 'Live RPC',
    needsConfirm: false,
  },
  {
    label: 'Chain Abstraction',
    message: 'What is chain abstraction?',
    icon: '🔮',
    description: 'Particle Network UA + EIP-7702: one balance, any chain',
    bounty: 'UA Track',
    tech: 'EIP-7702',
    needsConfirm: false,
  },
  {
    label: 'Fund Gas (Openfort)',
    message: 'fund gas',
    icon: '⛽',
    description: 'Openfort sends 0.00005 ETH — FREE gas',
    bounty: 'Openfort + Arbitrum',
    tech: 'GASLESS',
    needsConfirm: true,
  },
  {
    label: 'Swap ARB → ETH',
    message: 'swap 0.05 ARB for ETH',
    icon: '🔄',
    description: 'Uniswap V3 real swap on Arbitrum',
    bounty: 'Arbitrum Bounty',
    tech: 'Uniswap V3',
    needsConfirm: true,
  },
  {
    label: 'Send to Wallet 3',
    message: 'send 0.5 ARB to Wallet 3',
    icon: '💸',
    description: 'Real Arbitrum transfer between wallets',
    bounty: 'Arbitrum Bounty',
    tech: 'Real TX',
    needsConfirm: true,
  },
  {
    label: 'Cash Out',
    message: 'Cash out $2 to Amazon',
    icon: '🎁',
    description: 'Balance → security → routing → order → payment [NO POPUP]',
    bounty: 'UA Track',
    tech: 'UA 7702',
    needsConfirm: true,
  },
];

const CONFIRM_PHASES = new Set([
  'confirmation',
  'send_confirmation',
  'swap_confirmation',
  'fund_gas_confirmation',
]);

type StepStatus = 'idle' | 'running' | 'awaiting-confirm' | 'completed' | 'error';

export function DemoFlow() {
  const { sendMessage, messages, isSending } = useChat();
  const [statuses, setStatuses] = useState<StepStatus[]>(() =>
    DEMO_STEPS.map(() => 'idle'),
  );
  const [runningAll, setRunningAll] = useState(false);

  // Refs for the auto-confirm watcher (avoids stale closures in useEffect)
  const runningAllRef = useRef(false);
  const activeStepRef = useRef<number | null>(null);
  const lastMsgCountRef = useRef(0);

  // ── Watch messages for confirmation cards and execution results ──
  useEffect(() => {
    if (messages.length === lastMsgCountRef.current) return;
    lastMsgCountRef.current = messages.length;

    const last = messages[messages.length - 1];
    if (!last || last.role !== 'agent' || !last.response) return;
    if (isSending) return; // still loading

    const stepIdx = activeStepRef.current;
    if (stepIdx === null) return;

    const { phase } = last.response;

    // Confirmation card appeared → auto-confirm in Run All mode
    if (CONFIRM_PHASES.has(phase) && runningAllRef.current) {
      setStatuses((prev) => {
        const next = [...prev];
        next[stepIdx] = 'awaiting-confirm';
        return next;
      });

      // Brief delay so judge can read the card, then auto-confirm
      setTimeout(() => {
        void sendMessage('yes');
      }, 2500);
      return;
    }

    // Execution completed (receipt phase)
    if (phase === 'executed') {
      setStatuses((prev) => {
        const next = [...prev];
        next[stepIdx] = 'completed';
        return next;
      });
      activeStepRef.current = null;
      return;
    }

    // Non-confirmation reply (info steps like balance, education)
    if (phase === 'reply' && !CONFIRM_PHASES.has(phase)) {
      const step = DEMO_STEPS[stepIdx];
      if (step && !step.needsConfirm) {
        setStatuses((prev) => {
          const next = [...prev];
          next[stepIdx] = 'completed';
          return next;
        });
        activeStepRef.current = null;
      }
    }
  }, [messages, isSending, sendMessage]);

  // ── Individual step click ──
  const handleStep = useCallback(
    async (index: number) => {
      if (runningAll) return;
      activeStepRef.current = index;
      setStatuses((prev) => {
        const next = [...prev];
        next[index] = 'running';
        return next;
      });

      await sendMessage(DEMO_STEPS[index]!.message);

      // Non-confirm steps complete when the reply arrives
      if (!DEMO_STEPS[index]!.needsConfirm) {
        // sendMessage resolves when response arrives — mark after a tick
        setTimeout(() => {
          setStatuses((prev) => {
            if (prev[index] === 'running') {
              const next = [...prev];
              next[index] = 'completed';
              return next;
            }
            return prev;
          });
          activeStepRef.current = null;
        }, 500);
      }
      // Confirm steps: user manually clicks Confirm on the card
    },
    [sendMessage, runningAll],
  );

  // ── Run All: sequential with real waits ──
  const handleRunAll = useCallback(async () => {
    setRunningAll(true);
    runningAllRef.current = true;

    for (let i = 0; i < DEMO_STEPS.length; i++) {
      activeStepRef.current = i;
      setStatuses((prev) => {
        const next = [...prev];
        next[i] = 'running';
        return next;
      });

      await sendMessage(DEMO_STEPS[i]!.message);

      if (!DEMO_STEPS[i]!.needsConfirm) {
        // Info step — wait for reply to render, then move on
        await waitForMs(2000);
        setStatuses((prev) => {
          const next = [...prev];
          if (next[i] === 'running') next[i] = 'completed';
          return next;
        });
        activeStepRef.current = null;
      } else {
        // Action step — wait until useEffect marks it completed/awaiting-confirm→completed
        await waitForStepDone(i, () => statusesRef.current);
      }

      // Brief pause between steps
      if (i < DEMO_STEPS.length - 1) {
        await waitForMs(1500);
      }
    }

    activeStepRef.current = null;
    setRunningAll(false);
    runningAllRef.current = false;
  }, [sendMessage]);

  // Keep a ref to statuses for the polling helper
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  return (
    <PanelCard title="🎯 Live Demo — 6 Real Steps (click each or Run All)">
      <div className="space-y-2">
        {DEMO_STEPS.map((step, i) => {
          const status = statuses[i]!;
          return (
            <button
              key={i}
              onClick={() => handleStep(i)}
              disabled={runningAll}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${statusClass(status)} ${
                runningAll ? 'cursor-not-allowed opacity-80' : 'active:scale-[0.98]'
              }`}
            >
              <span className="text-sm">{statusIcon(status, step.icon)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--fg)]">
                    {step.label}
                  </span>
                  <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    {step.tech}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    {step.bounty}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--muted)]">
                  {step.description}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400">
                  REAL
                </span>
                {step.needsConfirm && status === 'idle' && (
                  <span className="text-[9px] text-[var(--muted)]">needs confirm</span>
                )}
              </div>
            </button>
          );
        })}

        <button
          onClick={handleRunAll}
          disabled={runningAll}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent)]/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{runningAll ? '⏳' : '▶️'}</span>
          <span>
            {runningAll
              ? 'Running… (auto-confirming)'
              : 'Run All 6 Steps (Auto-Confirm)'}
          </span>
        </button>

        <p className="text-center text-[10px] text-[var(--muted)]">
          {runningAll
            ? '🤖 Auto-confirming each step — sit back and watch the demo!'
            : 'Click steps individually or Run All. Confirmations auto-approve during Run All. Gas is FREE via Openfort.'}
        </p>
      </div>
    </PanelCard>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function statusClass(status: StepStatus): string {
  switch (status) {
    case 'running':
      return 'border-[var(--accent)]/50 bg-[var(--accent)]/10';
    case 'awaiting-confirm':
      return 'border-amber-400/30 bg-amber-400/5';
    case 'completed':
      return 'border-emerald-400/20 bg-emerald-400/5';
    case 'error':
      return 'border-red-400/30 bg-red-400/5';
    default:
      return 'border-[var(--border)]/30 bg-[var(--bg)]/50 hover:border-[var(--border)] hover:bg-[var(--bg)]';
  }
}

function statusIcon(status: StepStatus, fallback: string): string {
  switch (status) {
    case 'running':
      return '⏳';
    case 'awaiting-confirm':
      return '🔐';
    case 'completed':
      return '✅';
    case 'error':
      return '❌';
    default:
      return fallback;
  }
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Polls until the step at `index` is marked completed or error.
 * Used by Run All to wait for action steps (confirm → execute → done).
 */
function waitForStepDone(
  index: number,
  getStatuses: () => StepStatus[],
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const s = getStatuses()[index];
      if (s === 'completed' || s === 'error') {
        resolve();
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
