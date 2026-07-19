'use client';

import { useState } from 'react';
import { useChat } from '../../context/chat-context';

const DEMO_STEPS = [
  {
    label: 'Check Balance',
    message: 'Show my balance',
    icon: '💰',
    description: 'Reads real on-chain balances from Arbitrum + Avalanche via RPC',
    bounty: 'Arbitrum Bounty',
    tech: 'Real Balance',
  },
  {
    label: 'Chain Abstraction',
    message: 'What is chain abstraction?',
    icon: '🔮',
    description: 'Explains Particle Network Universal Accounts + EIP-7702',
    bounty: 'UA Track',
    tech: 'EIP-7702',
  },
  {
    label: 'Zero Popups',
    message: 'How do blind signatures work?',
    icon: '🪄',
    description: 'Magic Labs embedded wallet — sign in once, never see a popup again',
    bounty: 'Magic Labs Bonus',
    tech: 'NO POPUP',
  },
  {
    label: 'Gas Sponsorship',
    message: 'What are the fees?',
    icon: '⛽',
    description: 'Openfort pays all gas fees. User never pays gas.',
    bounty: 'Openfort Subtrack',
    tech: 'Gasless',
  },
  {
    label: 'Security Firewall',
    message: 'Is it safe?',
    icon: '🛡️',
    description: 'Pre-execution checks: amount limits, category allowlists, risk scoring',
    bounty: 'All Bounties',
    tech: 'SHIELD',
  },
  {
    label: 'Cash Out',
    message: 'Cash out $5 to Amazon',
    icon: '🎁',
    description: 'Full flow: balance → security → routing → order → payment [NO POPUP]',
    bounty: 'UA Track',
    tech: 'UA 7702',
  },
];

export function DemoFlow() {
  const { sendMessage } = useChat();
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [completed, setCompleted] = useState<number[]>([]);

  const runDemo = async () => {
    setRunning(true);
    setCompleted([]);
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      const step = DEMO_STEPS[i]!;
      setCurrentStep(i);
      sendMessage(step.message);
      setCompleted((prev) => [...prev, i]);
      // Wait between steps
      await new Promise((r) => setTimeout(r, 2500));
    }
    setCurrentStep(-1);
    setRunning(false);
  };

  return (
    <PanelCard title="🚀 Demo Flow — Show All Tech">
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Click to auto-run a complete demo showing every technology behind Pouch. Each step sends a message to the chat and the trace panel updates in real-time.
        </p>

        {/* Steps */}
        <div className="space-y-1.5">
          {DEMO_STEPS.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${
                currentStep === i
                  ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
                  : completed.includes(i)
                  ? 'border-emerald-400/20 bg-emerald-400/5'
                  : 'border-[var(--border)]/30 bg-[var(--bg)]/50'
              }`}
            >
              <span className="text-sm">{completed.includes(i) ? '✅' : currentStep === i ? '⏳' : step.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--fg)]">{step.label}</span>
                  <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    {step.tech}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--muted)]">{step.description}</p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]/70">
                  Bounty: {step.bounty} · 💬 &ldquo;{step.message}&rdquo;
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Run button */}
        <button
          onClick={runDemo}
          disabled={running}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
            running
              ? 'bg-[var(--border)]/30 text-[var(--muted)] cursor-not-allowed'
              : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90'
          }`}
        >
          {running ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>Running demo... Step {currentStep + 1}/{DEMO_STEPS.length}</span>
            </>
          ) : (
            <>
              <span>▶️</span>
              <span>Run Full Demo ({DEMO_STEPS.length} steps)</span>
            </>
          )}
        </button>
      </div>
    </PanelCard>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{title}</h3>
      {children}
    </div>
  );
}