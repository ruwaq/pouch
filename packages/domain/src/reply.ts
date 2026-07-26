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
  | 'send'           // wallet-to-wallet transfer: list available wallets
  | 'send_confirmation' // wallet-to-wallet transfer confirmation
  | 'swap_confirmation' // token swap confirmation (ARB → ETH)
  | 'fund_gas_confirmation' // gas funding confirmation (Openfort → wallet)
  | 'fallback';      // unknown intent / unhandled action

/**
 * Live, real wallet context injected per turn so the LLM can ground specific
 * answers ("You have 113 ARB in Wallet 1 on Arbitrum") instead of generic ones.
 * Populated by the chat service from the real account provider + an in-memory
 * transaction log. Privacy invariant: only wallet labels and TRUNCATED addresses
 * are sent to the LLM — never full keys or full addresses.
 */
export interface LiveWalletContext {
  /** Total USD across all assets (sum of asset.usdValue). */
  totalUsd: number;
  /** Per-asset breakdown. */
  assets: Array<{
    symbol: string;
    chainId: number;
    amount: number;
    usdValue: number;
    walletLabel?: string;
  }>;
  /** Wallets available this session: labels + TRUNCATED addresses only. */
  wallets: Array<{ label: string; addressTruncated: string }>;
  /**
   * The user's last few real transactions. OMITTED entirely (undefined) when the
   * log is empty — never rendered as "no history".
   */
  recentTransactions?: Array<{
    type: 'send' | 'swap' | 'fund_gas' | 'cash_out';
    amount: number;
    token?: string;
    chainId: number;
    txHash: string;
    timestamp: string;
  }>;
  /** Active technologies/bounties the agent may reference. */
  technologies: string[];
}

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
  /** Live, real wallet context (optional; set by the chat service per turn). */
  liveContext?: LiveWalletContext;
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