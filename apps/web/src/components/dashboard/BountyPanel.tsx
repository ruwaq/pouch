'use client';

import { useState } from 'react';
import { useChat } from '../../context/chat-context';

interface Bounty {
  id: string;
  name: string;
  prize: string;
  icon: string;
  status: 'active' | 'configured' | 'pending';
  description: string;
  tech: string[];
  demoMessage: string;
}

const BOUNTIES: Bounty[] = [
  {
    id: 'particle',
    name: 'Universal Accounts Track',
    prize: '$2,500',
    icon: '🔮',
    status: 'active',
    description: 'Particle Network EIP-7702 chain abstraction. Your wallet becomes a Universal Account — one balance, any chain, zero popups.',
    tech: ['EIP-7702', 'UniversalAccount', 'getPrimaryAssets()', 'createConvertTransaction()'],
    demoMessage: 'Show my balance',
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum Bounty',
    prize: '$2,000',
    icon: '🔷',
    status: 'active',
    description: 'Arbitrum One as settlement chain. All transactions settle on Arbitrum. Real on-chain balance from Arbitrum mainnet.',
    tech: ['Settlement Chain', 'Real Balance', 'Arbitrum RPC', 'USDC/ARB'],
    demoMessage: 'What chains do you support?',
  },
  {
    id: 'magic',
    name: 'Magic Labs Bonus',
    prize: '$500',
    icon: '🪄',
    status: 'configured',
    description: 'Blind signatures for zero-popup UX. Email login, embedded wallet, no MetaMask needed.',
    tech: ['Blind Signatures', 'Embedded Wallet', 'Email Login', 'NO POPUP'],
    demoMessage: 'How do blind signatures work?',
  },
  {
    id: 'openfort',
    name: 'Openfort Subtrack',
    prize: '$100',
    icon: '⛽',
    status: 'configured',
    description: 'Agent backend wallet + gas sponsorship. User never pays gas. All fees sponsored by Openfort.',
    tech: ['Gas Sponsorship', 'Agent Wallet', 'pay_for_user', 'Backend Signing'],
    demoMessage: 'What are the fees?',
  },
];

export function BountyPanel() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { sendMessage } = useChat();

  const handleDemo = (message: string) => {
    sendMessage(message);
  };

  return (
    <PanelCard title="🏆 Bounties & Tech Stack">
      <div className="space-y-3">
        {/* Bounty cards */}
        {BOUNTIES.map((bounty) => (
          <div
            key={bounty.id}
            className={`rounded-lg border transition-all ${
              expanded === bounty.id
                ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                : 'border-[var(--border)]/50 bg-[var(--bg)] hover:border-[var(--border)]'
            }`}
          >
            {/* Header */}
            <button
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              onClick={() => setExpanded(expanded === bounty.id ? null : bounty.id)}
            >
              <span className="text-base">{bounty.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--fg)]">{bounty.name}</span>
                  <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                    {bounty.prize}
                  </span>
                </div>
              </div>
              <StatusDot status={bounty.status} />
              <span className="text-[10px] text-[var(--muted)]">
                {expanded === bounty.id ? '▾' : '▸'}
              </span>
            </button>

            {/* Expanded content */}
            {expanded === bounty.id && (
              <div className="border-t border-[var(--border)]/50 px-3 py-3 space-y-3">
                <p className="text-[11px] leading-relaxed text-[var(--muted)]">{bounty.description}</p>

                {/* Tech badges */}
                <div className="flex flex-wrap gap-1.5">
                  {bounty.tech.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[var(--border)]/50 bg-[var(--bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Demo button */}
                <button
                  onClick={() => handleDemo(bounty.demoMessage)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 active:scale-[0.98]"
                >
                  <span>💬</span>
                  <span>Demo: &ldquo;{bounty.demoMessage}&rdquo;</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Total potential */}
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-300">Total Potential</span>
            <span className="text-sm font-bold text-emerald-300">$5,100</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="text-[10px] text-emerald-400/70">UA Track $2,500</span>
            <span className="text-[10px] text-emerald-400/50">+</span>
            <span className="text-[10px] text-emerald-400/70">Arbitrum $2,000</span>
            <span className="text-[10px] text-emerald-400/50">+</span>
            <span className="text-[10px] text-emerald-400/70">Magic $500</span>
            <span className="text-[10px] text-emerald-400/50">+</span>
            <span className="text-[10px] text-emerald-400/70">Openfort $100</span>
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

function StatusDot({ status }: { status: Bounty['status'] }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-400',
    configured: 'bg-amber-400',
    pending: 'bg-[var(--border)]',
  };
  const labels: Record<string, string> = {
    active: 'Live',
    configured: 'Ready',
    pending: 'Pending',
  };
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="hidden sm:inline">{labels[status]}</span>
    </span>
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