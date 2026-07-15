import type { CashOutExecutor, CashOutIntent, CashOutResult, DomainError, IntentParserStrategy, OffRampProvider, Order, OrderRepository, ReplyStrategy } from '@pouch/domain';
import { isOk, ok, type Result } from '@pouch/shared';
import type { BalanceServiceLike } from './balance-service';

export interface AgentChatResponse extends CashOutResult {
  intent: CashOutIntent;
  reply: string;
  trace: CashOutResult['trace'];
}

export interface AgentChatServiceLike {
  handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>>;
}

// ── Conversation state (in-memory per user) ──────────────────────────

interface PendingCashOut {
  intent: CashOutIntent;
  /** The plan text Gemini showed the user, so we can show it again on confirm. */
  planSummary: string;
}

const pendingConfirmations = new Map<string, PendingCashOut>();

// ── Helpers ──────────────────────────────────────────────────────────

function toDisplayBrand(brand: string | undefined): string {
  if (!brand) return 'your selected product';
  return brand
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

// ── AgentChatService (conversational, multi-turn) ────────────────────

export class AgentChatService implements AgentChatServiceLike {
  constructor(
    private readonly parser: IntentParserStrategy,
    private readonly executor: CashOutExecutor,
    private readonly orders: OrderRepository,
    private readonly balanceService: BalanceServiceLike,
    private readonly providers: readonly OffRampProvider[],
    private readonly replyStrategy?: ReplyStrategy,
  ) {}

  async handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>> {
    const trimmed = message.trim().toLowerCase();

    // ── Check for pending confirmation ──────────────────────────────
    const pending = pendingConfirmations.get(userId);
    if (pending) {
      if (trimmed === 'yes' || trimmed === 'ok' || trimmed === 'do it' || trimmed === 'confirm' || trimmed === 'sí' || trimmed === 'si') {
        pendingConfirmations.delete(userId);
        return this.executeCashOut(pending.intent, userId);
      }
      if (trimmed === 'no' || trimmed === 'cancel' || trimmed === 'never mind') {
        pendingConfirmations.delete(userId);
        const reply = await this.composeReply(
          pending.intent,
          { orderId: '', status: 'payment_pending', trace: [] },
          null,
          { cancelled: true },
        );
        return this.emptyResult(pending.intent, reply);
      }
      // User said something else — treat as a new intent, clear pending.
      pendingConfirmations.delete(userId);
    }

    // ── Call Gemini with tools ──────────────────────────────────────
    const intent = await this.parser.parse(message);

    if (!isOk(intent)) {
      return intent;
    }

    const i = intent.value;

    // ── Handle different tool calls ─────────────────────────────────
    if (i.action === 'check_balance') {
      return this.handleBalanceCheck(userId);
    }

    if (i.action === 'search_products') {
      return this.handleProductSearch(userId, i);
    }

    if (i.action === 'cash_out') {
      return this.handleCashOutPlan(userId, i);
    }

    // Shouldn't happen — return as a generic reply
    return this.emptyResultWithReply(
      { action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
      "I can help you cash out crypto. Try saying something like \"Cash out $50 to Amazon\" or \"Show my balance\".",
    );
  }

  // ── Tool handlers ─────────────────────────────────────────────────

  private async handleBalanceCheck(userId: string): Promise<Result<AgentChatResponse, DomainError>> {
    const result = await this.balanceService.getBalance(userId);
    if (!isOk(result)) return result;

    const b = result.value;
    const lines = b.assets.map(
      (a) => `  ${a.symbol} on chain ${a.chainId}: $${a.usdValue.toFixed(2)}`,
    );
    const reply = `You have $${b.total.toFixed(2)} across ${b.assets.length} asset${b.assets.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;

    return this.emptyResult(
      { action: 'check_balance', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
      reply,
    );
  }

  private async handleProductSearch(userId: string, intent: CashOutIntent): Promise<Result<AgentChatResponse, DomainError>> {
    const provider = this.providers[0];
    if (!provider) {
      return this.emptyResultWithReply(intent, "I don't have any providers available right now.");
    }

    const products = await provider.searchProducts(intent.brand ?? '', { category: intent.category });
    if (!isOk(products) || products.value.length === 0) {
      return this.emptyResultWithReply(intent, `I couldn't find any ${intent.category} products${intent.brand ? ` for "${intent.brand}"` : ''}.`);
    }

    const amount = intent.amount.value || 50;
    const lines = products.value.slice(0, 3).map(
      (p) => `  • ${p.name} — from $${p.denominations?.[0] ?? 10}`,
    );
    const reply = `Here's what I found for ${intent.category}${intent.brand ? ` (${intent.brand})` : ''}:\n${lines.join('\n')}\n\nWant to cash out $${amount} to one of these?`;

    return this.emptyResult(intent, reply);
  }

  private async handleCashOutPlan(userId: string, intent: CashOutIntent): Promise<Result<AgentChatResponse, DomainError>> {
    // Check balance first
    const balance = await this.balanceService.getBalance(userId);
    if (!isOk(balance)) return balance;

    if (balance.value.total < intent.amount.value) {
      return this.emptyResultWithReply(
        intent,
        `You only have $${balance.value.total.toFixed(2)} — not enough for $${intent.amount.value.toFixed(2)}. Try a smaller amount.`,
      );
    }

    const displayBrand = toDisplayBrand(intent.brand);
    const planSummary = `Cash out $${intent.amount.value.toFixed(2)} to ${displayBrand}`;

    // Store pending intent for confirmation
    pendingConfirmations.set(userId, { intent, planSummary });

    const reply = `You have $${balance.value.total.toFixed(2)} across ${balance.value.assets.length} chains.\n\nI'm ready to ${planSummary}. Confirm?`;

    return this.emptyResult(intent, reply);
  }

  private async executeCashOut(intent: CashOutIntent, userId: string): Promise<Result<AgentChatResponse, DomainError>> {
    const execution = await this.executor.execute(intent, userId);

    if (!isOk(execution)) {
      return execution;
    }

    const persistedOrder = await this.orders.findById(execution.value.orderId);
    const reply = await this.composeReply(intent, execution.value, persistedOrder, { confirmed: true });

    return ok({
      ...execution.value,
      intent,
      reply,
    });
  }

  // ── Reply composition ─────────────────────────────────────────────

  private async composeReply(
    intent: CashOutIntent,
    result: CashOutResult,
    order: Order | null,
    context?: { cancelled?: boolean; confirmed?: boolean },
  ): Promise<string> {
    if (context?.cancelled) {
      return 'Cancelled. What would you like to do instead?';
    }

    const template = (): string => {
      const displayBrand = toDisplayBrand(order?.product.brand ?? intent.brand);
      if (context?.confirmed) {
        return `✅ Done! Your ${displayBrand} cash-out for $${intent.amount.value.toFixed(2)} is complete. Order ${result.orderId}.`;
      }
      return `Starting your ${displayBrand} cash-out for $${intent.amount.value.toFixed(2)}. Order ${result.orderId} is ${result.status}.`;
    };

    if (!this.replyStrategy) return template();

    try {
      return await this.replyStrategy.buildReply({ intent, result, order });
    } catch {
      return template();
    }
  }

  private emptyResult(intent: CashOutIntent, reply: string): Result<AgentChatResponse, DomainError> {
    return ok({
      orderId: '',
      status: 'payment_pending',
      trace: [],
      intent,
      reply,
    });
  }

  private emptyResultWithReply(intent: CashOutIntent, reply: string): Result<AgentChatResponse, DomainError> {
    return this.emptyResult(intent, reply);
  }
}