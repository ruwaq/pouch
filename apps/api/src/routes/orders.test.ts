import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { createOrderRoutes } from './orders';
import type { OrderServiceLike } from '../services/order-service';
import type { Order } from '@pouch/domain';

function makeOrder(): Order {
  return {
    id: 'order-1',
    providerId: 'demo-provider',
    product: {
      id: 'amazon-us',
      providerId: 'demo-provider',
      name: 'Amazon US',
      brand: 'Amazon',
      category: 'giftcard',
      denominations: [50],
    },
    faceValue: { value: 50, currency: 'USD' },
    payment: {
      amount: { value: 50, currency: 'USD' },
      chainId: 42161,
      token: 'USDC',
    },
    status: 'payment_pending',
    idempotencyKey: 'idem-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildAppWithUser(
  userId: string | undefined,
  captured: { userId: string | undefined; orderId?: string },
) {
  const fakeService: OrderServiceLike = {
    async getOrder(orderId, uid) {
      captured.orderId = orderId;
      // Capture whatever tenant scoping was passed (string | undefined).
      captured.userId = uid;
      // Return the order only when the caller is the owner (real-user) —
      // exercises the wrong-tenant 404 path too.
      if (uid === 'real-user') return makeOrder();
      return null;
    },
  };
  const parent = new Hono<AuthEnv>();
  if (userId !== undefined) {
    parent.use('*', async (c, next) => {
      c.set('userId', userId);
      await next();
    });
  }
  parent.route('/orders', createOrderRoutes(fakeService));
  return parent;
}

describe('GET /orders/:id identity (C4)', () => {
  it('uses authenticated userId and ignores ?userId=', async () => {
    const captured: { userId: string | undefined; orderId?: string } = { userId: undefined };
    const app = buildAppWithUser('real-user', captured);
    const res = await app.request('/orders/order-1?userId=victim');
    expect(res.status).toBe(200);
    expect(captured.userId).toBe('real-user');
  });

  it('returns 401 when no authenticated principal is set', async () => {
    const captured: { userId: string | undefined; orderId?: string } = { userId: undefined };
    const app = buildAppWithUser(undefined, captured);
    const res = await app.request('/orders/order-1?userId=victim');
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 for an order owned by another tenant', async () => {
    const captured: { userId: string | undefined; orderId?: string } = { userId: undefined };
    // No auth context set would be 401, so use a principal that the fake
    // treats as a non-owner to exercise the tenant-scoped 404 path.
    const app = buildAppWithUser('someone-else', captured);
    const res = await app.request('/orders/order-1?userId=real-user');
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Order not found' });
  });
});
