'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '../../context/chat-context';
import { AgentTurn } from './AgentTurn';
import { Spinner } from '../ui/Spinner';
import { AgentErrorBubble } from './AgentErrorBubble';
import { HowItWorks } from '../education/HowItWorks';

export function MessageList() {
  const { messages, isSending, error, errorType } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.length === 0 && !isSending ? <EmptyState /> : null}
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[80%] break-words rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2 text-sm text-white">
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex justify-start">
            <div className="max-w-[80%] break-words rounded-2xl rounded-bl-sm border border-[var(--border)] bg-white/5 px-4 py-3">
              {m.response ? <AgentTurn response={m.response} /> : null}
            </div>
          </div>
        ),
      )}
      {isSending ? (
        <div className="flex justify-start">
          <Spinner label="Pouch is working…" />
        </div>
      ) : null}
      {error ? <AgentErrorBubble message={error} type={errorType} /> : null}
      <div ref={endRef} />
    </div>
  );
}

const SUGGESTIONS = [
  'Cash out $50 to Amazon',
  'Show my balance',
  'Cash out $25 to Uber',
];

function EmptyState() {
  const { sendMessage, isSending } = useChat();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-2">
        <p className="text-lg font-semibold text-[var(--fg)]">
          👋 Welcome to the Pouch Demo
        </p>
        <p className="text-sm text-[var(--muted)] max-w-sm">
          This demo shows how Pouch converts crypto to gift cards — invisibly.
          No wallets, no gas, no chains.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            disabled={isSending}
            onClick={() => void sendMessage(s)}
            className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs text-[var(--muted-2)] transition hover:bg-white/10 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="w-full max-w-xs border-t border-[var(--border)] pt-4">
        <HowItWorks variant="empty-state" />
      </div>
    </div>
  );
}