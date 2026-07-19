'use client';

import { useState } from 'react';
import { useChat } from '../../context/chat-context';

const DEMO_STEPS = [
  {
    label: 'Check Balance',
    message: 'Show my balance',
    icon: '💰',
    description: 'Reads real on-chain balances from Arbitrum via RPC — 4 wallets, $11.37',
    bounty: 'Arbitrum Bounty',
    tech: 'Live RPC',
    autoConfirm: false,
  },
  {
    label: 'Chain Abstraction',
    message: 'What is chain abstraction?',
    icon: '🔮',
    description: 'Particle Network UA + EIP-7702: one balance, any chain, zero new addresses',
    bounty: 'UA Track',
    tech: 'EIP-7702',
    autoConfirm: false,
  },
  {
    label: 'Fund Gas (Openfort)',
    message: 'fund gas',
    icon: '⛽',
    description: 'Openfort sends 0.00005 ETH to your wallet — gas is FREE (sponsored)',
    bounty: 'Openfort + Arbitrum',
    tech: 'GASLESS',
    autoConfirm: true,
    confirmMessage: 'yes',
  },
  {
    label: 'Swap ARB → ETH',
    message: 'swap 0.05 ARB for ETH',
    icon: '🔄',
    description: 'Uniswap V3 on Arbitrum: converts 0.05 ARB to ETH for gas — real on-chain swap',
    bounty: 'Arbitrum Bounty',
    tech: 'Uniswap V3',
    autoConfirm: true,
    confirmMessage: 'yes',
  },
  {
    label: 'Send to Wallet',
    message: 'send 0.1 ARB to Wallet 3',
    icon: '💸',
    description: 'Real Arbitrum transfer between your wallets — verifiable on Arbiscan',
    bounty: 'Arbitrum Bounty',
    tech: 'Real TX',
    autoConfirm: true,
    confirmMessage: 'yes',
  },
  {
    label: 'Cash Out',
    message: 'Cash out $2 to Amazon',
    icon: '🎁',
    description: 'Full flow: balance → security → routing → order → payment [NO POPUP]',
    bounty: 'UA Track',
    tech: 'UA 7702',
    autoConfirm: true,
    confirmMessage: 'yes',
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
      
      // Wait for the response to render
      if (step.autoConfirm) {
        // Give the human time to read the confirmation card (8 seconds)
        await new Promise((r) => setTimeout(r, 8000));
        // Auto-confirm: send "yes" to execute the transaction
        sendMessage(step.confirmMessage ?? 'yes');
        // Give the human time to read the receipt (6 seconds)
        await new Promise((r) => setTimeout(r, 6000));
      } else {
        // Info steps: give time to read (4 seconds)
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    setActiveStep(null);
  };

  return (
    <PanelCard title="🎯 Live Demo — 6 Real Steps (click each or Run All)">
      <div className="space-y-2">
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

        <button
          onClick={handleRunAll}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent)]/90 active:scale-[0.98]"
        >
          <span>▶️</span>
          <span>Run All 6 Steps</span>
        </button>

        <p className="text-[10px] text-[var(--muted)] text-center">
          Steps 3-5 require ETH for gas (~$0.000002 each). Run &ldquo;Fund Gas&rdquo; first to get free ETH from Openfort.
        </p>
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