'use client';

import { useState } from 'react';
import { useChat } from '../../context/chat-context';

interface Tech {
  id: string;
  name: string;
  icon: string;
  status: 'active' | 'configured';
  description: string;
  whatItDoes: string;
  tech: string[];
  demoMessage: string;
}

const TECH_STACK: Tech[] = [
  {
    id: 'particle',
    name: 'Particle Network',
    icon: '🔮',
    status: 'active',
    description: 'Universal Accounts with EIP-7702 chain abstraction. Your EOA becomes a smart account — one balance, any chain, zero new addresses.',
    whatItDoes: 'Scans all chains, consolidates balances, executes cross-chain transactions invisibly.',
    tech: ['EIP-7702', 'UniversalAccount', 'getPrimaryAssets()', 'createConvertTransaction()'],
    demoMessage: 'What is chain abstraction?',
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum One',
    icon: '🔷',
    status: 'active',
    description: 'Settlement chain. All transactions settle on Arbitrum. Real on-chain balance from Arbitrum mainnet.',
    whatItDoes: 'Powers the backend settlement. Balance shown is live from Arbitrum RPC.',
    tech: ['Settlement Chain', 'Live Balance', 'RPC', 'ARB Token'],
    demoMessage: 'Show my balance',
  },
  {
    id: 'magic',
    name: 'Magic Labs',
    icon: '🪄',
    status: 'active',
    description: 'Embedded wallets with blind signatures. Email login, zero popups, no MetaMask needed. Configured for Arbitrum.',
    whatItDoes: 'User signs in once with email. Every transaction after that happens without a single wallet confirmation. EVM extension on Arbitrum One.',
    tech: ['Blind Signatures', 'Embedded Wallet', 'Email Login', 'NO POPUP'],
    demoMessage: 'How do blind signatures work?',
  },
  {
    id: 'openfort',
    name: 'Openfort',
    icon: '⛽',
    status: 'active',
    description: 'Agent backend wallet + gas sponsorship. User never pays gas fees. Send ETH to wallets for free.',
    whatItDoes: 'All blockchain gas fees are sponsored. Fund gas sends free ETH to your wallet. Policy: pay_for_user on Arbitrum + Base.',
    tech: ['Gas Sponsorship', 'Agent Wallet', 'pay_for_user', 'sendEth()'],
    demoMessage: 'fund gas',
  },
  {
    id: 'gemini',
    name: 'Gemini 3.6 Flash',
    icon: '🤖',
    status: 'active',
    description: 'Conversational AI for natural language understanding. Multi-turn confirmation flow.',
    whatItDoes: 'Understands what you want in plain English or Spanish. Asks for confirmation before executing.',
    tech: ['Function Calling', 'Multi-turn', 'Bilingual', 'REST API'],
    demoMessage: 'How does this work?',
  },
  {
    id: 'security',
    name: 'Security Firewall',
    icon: '🛡️',
    status: 'active',
    description: 'Pre-execution deterministic checks. Amount limits, category allowlists, risk scoring 0-100.',
    whatItDoes: 'Blocks transactions over $500, warns over $200, confirms over $100. All checks run before any on-chain action.',
    tech: ['Risk Scoring', 'Amount Limits', 'Category Allowlist', 'SHIELD'],
    demoMessage: 'Is it safe?',
  },
];

export function BountyPanel() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { sendMessage } = useChat();

  const handleDemo = (message: string) => {
    sendMessage(message);
  };

  return (
    <PanelCard title="⚡ Tech Stack — What Powers Pouch">
      <div className="space-y-3">
        {TECH_STACK.map((tech) => (
          <div
            key={tech.id}
            className={`rounded-lg border transition-all ${
              expanded === tech.id
                ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5'
                : 'border-[var(--border)]/50 bg-[var(--bg)] hover:border-[var(--border)]'
            }`}
          >
            <button
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              onClick={() => setExpanded(expanded === tech.id ? null : tech.id)}
            >
              <span className="text-base">{tech.icon}</span>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-[var(--fg)]">{tech.name}</span>
              </div>
              <StatusDot status={tech.status} />
              <span className="text-[10px] text-[var(--muted)]">
                {expanded === tech.id ? '▾' : '▸'}
              </span>
            </button>

            {expanded === tech.id && (
              <div className="border-t border-[var(--border)]/50 px-3 py-3 space-y-3">
                <p className="text-[11px] leading-relaxed text-[var(--muted)]">{tech.description}</p>

                <div className="rounded-lg bg-[var(--accent)]/5 px-3 py-2">
                  <span className="text-[10px] font-semibold text-[var(--accent)]">What it does in Pouch:</span>
                  <p className="mt-1 text-[11px] text-[var(--fg)]">{tech.whatItDoes}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {tech.tech.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[var(--border)]/50 bg-[var(--bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleDemo(tech.demoMessage)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 active:scale-[0.98]"
                >
                  <span>💬</span>
                  <span>Try it: &ldquo;{tech.demoMessage}&rdquo;</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

function StatusDot({ status }: { status: Tech['status'] }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-400',
    configured: 'bg-amber-400',
  };
  const labels: Record<string, string> = {
    active: 'Live',
    configured: 'Ready',
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