import { CashOutExecutor, OffRampRouter, type AccountProvider, type LoggerPort, type OffRampProvider, type OrderRequest, type Product } from '@pouch/domain';
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
        denominations: [10, 25, 50, 100],
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
        denominations: [10, 25, 50, 100],
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

const demoAccountProvider: AccountProvider = {
  async getUnifiedBalance() {
    return ok({
      total: 100,
      assets: [
        { chainId: 42161, symbol: 'USDC', amount: 45, usdValue: 45 },
        { chainId: 8453, symbol: 'USDC', amount: 30, usdValue: 30 },
        { chainId: 8453, symbol: 'ETH', amount: 0.007, usdValue: 25 },
      ],
      requiresConsolidation: true,
    });
  },
  async consolidate() {
    return ok({ txHash: '0xdemo-consolidation' });
  },
  async sendPayment() {
    return ok({ txHash: '0xdemo-payment' });
  },
};

const logger: LoggerPort = {
  info() {},
  error() {},
};

export function createDemoAgentService(): AgentChatService {
  return createDemoAppServices().agentService;
}

export function createDemoBalanceService(): BalanceService {
  return createDemoAppServices().balanceService;
}

export function createDemoOrderService(): OrderService {
  return createDemoAppServices().orderService;
}

export function createDemoAppServices(accountProvider?: AccountProvider): {
  agentService: AgentChatService;
  balanceService: BalanceService;
  orderService: OrderService;
} {
  const providers = [new DemoProvider()];
  const repository = new MemoryOrderRepository();
  const router = new OffRampRouter(providers);
  const realAccountProvider = accountProvider ?? demoAccountProvider;
  const executor = new CashOutExecutor(router, providers, realAccountProvider, repository, logger);

  // Use Gemini LLM when configured, fall back to regex parser + template reply.
  // This lets the demo run with conversational AI when GEMINI_API_KEY is set.
  // We build a minimal config from process.env so createAgentLlm can detect
  // the LLM settings without needing the full Zod-validated Config.
  const llmProvider = (process.env.LLM_PROVIDER ?? '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  const llmModel = (process.env.LLM_MODEL ?? '').trim();
  
  console.error('[demo] LLM config:', { llmProvider, hasKey: Boolean(geminiKey), model: llmModel || 'default' });
  
  const { intentParser, replyStrategy } = createAgentLlm({
    LLM_PROVIDER: llmProvider || undefined,
    GEMINI_API_KEY: geminiKey || undefined,
    LLM_MODEL: llmModel || undefined,
  } as unknown as Parameters<typeof createAgentLlm>[0]);
  
  console.error('[demo] replyStrategy configured:', Boolean(replyStrategy));
  const balanceService = new BalanceService(realAccountProvider);
  const agentService = replyStrategy
    ? new AgentChatService(intentParser, executor, repository, balanceService, providers, replyStrategy)
    : new AgentChatService(intentParser, executor, repository, balanceService, providers);

  return {
    agentService,
    balanceService: new BalanceService(realAccountProvider),
    orderService: new OrderService(repository),
  };
}
