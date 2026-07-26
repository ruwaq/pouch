'use client';

import { TechBadge } from '../education/TechBadge';

const TECH_STACK = [
  {
    name: 'Particle Network',
    role: 'Universal Accounts + EIP-7702',
    badge: 'UA 7702' as const,
    description: 'Delegates EOAs to a Universal Account. Scans all chains, consolidates balances invisibly. EIP-7702 enables smart contract capabilities without changing your wallet address.',
  },
  {
    name: 'Magic Labs',
    role: 'Blind Signatures',
    badge: 'NO POPUP' as const,
    description: 'Email-based login. Signs transactions behind the scenes without wallet popups. The user never sees a confirmation screen.',
  },
  {
    name: 'Openfort',
    role: 'Gas Sponsorship',
    badge: 'NO POPUP' as const,
    description: 'Agent backend wallet pays all gas fees. The user never pays gas. Part of the invisible experience.',
  },
  {
    name: 'Gemini 3.6 Flash',
    role: 'Conversational AI',
    badge: undefined,
    description: 'Natural language understanding. Multi-turn confirmation flow. Educational responses about chain abstraction.',
  },
  {
    name: 'Security Firewall',
    role: 'Pre-execution Checks',
    badge: 'SHIELD' as const,
    description: 'Deterministic checks before every transaction. Amount limits, category allowlists, provider verification. Risk scoring 0-100.',
  },
];

const CHAIN_INFO = [
  { chainId: 42161, name: 'Arbitrum One', role: 'Settlement chain', status: 'active' as const },
  { chainId: 8453, name: 'Base', role: 'Fallback settlement', status: 'ready' as const },
  { chainId: 1, name: 'Ethereum', role: 'EIP-7702 delegation', status: 'ready' as const },
];

export function ChainPanel() {
  return (
    <PanelCard title="⛓️ Chain Abstraction — How It Works">
      <div className="space-y-4">
        {/* Chain overview */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Supported Chains
          </span>
          <div className="mt-2 space-y-1">
            {CHAIN_INFO.map((chain) => (
              <div key={chain.chainId} className="flex items-center justify-between rounded border border-[var(--border)]/50 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    chain.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`} />
                  <span className="text-xs text-[var(--fg)]">{chain.name}</span>
                </div>
                <span className="text-[10px] text-[var(--muted)]">{chain.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tech stack */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Tech Stack
          </span>
          <div className="mt-2 space-y-2">
            {TECH_STACK.map((tech) => (
              <div key={tech.name} className="rounded-lg border border-[var(--border)]/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--fg)]">{tech.name}</span>
                  {tech.badge && <TechBadge badge={tech.badge} />}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{tech.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* EIP-7702 Callout */}
        <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔮</span>
            <span className="text-xs font-semibold text-violet-300">EIP-7702 Chain Abstraction</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
            Your wallet (EOA) delegates its authority to Particle&apos;s Universal Account via EIP-7702.
            The UA scans all chains, finds your funds, consolidates them, and executes the cash-out —
            all without a single wallet popup. This is what makes Pouch different from every other crypto wallet.
          </p>
        </div>
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