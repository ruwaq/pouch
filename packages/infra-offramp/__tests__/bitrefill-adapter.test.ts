import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BitrefillAdapter } from '../src/bitrefill/adapter';
import { BitrefillMapper } from '../src/bitrefill/mapper';

const SECRET = 'x'.repeat(32);

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('BitrefillAdapter', () => {
  it('searches catalog products with the requested category and filters by query', async () => {
    const client = {
      async listProducts() {
        return {
          data: [
            { id: 'amazon-us', name: 'Amazon US', packages: [{ id: 'amazon-us<&>50', value: 50, price: 50 }] },
            { id: 'netflix-us', name: 'Netflix US', packages: [{ id: 'netflix-us<&>25', value: 25, price: 25 }] },
          ],
        };
      },
      async searchProducts() {
        throw new Error('searchProducts should not be used when a category filter is available.');
      },
      async getProduct() {
        throw new Error('Not used in this test.');
      },
      async createInvoice() {
        throw new Error('Not used in this test.');
      },
      async getInvoice() {
        throw new Error('Not used in this test.');
      },
      async getOrder() {
        throw new Error('Not used in this test.');
      },
    };

    const adapter = new BitrefillAdapter(client, new BitrefillMapper(), {
      includeTestProducts: true,
      paymentMethod: 'usdc_arbitrum',
      webhookSecret: SECRET,
    });

    const result = await adapter.searchProducts('amazon', { category: 'giftcard', countryCode: 'US' });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      id: 'amazon-us',
      category: 'giftcard',
    });
  });

  it('creates an invoice using package_id for fixed denomination products', async () => {
    const calls: unknown[] = [];

    const client = {
      async listProducts() {
        throw new Error('Not used in this test.');
      },
      async searchProducts() {
        throw new Error('Not used in this test.');
      },
      async getProduct() {
        return {
          data: {
            id: 'amazon-us',
            name: 'Amazon US',
            packages: [{ id: 'pkg_live_50', value: 50, price: 50 }],
          },
        };
      },
      async createInvoice(payload: unknown) {
        calls.push(payload);

        return {
          data: {
            id: 'invoice-123',
            status: 'unpaid',
            payment: {
              method: 'usdc_arbitrum',
              address: '0xabc',
              price: 50,
              currency: 'USD',
              status: 'unpaid',
            },
            orders: [
              {
                id: 'order-123',
                status: 'created',
                product: {
                  id: 'amazon-us',
                  name: 'Amazon US',
                  value: '50',
                  currency: 'USD',
                },
              },
            ],
          },
        };
      },
      async getInvoice() {
        throw new Error('Not used in this test.');
      },
      async getOrder() {
        throw new Error('Not used in this test.');
      },
    };

    const adapter = new BitrefillAdapter(client, new BitrefillMapper(), {
      includeTestProducts: true,
      paymentMethod: 'usdc_arbitrum',
      webhookSecret: SECRET,
      senderName: 'Pouch',
    });

    const result = await adapter.createOrder({
      productId: 'amazon-us',
      amount: {
        value: 50,
        currency: 'USD',
      },
      idempotencyKey: 'idem-123',
      recipient: {
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
    });

    expect(calls).toEqual([
      {
        products: [
          {
            product_id: 'amazon-us',
            quantity: 1,
            package_id: 'pkg_live_50',
            gift: {
              recipient_name: 'Jane Doe',
              recipient_email: 'jane@example.com',
              sender_name: 'Pouch',
            },
          },
        ],
        payment_method: 'usdc_arbitrum',
        auto_pay: false,
      },
    ]);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      id: 'invoice-123',
      providerId: 'bitrefill',
      providerOrderId: 'order-123',
      status: 'payment_pending',
      payment: {
        address: '0xabc',
        chainId: 42161,
        token: 'USDC',
      },
    });
  });

  it('builds a quote from Bitrefill pricing instead of assuming face value parity', async () => {
    const client = {
      async listProducts() {
        throw new Error('Not used in this test.');
      },
      async searchProducts() {
        throw new Error('Not used in this test.');
      },
      async getProduct() {
        return {
          data: {
            id: 'amazon-us',
            name: 'Amazon US',
            packages: [{ id: 'pkg_live_50', value: 50, price: 52.5 }],
          },
        };
      },
      async createInvoice() {
        throw new Error('Not used in this test.');
      },
      async getInvoice() {
        throw new Error('Not used in this test.');
      },
      async getOrder() {
        throw new Error('Not used in this test.');
      },
    };

    const adapter = new BitrefillAdapter(client, new BitrefillMapper(), {
      includeTestProducts: true,
      paymentMethod: 'usdc_arbitrum',
      webhookSecret: SECRET,
    });

    const result = await adapter.getQuote(
      {
        id: 'amazon-us',
        providerId: 'bitrefill',
        name: 'Amazon US',
        brand: 'Amazon',
        category: 'giftcard',
        denominations: [50],
      },
      {
        value: 50,
        currency: 'USD',
      },
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.paymentAmount.value).toBe(52.5);
    expect(result.value.faceValue.value).toBe(50);
  });

  it('verifies webhook status against the canonical invoice from Bitrefill', async () => {
    const invoiceLookups: string[] = [];
    const orderLookups: string[] = [];

    const client = {
      async listProducts() {
        throw new Error('Not used in this test.');
      },
      async searchProducts() {
        throw new Error('Not used in this test.');
      },
      async getProduct() {
        throw new Error('Not used in this test.');
      },
      async createInvoice() {
        throw new Error('Not used in this test.');
      },
      async getInvoice(invoiceId: string) {
        invoiceLookups.push(invoiceId);

        return {
          data: {
            id: invoiceId,
            status: 'complete',
            orders: [{ id: 'order-verified', status: 'delivered' }],
          },
        };
      },
      async getOrder(orderId: string) {
        orderLookups.push(orderId);

        return {
          data: {
            id: orderId,
            status: 'delivered',
            redemption_info: {
              code: 'AMZN-XXXX-XXXX',
              link: 'https://claim.example/amzn',
            },
          },
        };
      },
    };

    const adapter = new BitrefillAdapter(client, new BitrefillMapper(), {
      includeTestProducts: true,
      paymentMethod: 'usdc_arbitrum',
      webhookSecret: SECRET,
    });

    const PAYLOAD = JSON.stringify({
      data: {
        id: 'invoice-verified',
        status: 'denied',
      },
    });

    const result = await adapter.verifyWebhook(PAYLOAD, {
      'x-webhook-signature': sign(PAYLOAD, SECRET),
      'content-type': 'application/json',
    });

    expect(invoiceLookups).toEqual(['invoice-verified']);
    expect(orderLookups).toEqual(['order-verified']);
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe('delivered');
    expect(result.value.orderId).toBe('order-verified');
    expect(result.value.redemption).toEqual({
      code: 'AMZN-XXXX-XXXX',
      link: 'https://claim.example/amzn',
    });
  });
});

