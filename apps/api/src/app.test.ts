import { afterEach, describe, expect, it } from 'vitest';

import { CashOutExecutor, IntentParser, OffRampRouter, type AccountProvider, type LoggerPort, type OffRampProvider, type OrderRequest, type Product } from '@pouch/domain';
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
  const service = new AgentChatService(new IntentParser(), executor, repository, new BalanceService(demoAccountProvider), providers, demoAccountProvider);
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
      status: 'payment_pending',
      intent: {
        brand: 'amazon',
        amount: {
          value: 50,
          currency: 'USD',
        },
      },
    });
    // New flow: confirmation prompt (not direct execution).
    expect(body.reply).toContain('Confirm?');
    expect(Array.isArray(body.trace)).toBe(true);
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

  it('returns a friendly fallback reply for unsupported messages', async () => {
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

    // Now returns 200 with a friendly fallback reply (conversational agent).
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reply).toBeDefined();
    expect(body.intent.action).toBe('off_topic');
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

    // C4: ?userId= is intentionally ignored — identity comes only from the auth
    // context. In demo mode the middleware sets userId='demo-user', so the
    // previously-used 'wallet-user' override no longer applies.
    const response = await app.request('/balance');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 'demo-user',
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

  it('returns the created order from GET /orders/:id after confirmation', async () => {
    const app = buildAgentApp();

    // Step 1: trigger cash-out (shows confirmation)
    await app.request('/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Cash out $50 to Amazon', userId: 'demo-user' }),
    });

    // Step 2: confirm
    const confirmRes = await app.request('/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'yes', userId: 'demo-user' }),
    });

    expect(confirmRes.status).toBe(200);
    const confirmBody = await confirmRes.json();
    const orderId = confirmBody.orderId;
    expect(orderId).toBeTruthy();

    // Step 3: fetch the order
    const response = await app.request(`/orders/${orderId}?userId=demo-user`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: orderId,
      providerId: 'demo-provider',
      status: 'payment_pending',
      product: { name: 'Amazon US' },
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

  it('returns 404 when GET /orders/:id does not exist', async () => {
    const app = buildAgentApp();

    const response = await app.request('/orders/missing-order');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Order not found' });
  });
});

// ── C1: webhook signature verification at the HTTP layer ──────────────
// Locks down raw-body extraction + status-code semantics (401 for auth
// failures, 400 for malformed-but-signed). Uses the real BitrefillAdapter
// with a known WEBHOOK_SECRET so the HMAC path is exercised end-to-end.
import { createHmac } from 'node:crypto';
import { BitrefillAdapter, BitrefillMapper } from '@pouch/infra-offramp';

const ROUTE_SECRET = 'r'.repeat(32);

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function buildSignedWebhookApp() {
  const repository = new MemoryOrderRepository();
  const client = {
    getInvoice: async () => ({ data: { id: 'inv_signed', orders: [] } }),
    getOrder: async () => ({ data: { id: 'o1' } }),
  } as never;
  const adapter = new BitrefillAdapter(client, new BitrefillMapper(), {
    paymentMethod: 'bitcoin',
    webhookSecret: ROUTE_SECRET,
  });
  const webhookService = new BitrefillWebhookService(adapter, repository, new MemoryWebhookEventStore());
  const orderService = new OrderService(repository);
  return createApp({ bitrefillWebhookService: webhookService, orderService });
}

describe('POST /webhooks/bitrefill (C1 raw-body + status codes)', () => {
  it('returns 401 when the signature header is missing', async () => {
    const app = buildSignedWebhookApp();
    const res = await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { id: 'inv_signed' } }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature does not match the raw body', async () => {
    const app = buildSignedWebhookApp();
    const res = await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'deadbeef',
      },
      body: JSON.stringify({ data: { id: 'inv_signed' } }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 when the signature matches the exact raw body bytes', async () => {
    const app = buildSignedWebhookApp();
    const raw = JSON.stringify({ data: { id: 'inv_signed' } });
    const res = await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signBody(raw, ROUTE_SECRET),
      },
      body: raw,
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a malformed-but-signed payload (bad JSON)', async () => {
    const app = buildSignedWebhookApp();
    // Valid signature over invalid JSON bytes — auth passes, parsing fails.
    const malformed = 'not-json-at-all';
    const res = await app.request('/webhooks/bitrefill', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signBody(malformed, ROUTE_SECRET),
      },
      body: malformed,
    });
    expect(res.status).toBe(400);
  });
});

// ── C2: disable demo auth fallback in production ─────────────────────
// When NODE_ENV === 'production', the auth middleware must NEVER fall back
// to demo-user, even if the runtime is in demo mode (forced by DEMO_MODE=true
// or a swallowed boot error). Closes an auth bypass where DEMO_MODE=true in
// production opened the entire API unauthenticated.
describe('app demo auth fallback (C2)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDemoMode = process.env.DEMO_MODE;
  const originalJwt = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DEMO_MODE = originalDemoMode;
    process.env.JWT_SECRET = originalJwt;
  });

  it('returns 401 in production even when DEMO_MODE=true forces demo runtime', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const app = createApp();

    const res = await app.request('/balance');
    expect(res.status).toBe(401);
  });
});

// ── C3: only mount /auth/demo outside production ──────────────────────
// POST /auth/demo mints a real 24h JWT (sub: 'demo-user'). Mounting it in
// production lets anonymous clients forge demo sessions. Gate the mount on
// !isProduction so the route is gone entirely in prod (404, not 401).
describe('app /auth/demo mount (C3)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDemoMode = process.env.DEMO_MODE;
  const originalJwt = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DEMO_MODE = originalDemoMode;
    process.env.JWT_SECRET = originalJwt;
  });

  it('does not mount /auth/demo in production', async () => {
    // DEMO_MODE=true keeps createRuntimeAppServices from fail-fasting on
    // missing prod config; isProduction is still true, so the route must be
    // absent (404, not 401 — the mount itself is gated).
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const app = createApp();

    const res = await app.request('/auth/demo', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('mounts /auth/demo in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const app = createApp();

    const res = await app.request('/auth/demo', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
