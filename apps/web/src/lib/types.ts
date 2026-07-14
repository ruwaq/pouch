import type {
  Balance,
  CashOutIntent,
  CashOutResult,
  Order,
  TraceStep,
} from '@pouch/domain';

// The API merges userId into the Balance response.
export type BalanceResponse = Balance & { userId: string };

export type {
  Balance,
  Order,
  TraceStep,
};

// What we send to /agent/chat.
export interface AgentChatRequest {
  message: string;
  userId?: string;
}

// The auth callback bodies.
export interface AuthCallbackRequest {
  didToken: string;
}
export interface AuthCallbackResponse {
  userId: string;
  evmAddress: string;
}

/**
 * Shape of the /agent/chat success body.
 *
 * NOTE: The canonical `AgentChatResponse` interface lives in the API app
 * (`apps/api/src/services/agent-chat-service.ts`) as
 * `CashOutResult & { intent; reply; trace }`. It is NOT exported from
 * `@pouch/domain`, and the web app does not depend on `@pouch/api`. We mirror
 * that exact shape here, composing the domain types the API itself uses, so
 * the frontend stays typed against the same backend contract without taking a
 * cross-package dependency. If the API's response shape changes, update this.
 */
export interface AgentChatResponse extends CashOutResult {
  intent: CashOutIntent;
  reply: string;
  trace: CashOutResult['trace'];
}
