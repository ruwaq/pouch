import type { CashOutIntent, CashOutResult, Order } from './types';

export interface ReplyInput {
  intent: CashOutIntent;
  result: CashOutResult;
  order: Order | null;
}

/**
 * Composes the agent's chat reply for a completed cash-out. The default
 * (template) implementation lives inline in AgentChatService; an LLM-backed
 * implementation (infra-ai) can be injected for conversational replies.
 * Implementations SHOULD be resilient — never throw; on failure the caller
 * falls back to its template.
 */
export interface ReplyStrategy {
  buildReply(input: ReplyInput): Promise<string>;
}
