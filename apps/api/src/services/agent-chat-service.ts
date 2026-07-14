import type { CashOutExecutor, CashOutIntent, CashOutResult, DomainError, IntentParserStrategy, Order, OrderRepository, ReplyStrategy } from '@pouch/domain';
import { isOk, ok, type Result } from '@pouch/shared';

export interface AgentChatResponse extends CashOutResult {
  intent: CashOutIntent;
  reply: string;
  trace: CashOutResult['trace'];
}

export interface AgentChatServiceLike {
  handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>>;
}

function toDisplayBrand(brand: string | undefined): string {
  if (!brand) {
    return 'your selected product';
  }

  return brand
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

export class AgentChatService implements AgentChatServiceLike {
  constructor(
    private readonly parser: IntentParserStrategy,
    private readonly executor: CashOutExecutor,
    private readonly orders: OrderRepository,
    private readonly replyStrategy?: ReplyStrategy,
  ) {}

  async handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>> {
    const intent = await this.parser.parse(message);

    if (!isOk(intent)) {
      return intent;
    }

    const execution = await this.executor.execute(intent.value, userId);

    if (!isOk(execution)) {
      return execution;
    }

    const persistedOrder = await this.orders.findById(execution.value.orderId);

    const reply = await this.composeReply(intent.value, execution.value, persistedOrder);

    return ok({
      ...execution.value,
      intent: intent.value,
      reply,
    });
  }

  private async composeReply(
    intent: CashOutIntent,
    result: CashOutResult,
    order: Order | null,
  ): Promise<string> {
    const template = (): string => {
      const displayBrand = toDisplayBrand(order?.product.brand ?? intent.brand);
      return `Starting your ${displayBrand} cash-out for $${intent.amount.value.toFixed(2)}. Order ${result.orderId} is now ${result.status}.`;
    };

    if (!this.replyStrategy) {
      return template();
    }

    try {
      return await this.replyStrategy.buildReply({
        intent,
        result,
        order,
      });
    } catch {
      return template();
    }
  }
}
