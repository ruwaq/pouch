'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AgentChatResponse } from '../lib/types';
import { apiPost, ApiError } from '../lib/api-client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  // user messages have text; agent messages carry the full response.
  text?: string;
  response?: AgentChatResponse;
}

interface ChatContextValue {
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  sendMessage: (text: string, userId?: string) => Promise<void>;
  clearError: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Exported for testing (pure).
export async function sendChatMessage(message: string, userId?: string): Promise<AgentChatResponse> {
  const body = userId ? { message, userId } : { message };
  return apiPost<AgentChatResponse>('/agent/chat', body);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string, userId?: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      setError(null);
      setIsSending(true);
      setMessages((prev) => [...prev, { id: newId(), role: 'user', text: trimmed }]);

      try {
        const response = await sendChatMessage(trimmed, userId);
        setMessages((prev) => [...prev, { id: newId(), role: 'agent', response }]);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
        setError(message);
      } finally {
        setIsSending(false);
      }
    },
    [isSending],
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<ChatContextValue>(
    () => ({ messages, isSending, error, sendMessage, clearError }),
    [messages, isSending, error, sendMessage, clearError],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within <ChatProvider>');
  return ctx;
}
