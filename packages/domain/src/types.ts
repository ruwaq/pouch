import type { Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { TraceStep } from './trace';

export type UserId = string;
export type ProviderId = string;
export type OffRampCategory = 'giftcard' | 'topup' | 'esim' | 'billpay' | 'bank' | 'card';
export type OrderStatus = 'pending' | 'payment_pending' | 'paid' | 'delivered' | 'failed' | 'refunded';

export interface Amount {
  value: number;
  currency: 'USD';
}

export interface SearchOptions {
  category?: OffRampCategory;
  countryCode?: string;
}

export interface Product {
  id: string;
  providerId: ProviderId;
  name: string;
  category: OffRampCategory;
  brand?: string;
  image?: string;
  denominations?: number[];
  range?: {
    min: number;
    max: number;
    step?: number;
  };
}

export interface Quote {
  providerId: ProviderId;
  productId: string;
  faceValue: Amount;
  paymentAmount: Amount;
  fee?: Amount;
  estimatedDelivery: string;
}

export interface OrderRequest {
  productId: string;
  amount: Amount;
  idempotencyKey: string;
  userId?: UserId;
  recipient?: {
    name?: string;
    email?: string;
  };
}

export interface Order {
  id: string;
  userId?: UserId;
  providerOrderId?: string;
  providerId: ProviderId;
  product: Product;
  faceValue: Amount;
  payment: {
    address?: string;
    amount: Amount;
    chainId: number;
    token: string;
    txHash?: string;
  };
  status: OrderStatus;
  redemption?: {
    code?: string;
    link?: string;
    instructions?: string;
  };
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  eventId: string;
  orderId?: string;
  providerId: ProviderId;
  status: OrderStatus;
  redemption?: Order['redemption'];
  payload: unknown;
}

export interface CashOutIntent {
  action: 'cash_out' | 'check_balance' | 'search_products' | 'off_topic' | 'help' | 'send' | 'swap';
  category: OffRampCategory;
  brand?: string;
  amount: Amount;
  recipient?: {
    name?: string;
    email?: string;
  };
  /** For send/swap action: token symbol (e.g. "ARB", "ETH", "USDC") */
  token?: string;
  /** For send action: destination wallet label (e.g. "Wallet 3") */
  toLabel?: string;
  /** For send action: source wallet label (e.g. "Wallet 1") */
  fromLabel?: string;
  /** For send/swap action: target chain ID (default: settlement chain) */
  chainId?: number;
  /** For swap action: token to receive (e.g. "ETH") */
  targetToken?: string;
}

export interface RoutingDecision {
  quote: Quote;
  consideredProviders: ProviderId[];
}

export interface OffRampProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly categories: readonly OffRampCategory[];

  searchProducts(query: string, options?: SearchOptions): Promise<Result<Product[], DomainError>>;
  getQuote(product: Product, amount: Amount): Promise<Result<Quote, DomainError>>;
  createOrder(request: OrderRequest): Promise<Result<Order, DomainError>>;
  getOrderStatus(orderId: string): Promise<Result<OrderStatus, DomainError>>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<Result<WebhookEvent, DomainError>>;
}

export interface BalanceAsset {
  chainId: number;
  symbol: string;
  amount: number;
  usdValue: number;
  /** Human-readable wallet label (e.g. "Wallet 1", "Wallet 2") for multi-wallet demos. */
  walletLabel?: string;
}

export interface Balance {
  total: number;
  assets: BalanceAsset[];
  requiresConsolidation: boolean;
}

export interface TxResult {
  txHash: string;
  chainId?: number;
  blockNumber?: number;
  gasUsed?: string;
  gasCostUsd?: number;
  explorerUrl?: string;
}

export interface SendPaymentParams {
  from: UserId;
  to: string;
  amount: Amount;
  chainId: number;
  token: string;
}

/** Detailed receipt for a wallet-to-wallet transfer shown in the chat UI. */
export interface SendReceipt {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  gasCostUsd?: number;
  fromAddress: string;
  fromLabel: string;
  toAddress: string;
  toLabel: string;
  amount: Amount;
  token: string;
  chainId: number;
  explorerUrl?: string;
  /** Whether gas was sponsored by Openfort */
  gasSponsored: boolean;
}

/** Parsed intent for wallet-to-wallet send operations. */
export interface SendIntent {
  action: 'send';
  fromLabel?: string;
  toLabel: string;
  amount: Amount;
  token: string;
  chainId: number;
}

