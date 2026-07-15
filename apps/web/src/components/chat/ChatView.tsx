'use client';

import { ChatProvider, useChat } from '../../context/chat-context';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { BalancePill } from './BalancePill';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function ChatView() {
  const { session, logout } = useSession();

  return (
    <ChatProvider>
      <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-0 sm:px-4">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="text-sm font-bold tracking-tight text-[var(--fg)]">Pouch</span>
            <BalancePill />
            <ZeroPopupBadge />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {session?.evmAddress ? (
              <span className="hidden text-xs text-[var(--muted)] sm:inline">
                {session.userId === 'demo-user' ? 'Demo' : `${session.evmAddress.slice(0, 6)}…${session.evmAddress.slice(-4)}`}
              </span>
            ) : null}
            <Button variant="ghost" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </header>

        {session?.userId === 'demo-user' || !session ? (
          <div className="border-b border-[var(--accent)]/20 bg-[var(--accent)]/5 px-4 py-2 text-center text-xs text-[var(--muted-2)]">
            Demo session — no login required. Balances are simulated.
          </div>
        ) : null}

        <MessageList />
        <ChatInput />
      </main>
    </ChatProvider>
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
    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
      {count} signature{count === 1 ? '' : 's'} · zero popups
    </span>
  );
}
