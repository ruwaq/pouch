import { CashOutExecutor, OffRampRouter, SecurityChecker, DEFAULT_POLICY, type AccountProvider, type AgentWalletPort, type LoggerPort, type OffRampProvider, type OrderRequest, type Product, type SecurityPolicyPort, type SpendingPolicy } from '@pouch/domain';
import { createAgentLlm } from '@pouch/infra-ai';
import { ok } from '@pouch/shared';

import { AgentChatService } from '../services/agent-chat-service';
import { BalanceService } from '../services/balance-service';
import { OrderService } from '../services/order-service';
import { MemoryOrderRepository } from '../support/memory-order-repository';

class DemoProvider implements OffRampProvider {
  readonly id = 'demo-provider';
  readonly name = 'Demo Provider';
  readonly categories = ['giftcard', 'topup', 'esim'] as const;

  async searchProducts(query: string): ReturnType<OffRampProvider['searchProducts']> {
    const brand = query || 'amazon';

    return ok([
      {
        id: `${brand}-demo`,
        providerId: this.id,
        name: `${brand.toUpperCase()} Demo`,
        brand,
        category: 'giftcard',
        denominations: [5, 10, 25, 50, 100],
      },
    ]);
  }

  async getQuote(product: Product, amount: { value: number; currency: 'USD' }): ReturnType<OffRampProvider['getQuote']> {
    return ok({
      providerId: this.id,
      productId: product.id,
      faceValue: amount,
      paymentAmount: amount,
      estimatedDelivery: 'instant',
    });
  }

  async createOrder(request: OrderRequest): ReturnType<OffRampProvider['createOrder']> {
    const brand = request.productId.replace(/-demo$/, '');

    return ok({
      id: `demo-order-${request.idempotencyKey}`,
      providerOrderId: `provider-${request.idempotencyKey}`,
      providerId: this.id,
      ...(request.userId ? { userId: request.userId } : {}),
      product: {
        id: request.productId,
        providerId: this.id,
        name: `${brand.toUpperCase()} Demo`,
        brand,
        category: 'giftcard',
        denominations: [5, 10, 25, 50, 100],
      },
      faceValue: request.amount,
      payment: {
        address: '0xdemo',
        amount: request.amount,
        chainId: 42161,
        token: 'USDC',
      },
      status: 'payment_pending',
      idempotencyKey: request.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async getOrderStatus(): ReturnType<OffRampProvider['getOrderStatus']> {
    return ok('payment_pending');
  }

  async verifyWebhook(): ReturnType<OffRampProvider['verifyWebhook']> {
    throw new Error('Demo provider does not implement webhooks.');
  }
}

const logger: LoggerPort = {
  info() {},
  error() {},
};

// ── Demo security policy ───────────────────────────────────────────────

const demoPolicyStore: SecurityPolicyPort = {
  async getPolicy() {
    return ok<SpendingPolicy>({ ...DEFAULT_POLICY });
  },
};

const demoSecurityChecker = new SecurityChecker(demoPolicyStore);

export function createDemoAppServices(accountProvider: AccountProvider, agentWallet?: AgentWalletPort): {
  agentService: AgentChatService;
  balanceService: BalanceService;
  orderService: OrderService;
} {
  const providers = [new DemoProvider()];
  const repository = new MemoryOrderRepository();
  const router = new OffRampRouter(providers);
  const realAccountProvider = accountProvider;
  const executor = new CashOutExecutor(router, providers, realAccountProvider, repository, logger, agentWallet, demoSecurityChecker);

  // Use Gemini LLM when configured, fall back to regex parser + template reply.
  // This lets the demo run with conversational AI when GEMINI_API_KEY is set.
  // We build a minimal config from process.env so createAgentLlm can detect
  // the LLM settings without needing the full Zod-validated Config.
  const llmProvider = (process.env.LLM_PROVIDER ?? '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  const llmModel = (process.env.LLM_MODEL ?? '').trim();
  
  if (process.env.DEBUG_LLM === 'true') {
    console.error('[demo] LLM config:', { llmProvider, hasKey: Boolean(geminiKey), model: llmModel || 'default' });
  }
  
  const { intentParser, replyStrategy } = createAgentLlm({
    LLM_PROVIDER: llmProvider || undefined,
    GEMINI_API_KEY: geminiKey || undefined,
    LLM_MODEL: llmModel || undefined,
  } as unknown as Parameters<typeof createAgentLlm>[0]);
  
  if (process.env.DEBUG_LLM === 'true') {
    console.error('[demo] replyStrategy configured:', Boolean(replyStrategy));
  }
  const balanceService = new BalanceService(realAccountProvider);
  const agentService = replyStrategy
    ? new AgentChatService(intentParser, executor, repository, balanceService, providers, realAccountProvider, replyStrategy, demoSecurityChecker, agentWallet)
    : new AgentChatService(intentParser, executor, repository, balanceService, providers, realAccountProvider, undefined, demoSecurityChecker, agentWallet);

  return {
    agentService,
    balanceService,
    orderService: new OrderService(repository),
  };
}
