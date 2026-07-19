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
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [completed, setCompleted] = useState<number[]>([]);

  const handleStep = (index: number) => {
    const step = DEMO_STEPS[index]!;
    setActiveStep(index);
    sendMessage(step.message);
    setCompleted((prev) => (prev.includes(index) ? prev : [...prev, index]));
  };

  const handleRunAll = async () => {
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      setActiveStep(i);
      const step = DEMO_STEPS[i]!;
      sendMessage(step.message);
      setCompleted((prev) => (prev.includes(i) ? prev : [...prev, i]));
      await new Promise((r) => setTimeout(r, 2500));
    }
    setActiveStep(null);
  };

  return (
    <PanelCard title="🎯 Quick Demo — Click to try each technology">
      <div className="space-y-2">
        {/* Steps */}
        {DEMO_STEPS.map((step, i) => (
          <button
            key={i}
            onClick={() => handleStep(i)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
              activeStep === i
                ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
                : completed.includes(i)
                ? 'border-emerald-400/20 bg-emerald-400/5'
                : 'border-[var(--border)]/30 bg-[var(--bg)]/50 hover:border-[var(--border)] hover:bg-[var(--bg)]'
            }`}
          >
            <span className="text-sm">
              {completed.includes(i) ? '✅' : activeStep === i ? '⏳' : step.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--fg)]">{step.label}</span>
                <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                  {step.tech}
                </span>
                <span className="text-[10px] text-[var(--muted)]">{step.bounty}</span>
              </div>
              <p className="text-[10px] text-[var(--muted)]">{step.description}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[var(--muted)]">💬</span>
          </button>
        ))}

        {/* Run All */}
        <button
          onClick={handleRunAll}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent)]/90 active:scale-[0.98]"
        >
          <span>▶️</span>
          <span>Run All 6 Steps</span>
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