describe('BitrefillAdapter.verifyWebhook signature (C1)', () => {
  function build() {
    const client = {
      getInvoice: async () => ({ data: { id: 'inv_123', orders: [] } }),
      getOrder: async () => ({ data: { id: 'o1' } }),
    } as never;
    return new BitrefillAdapter(client, new BitrefillMapper(), {
      paymentMethod: 'bitcoin',
      webhookSecret: SECRET,
    });
  }
  const PAYLOAD = JSON.stringify({ data: { id: 'inv_123' } });

  it('rejects when signature header is missing', async () => {
    const result = await build().verifyWebhook(PAYLOAD, {});
    expect(result.ok).toBe(false);
  });

  it('rejects when signature does not match', async () => {
    const result = await build().verifyWebhook(PAYLOAD, { 'x-webhook-signature': 'deadbeef' });
    expect(result.ok).toBe(false);
  });

  it('accepts when signature matches the body', async () => {
    const result = await build().verifyWebhook(PAYLOAD, {
      'x-webhook-signature': sign(PAYLOAD, SECRET),
    });
    expect(result.ok).toBe(true);
  });

  it('accepts case-insensitive header lookup', async () => {
    const result = await build().verifyWebhook(PAYLOAD, {
      'X-Webhook-Signature': sign(PAYLOAD, SECRET),
    });
    expect(result.ok).toBe(true);
  });
});
