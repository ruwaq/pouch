import { describe, expect, it } from 'vitest';

import { ok } from '@pouch/shared';

import { CheapestStrategy, OffRampRouter, type CashOutIntent, type OffRampProvider } from '../src';

function buildProvider(id: string, paymentAmount: number): OffRampProvider {
  return {
    id,
    name: id,
    categories: ['giftcard'],
    async searchProducts() {
      return ok([
        {
          id: `${id}-amazon`,
          providerId: id,
          name: 'Amazon US',
          brand: 'Amazon',
          category: 'giftcard',
        },
      ]);
    },
    async getQuote(product, amount) {
      return ok({
        providerId: id,
        productId: product.id,
        faceValue: amount,
        paymentAmount: {
          value: paymentAmount,
          currency: 'USD',
        },
        estimatedDelivery: 'instant',
      });
    },
    async createOrder() {
      throw new Error('Not implemented in this test.');
    },
    async getOrderStatus() {
      throw new Error('Not implemented in this test.');
    },
    async verifyWebhook() {
      throw new Error('Not implemented in this test.');
    },
  };
}

describe('OffRampRouter', () => {
  it('selects the cheapest available quote across providers', async () => {
    const intent: CashOutIntent = {
      action: 'cash_out',
      category: 'giftcard',
      brand: 'amazon',
      amount: {
        value: 50,
        currency: 'USD',
      },
    };

    const router = new OffRampRouter(
      [buildProvider('bitrefill', 50), buildProvider('reloadly', 52.5)],
      new CheapestStrategy(),
    );

    const result = await router.findBestOption(intent);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.quote.providerId).toBe('bitrefill');
    expect(result.value.consideredProviders).toEqual(['bitrefill', 'reloadly']);
  });
});