/** Result of a token swap (e.g. ARB → ETH via Uniswap). */
export interface SwapResult {
  txHash: string;
  chainId: number;
  blockNumber?: number;
  /** Token sold (e.g. "ARB") */
  tokenIn: string;
  /** Amount sold */
  amountIn: number;
  /** Token received (e.g. "ETH") */
  tokenOut: string;
  /** Amount received */
  amountOut: number;
  /** Gas used for the swap */
  gasUsed?: string;
  gasCostUsd?: number;
  explorerUrl?: string;
  /** Source wallet label */
  walletLabel: string;
  /** Whether gas was sponsored by Openfort (true for agent-backed swaps) */
  gasSponsored?: boolean;
}

/** Receipt for a gas funding operation (Openfort sendEth). */
export interface FundGasReceipt {
  txHash: string;
  chainId: number;
  blockNumber?: number;
  /** Amount of ETH sent for gas */
  amountEth: number;
  /** Source wallet label (e.g. "Openfort Backend") */
  fromLabel: string;
  /** Source wallet address */
  fromAddress: string;
  /** Destination wallet label */
  toLabel: string;
  /** Destination wallet address */
  toAddress: string;
  /** Whether gas was sponsored by Openfort */
  gasSponsored: boolean;
  /** Block explorer URL for the transaction */
  explorerUrl?: string;
}

export interface AccountProvider {
  getUnifiedBalance(userId: UserId): Promise<Result<Balance, DomainError>>;
  consolidate(userId: UserId, targetChainId: number, targetToken: string): Promise<Result<TxResult, DomainError>>;
  sendPayment(params: SendPaymentParams): Promise<Result<TxResult, DomainError>>;
}

/** A gasless signer the agent uses to settle an order payment server-side. */
export interface AgentWalletPort {
  /** The agent wallet's address (where UA funds are sent before settlement). */
  getAddress(): Promise<Result<{ address: string }, DomainError>>;

  /** Send an ERC-20 `amount` of `token` to `to` on `chainId`, gas-sponsored. */
  settlePayment(params: {
    to: string;
    amount: Amount;
    token: string;
    chainId: number;
  }): Promise<Result<TxResult, DomainError>>;

  /** Human label for the trace badge, e.g. "Openfort gasless". */
  readonly label: string;
}

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string, userId?: UserId): Promise<Order | null>;
  findByProviderOrderId(providerId: string, providerOrderId: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus, updates?: Partial<Order>): Promise<void>;
}

export interface LoggerPort {
  info(bindings: unknown, message?: string): void;
  error(bindings: unknown, message?: string): void;
}

export interface CashOutResult {
  orderId: string;
  status: Extract<OrderStatus, 'payment_pending' | 'delivered'>;
  trace: TraceStep[];
  securityVerdict?: SecurityResult | undefined;
}

// ── Security types ─────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Verdict = 'ALLOW' | 'WARN' | 'BLOCK';

export interface SecurityCheck {
  /** Human-readable name of the check, e.g. "Amount limit" */
  name: string;
  /** Whether the check passed (true = safe, false = triggered) */
  passed: boolean;
  /** The verdict for this individual check */
  verdict: Verdict;
  /** Human-readable explanation of the result */
  detail: string;
  /** 0-100 contribution to the total risk score */
  riskContribution: number;
}

export interface SecurityResult {
  /** Aggregate risk score 0-100 */
  riskScore: number;
  /** Aggregate risk level */
  riskLevel: RiskLevel;
  /** Aggregate verdict (worst of all checks) */
  verdict: Verdict;
  /** Individual check results */
  checks: SecurityCheck[];
  /** Unix timestamp of when the check was performed */
  timestamp: number;
}

export interface SpendingPolicy {
  /** Amounts above this trigger a WARN (default: $200) */
  warnAboveAmount: number;
  /** Amounts above this trigger a BLOCK (default: $500) */
  blockAboveAmount: number;
  /** If set, only these categories are allowed */
  allowedCategories?: string[];
  /** If set, these categories are always blocked */
  blockedCategories?: string[];
  /** Amounts above this always require explicit confirmation (default: $100) */
  requireConfirmationAbove: number;
  /** Whether the policy is active */
  active: boolean;
}

export interface SecurityPolicyPort {
  getPolicy(userId: UserId): Promise<Result<SpendingPolicy, DomainError>>;
  /** Optional: for natural-language policy updates */
  setPolicy?(userId: UserId, policy: Partial<SpendingPolicy>): Promise<Result<SpendingPolicy, DomainError>>;
}
