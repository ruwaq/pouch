'use client';

import { ChatProvider } from '../../context/chat-context';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { TechBadge } from '../education/TechBadge';
import { BalancePill } from '../chat/BalancePill';
import { MessageList } from '../chat/MessageList';
import { ChatInput } from '../chat/ChatInput';
import { WalletPanel } from './WalletPanel';
import { LiveTracePanel } from './LiveTracePanel';
import { ChainPanel } from './ChainPanel';
import { BountyPanel } from './BountyPanel';
import { DemoFlow } from './DemoFlow';
import { useChat } from '../../context/chat-context';

export function DashboardLayout() {
  const { session, logout } = useSession();

  return (
    <ChatProvider>
      <div className="flex h-dvh w-full overflow-hidden">
        {/* ── LEFT: Chat ─────────────────────────────────────────── */}
        <div className="flex w-full max-w-[420px] shrink-0 flex-col border-r border-[var(--border)] sm:max-w-[480px]">
          <Header session={session} onLogout={() => void logout()} />
          {session?.userId === 'demo-user' || !session ? (
            <div className="border-b border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2 text-center text-xs text-[var(--muted-2)]">
              Demo session — balances are real. Trace steps explain how Pouch works.
            </div>
          ) : null}
          <div className="flex flex-1 flex-col overflow-hidden">
            <MessageList />
            <ChatInput />
          </div>
        </div>

        {/* ── RIGHT: Live Dashboard ───────────────────────────────── */}
        <div className="hidden flex-1 flex-col gap-3 overflow-y-auto bg-[var(--bg)] p-4 md:flex">
          <DashboardTitle />
          <DemoFlow />
          <WalletPanel />
          <LiveTracePanel />
          <BountyPanel />
          <ChainPanel />
        </div>
      </div>
    </ChatProvider>
  );
}

function Header({ session, onLogout }: { session: { userId: string; evmAddress: string } | null; onLogout: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-bold tracking-tight text-[var(--fg)]">Pouch</span>
        <BalancePill />
        <ZeroPopupBadge />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {session?.evmAddress ? (
          <span className="hidden text-xs text-[var(--muted)] sm:inline">
            {session.userId === 'demo-user' ? 'Demo' : `${session.evmAddress.slice(0, 6)}…${session.evmAddress.slice(-4)}`}
          </span>
        ) : null}
        <Button variant="ghost" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}

function DashboardTitle() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-3">
      <span className="text-lg">⚡</span>
      <div>
        <h2 className="text-sm font-semibold text-[var(--fg)]">Live Dashboard</h2>
        <p className="text-xs text-[var(--muted)]">
          Particle Network · EIP-7702 · Chain Abstraction · Openfort Gasless
        </p>
      </div>
    </div>
  );
}

function ZeroPopupBadge() {
  const { messages } = useChat();
  const count = messages.reduce(
    (n, m) => n + (m.response?.trace.filter((s) => s.badge === 'NO POPUP').length ?? 0),
    0,
  );
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
      {count} signature{count === 1 ? '' : 's'} · <TechBadge badge="NO POPUP" />
    </span>
  );
}