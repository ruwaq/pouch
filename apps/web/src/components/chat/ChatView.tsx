'use client';

import { ChatProvider } from '../../context/chat-context';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { BalancePill } from './BalancePill';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function ChatView() {
  const { session, logout } = useSession();

  return (
    <ChatProvider>
      <main className="mx-auto flex h-dvh max-w-2xl flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-tight text-[var(--fg)]">Pouch</span>
            <BalancePill />
          </div>
          <div className="flex items-center gap-3">
            {session?.evmAddress ? (
              <span className="hidden text-xs text-[var(--muted)] sm:inline">
                {session.evmAddress.slice(0, 6)}…{session.evmAddress.slice(-4)}
              </span>
            ) : null}
            <Button variant="ghost" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </header>

        <MessageList />
        <ChatInput />
      </main>
    </ChatProvider>
  );
}
