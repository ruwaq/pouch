import { describe, expect, it } from 'vitest';

import { mapOrderToRow, mapRowToOrder } from '../src/repositories/order-repository';

describe('order repository mappers', () => {
  it('maps a domain order into a database row shape', () => {
    const row = mapOrderToRow({
      id: 'invoice-123',
      providerOrderId: 'provider-order-123',
      providerId: 'bitrefill',
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
          value: 52.5,
          currency: 'USD',
        },
        chainId: 42161,
        token: 'USDC',
        txHash: '0xtx',
      },
      status: 'payment_pending',
      redemption: {
        code: 'AMZN-XXXX',
        link: 'https://claim.example/amzn',
        instructions: 'Open the claim page to redeem.',
      },
      idempotencyKey: 'idem-123',
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:01:00.000Z'),
    });

    expect(row).toMatchObject({
      id: 'invoice-123',
      providerId: 'bitrefill',
      providerOrderId: 'provider-order-123',
      category: 'giftcard',
      amountUsd: '50.00',
      paymentAddress: '0xabc',
      paymentChainId: '42161',
      paymentToken: 'USDC',
      paymentTxHash: '0xtx',
      redemptionCode: 'AMZN-XXXX',
      redemptionLink: 'https://claim.example/amzn',
      redemptionInstructions: 'Open the claim page to redeem.',
      idempotencyKey: 'idem-123',
    });
  });

  it('maps a database row back into a domain order', () => {
    const order = mapRowToOrder({
      id: 'invoice-123',
      providerId: 'bitrefill',
      providerOrderId: 'provider-order-123',
      category: 'giftcard',
      product: {
        id: 'amazon-us',
        providerId: 'bitrefill',
        name: 'Amazon US',
        brand: 'Amazon',
        category: 'giftcard',
        denominations: [50],
      },
      amountUsd: '50.00',
      paymentAddress: '0xabc',
      paymentChainId: '42161',
      paymentToken: 'USDC',
      paymentTxHash: '0xtx',
      status: 'delivered',
      redemptionCode: 'AMZN-XXXX',
      redemptionLink: 'https://claim.example/amzn',
      redemptionInstructions: 'Open the claim page to redeem.',
      idempotencyKey: 'idem-123',
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:01:00.000Z'),
      userId: null,
    });

    expect(order).toEqual({
      id: 'invoice-123',
      providerId: 'bitrefill',
      providerOrderId: 'provider-order-123',
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
        txHash: '0xtx',
      },
      status: 'delivered',
      redemption: {
        code: 'AMZN-XXXX',
        link: 'https://claim.example/amzn',
        instructions: 'Open the claim page to redeem.',
      },
      idempotencyKey: 'idem-123',
      createdAt: new Date('2026-07-10T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:01:00.000Z'),
    });
  });
});
