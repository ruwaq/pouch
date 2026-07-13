import { isOk, ok, type Result } from '@pouch/shared';
import type { CashOutExecutor, CashOutIntent, CashOutResult, DomainError, IntentParserStrategy, OrderRepository } from '@pouch/domain';

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
  ) {}

  async handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>> {
    const intent = this.parser.parse(message);

    if (!isOk(intent)) {
      return intent;
    }

    const execution = await this.executor.execute(intent.value, userId);

    if (!isOk(execution)) {
      return execution;
    }

    const persistedOrder = await this.orders.findById(execution.value.orderId);
    const displayBrand = toDisplayBrand(persistedOrder?.product.brand ?? intent.value.brand);

    return ok({
      ...execution.value,
      intent: intent.value,
      reply: `Starting your ${displayBrand} cash-out for $${intent.value.amount.value.toFixed(2)}. Order ${execution.value.orderId} is now ${execution.value.status}.`,
    });
  }
}
