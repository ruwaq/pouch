import { describe, expect, it } from 'vitest';

import { CashOutExecutor, IntentParser, OffRampRouter, type AccountProvider, type LoggerPort, type OffRampProvider, type Order, type OrderRepository, type OrderRequest, type OrderStatus, type Product } from '@pouch/domain';
import { ok } from '@pouch/shared';

import { createApp } from './app';
import { BalanceService } from './services/balance-service';
import { BitrefillWebhookService } from './services/bitrefill-webhook-service';
import { AgentChatService } from './services/agent-chat-service';
import { OrderService } from './services/order-service';
import { MemoryOrderRepository } from './support/memory-order-repository';
import { MemoryWebhookEventStore } from './support/memory-webhook-event-store';

class DemoProvider implements OffRampProvider {
  readonly id = 'demo-provider';
  readonly name = 'Demo Provider';
  readonly categories = ['giftcard'] as const;

  private readonly product: Product = {
    id: 'amazon-us',
    providerId: this.id,
    name: 'Amazon US',
    brand: 'Amazon',
    category: 'giftcard',
    denominations: [50],
  };

  async searchProducts(): ReturnType<OffRampProvider['searchProducts']> {
    return ok([this.product]);
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
    return ok({
      id: 'order-demo-1',
      providerOrderId: 'provider-order-1',
      providerId: this.id,
      ...(request.userId ? { userId: request.userId } : {}),
      product: this.product,
      faceValue: request.amount,
      payment: {
        address: '0xpayment',
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
    throw new Error('Not used in this test.');
  }
}

const demoAccountProvider: AccountProvider = {
  async getUnifiedBalance() {
    return ok({
      total: 125,
      assets: [
        { chainId: 42161, symbol: 'USDC', amount: 125, usdValue: 125 },
      ],
      requiresConsolidation: false,
    });
  },
  async consolidate() {
    return ok({ txHash: '0xconsolidate' });
  },
  async sendPayment() {
    return ok({ txHash: '0xpay' });
  },
};

const logger: LoggerPort = {
  info() {},
  error() {},
};

function buildAgentApp() {
  const providers = [new DemoProvider()];
  const repository = new MemoryOrderRepository();
  const router = new OffRampRouter(providers);
  const executor = new CashOutExecutor(router, providers, demoAccountProvider, repository, logger);
  const service = new AgentChatService(new IntentParser(), executor, repository);
  const balanceService = new BalanceService(demoAccountProvider);
  const orderService = new OrderService(repository);

  return createApp({ agentService: service, balanceService, orderService });
}

function buildBalanceErrorApp() {
  const failingAccountProvider: AccountProvider = {
    async getUnifiedBalance() {
      return {
        ok: false as const,
        error: {
          type: 'UNKNOWN' as const,
          message: 'Balance provider is unavailable.',
        },
      };
    },
    async consolidate() {
      throw new Error('Not used in this test.');
    },
    async sendPayment() {
      throw new Error('Not used in this test.');
    },
  };

  return createApp({ balanceService: new BalanceService(failingAccountProvider) });
}

function buildWebhookApp() {
  const repository = new MemoryOrderRepository();

  void repository.save({
    id: 'invoice-verified',
    providerOrderId: 'provider-order-verified',
    providerId: 'bitrefill',
    userId: 'demo-user',
    product: {
      id: 'amazon-us',
      providerId: 'bitrefill',
      name: 'Amazon US',
      brand: 'Amazon',
      category: 'giftcard',
      denominations: [50],
    },
    faceValue: {
      value: 50,
      currency: 'USD',
    },
    payment: {
      address: '0xabc',
      amount: {
        value: 50,
        currency: 'USD',
      },
      chainId: 42161,
      token: 'USDC',
    },
    status: 'payment_pending',
    idempotencyKey: 'idem-webhook',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const provider: OffRampProvider = {
    id: 'bitrefill',
    name: 'Bitrefill',
    categories: ['giftcard'],
    async searchProducts() {
      throw new Error('Not used in this test.');
    },
    async getQuote() {
      throw new Error('Not used in this test.');
    },
    async createOrder() {
      throw new Error('Not used in this test.');
    },
    async getOrderStatus() {
      throw new Error('Not used in this test.');
    },
    async verifyWebhook() {
      return ok({
        eventId: 'invoice-verified',
        orderId: 'provider-order-verified',
        providerId: 'bitrefill',
        status: 'delivered',
        redemption: {
          code: 'AMZN-XXXX-XXXX',
          link: 'https://claim.example/amzn',
        },
        payload: {
          id: 'invoice-verified',
        },
      });
    },
  };

  const webhookService = new BitrefillWebhookService(provider, repository, new MemoryWebhookEventStore());
  const orderService = new OrderService(repository);

  return { app: createApp({ bitrefillWebhookService: webhookService, orderService }), repository };
}

describe('API app', () => {
  it('returns a conversational cash-out response from POST /agent/chat', async () => {
    const app = buildAgentApp();

    const response = await app.request('/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Cash out $50 to Amazon',
        userId: 'demo-user',
      }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body).toMatchObject({
      orderId: 'order-demo-1',
      status: 'payment_pending',
      intent: {
        brand: 'amazon',
        amount: {
          value: 50,
          currency: 'USD',
        },
      },
    });
    expect(body.reply).toContain('Amazon');
    expect(body.reply).toContain('$50.00');
    expect(Array.isArray(body.trace)).toBe(true);
    expect(body.trace.length).toBeGreaterThan(0);
    expect(body.trace[0]).toMatchObject({ status: 'complete' });
  });

  it('rejects invalid request bodies', async () => {
    const app = buildAgentApp();

    const response = await app.request('/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'message must be a non-empty string',
    });
  });

  it('returns a user-facing parse error for unsupported messages', async () => {
    const app = buildAgentApp();

    const response = await app.request('/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'What is the weather today?',
      }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: 'Only cash-out purchase requests are supported right now.',
      type: 'UNSUPPORTED_INTENT',
    });
  });

  it('processes the Bitrefill webhook once and ignores duplicates idempotently', async () => {
    const { app, repository } = buildWebhookApp();

    const firstResponse = await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          id: 'invoice-verified',
        },
      }),
    });

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({
      duplicate: false,
      ignored: false,
      received: true,
      status: 'delivered',
    });

    await expect(repository.findById('invoice-verified')).resolves.toMatchObject({
      status: 'delivered',
    });

    const secondResponse = await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          id: 'invoice-verified',
        },
      }),
    });

    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toEqual({
      duplicate: true,
      received: true,
    });
  });

  it('returns the unified balance from GET /balance', async () => {
    const app = buildAgentApp();

    const response = await app.request('/balance?userId=wallet-user');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 'wallet-user',
      total: 125,
      assets: [{ chainId: 42161, symbol: 'USDC', amount: 125, usdValue: 125 }],
      requiresConsolidation: false,
    });
  });

  it('returns a user-facing error when balance retrieval fails', async () => {
    const app = buildBalanceErrorApp();

    const response = await app.request('/balance');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Balance provider is unavailable.',
      type: 'UNKNOWN',
    });
  });

  it('returns the created order from GET /orders/:id', async () => {
    const app = buildAgentApp();

    await app.request('/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Cash out $50 to Amazon',
        userId: 'demo-user',
      }),
    });

    const response = await app.request('/orders/order-demo-1?userId=demo-user');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'order-demo-1',
      providerId: 'demo-provider',
      status: 'payment_pending',
      product: {
        name: 'Amazon US',
      },
    });
  });

  it('persists redemption details from webhook and exposes them via GET /orders/:id', async () => {
    const { app } = buildWebhookApp();

    await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          id: 'invoice-verified',
        },
      }),
    });

    const response = await app.request('/orders/invoice-verified?userId=demo-user');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'invoice-verified',
      status: 'delivered',
      redemption: {
        code: 'AMZN-XXXX-XXXX',
        link: 'https://claim.example/amzn',
      },
    });
  });

  it('returns 404 when GET /orders/:id does not exist or is not owned', async () => {
    const app = buildAgentApp();

    // Create an order owned by demo-user
    await app.request('/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Cash out $50 to Amazon', userId: 'demo-user' }),
    });

    // A different user gets 404 (ownership enforced, not a leak)
    const response = await app.request('/orders/order-demo-1?userId=other-user');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Order not found' });
  });
});
