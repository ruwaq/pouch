'use client';

import { useState } from 'react';
import { useChat } from '../../context/chat-context';
import { useSession } from '../../context/session-context';

export function ChatInput() {
  const { sendMessage, isSending } = useChat();
  const { session } = useSession();
  const [text, setText] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || isSending) return;
    setText('');
    await sendMessage(value, session?.userId);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[var(--border)] p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit(e as unknown as React.FormEvent);
          }
        }}
        rows={1}
        placeholder="Cash out $25 to Amazon…"
        disabled={isSending}
        className="max-h-40 min-h-12 flex-1 resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isSending || !text.trim()}
        className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {isSending ? '…' : 'Send'}
      </button>
    </form>
  );
}
