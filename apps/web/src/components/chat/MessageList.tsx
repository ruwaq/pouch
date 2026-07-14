'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '../../context/chat-context';
import { AgentTurn } from './AgentTurn';
import { Spinner } from '../ui/Spinner';
import { ErrorMessage } from '../ui/ErrorMessage';

export function MessageList() {
  const { messages, isSending, error } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2 text-sm text-white">
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-[var(--border)] bg-white/5 px-4 py-3">
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
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div ref={endRef} />
    </div>
  );
}
