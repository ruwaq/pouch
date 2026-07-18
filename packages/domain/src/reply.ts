import type { BalanceAsset, CashOutIntent, CashOutResult, Order, Product } from './types';

/** All the conversational scenarios the agent can respond to. */
export type ReplyScenario =
  | 'greeting'       // off_topic: user said hello, thanks, help
  | 'balance'        // balance check result
  | 'search'         // product search results
  | 'confirmation'   // "I'm ready to cash out $X. Confirm?"
  | 'success'        // cash-out completed successfully
  | 'cancelled'      // user cancelled the pending cash-out
  | 'insufficient'   // not enough balance for the requested amount
  | 'error'          // generic or provider error
  | 'help'           // educational: how it works, chain abstraction, security, fees
  | 'fallback';      // unknown intent / unhandled action

/**
 * Context passed to the ReplyStrategy so it can compose a natural-language
 * response for any scenario. Only the fields relevant to the scenario are set.
 */
export interface ReplyContext {
  intent: CashOutIntent;
  scenario: ReplyScenario;
  /** Balance data (set for 'balance' and 'insufficient' scenarios). */
  balance?: { total: number; assets: BalanceAsset[] };
  /** Product search results (set for 'search' scenario). */
  products?: Product[];
  /** The persisted order (set for 'success' scenario). */
  order?: Order | null;
  /** Execution result (set for 'success' scenario). */
  result?: CashOutResult;
  /** Error message (set for 'error' scenario). */
  error?: string;
  /** Summary of the planned cash-out (set for 'confirmation' scenario). */
  planSummary?: string;
  /** Help topic the user asked about (set for 'help' scenario). */
  topic?: string;
  /**
   * Recent conversation history for context-aware replies.
   * Most recent message is last. Max 10 entries.
   */
  history?: Array<{ role: 'user' | 'agent'; content: string }>;
}

/**
 * Composes the agent's conversational reply for any scenario.
 * The default (template) implementation lives inline in AgentChatService;
 * an LLM-backed implementation (infra-ai) can be injected for natural replies.
 * Implementations SHOULD be resilient — never throw; on failure the caller
 * falls back to its template.
 */
export interface ReplyStrategy {
  buildReply(context: ReplyContext): Promise<string>;
}