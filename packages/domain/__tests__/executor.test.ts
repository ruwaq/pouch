import { describe, expect, it } from 'vitest';

import {
  CashOutExecutor,
  OffRampRouter,
  type AccountProvider,
  type LoggerPort,
  type OffRampProvider,
  type Order,
  type OrderRepository,
  type OrderRequest,
  type Product,
} from '@pouch/domain';
import { ok } from '@pouch/shared';

class StubProvider implements OffRampProvider {
  readonly id = 'stub-provider';
  readonly name = 'Stub Provider';
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
      id: 'order-1',
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

class CapturingRepository implements OrderRepository {
  readonly saved: Order[] = [];
  readonly statuses: Array<{ id: string; status: string }> = [];

  async save(order: Order): Promise<void> {
    this.saved.push(order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.saved.find((order) => order.id === id) ?? null;
  }

  async findByProviderOrderId(): Promise<Order | null> {
    return null;
  }

  async updateStatus(id: string, status: Order['status']): Promise<void> {
    this.statuses.push({ id, status });
  }
}

const logger: LoggerPort = { info() {}, error() {} };

describe('CashOutExecutor', () => {
  it('attaches the userId to the created order and returns a populated trace', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
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
    const executor = new CashOutExecutor(new OffRampRouter(providers), providers, account, repository, logger);

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(repository.saved[0]?.userId).toBe('user-42');
    expect(result.value.orderId).toBe('order-1');
    expect(result.value.trace.length).toBeGreaterThanOrEqual(4);
    expect(result.value.trace.every((step) => step.status === 'complete')).toBe(true);
    const labels = result.value.trace.map((step) => step.label);
    expect(labels.some((label) => /balance/i.test(label))).toBe(true);
    expect(labels.some((label) => /provider|rout/i.test(label))).toBe(true);
    expect(labels.some((label) => /sign|payment|pay/i.test(label))).toBe(true);
  });

  it('includes a consolidation step when the balance requires consolidation', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 50,
          assets: [{ chainId: 8453, symbol: 'ETH', amount: 0.02, usdValue: 50 }],
          requiresConsolidation: true,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };
    const executor = new CashOutExecutor(new OffRampRouter(providers), providers, account, repository, logger);

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.trace.some((step) => /consolidat/i.test(step.label))).toBe(true);
  });
});
