import { describe, expect, it } from 'vitest';

import type { Order } from '@pouch/domain';

import { MemoryOrderRepository } from './memory-order-repository';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    providerId: 'bitrefill',
    product: {
      id: 'amazon-us',
      providerId: 'bitrefill',
      name: 'Amazon US',
      brand: 'Amazon',
      category: 'giftcard',
      denominations: [50],
    },
    faceValue: { value: 50, currency: 'USD' },
    payment: { amount: { value: 50, currency: 'USD' }, chainId: 42161, token: 'USDC' },
    status: 'payment_pending',
    idempotencyKey: 'idem-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('MemoryOrderRepository ownership', () => {
  it('returns the order when userId matches', async () => {
    const repo = new MemoryOrderRepository();
    await repo.save(buildOrder({ id: 'order-1', userId: 'user-a' }));

    await expect(repo.findById('order-1', 'user-a')).resolves.toMatchObject({ id: 'order-1' });
  });

  it('returns null when userId does not match', async () => {
    const repo = new MemoryOrderRepository();
    await repo.save(buildOrder({ id: 'order-1', userId: 'user-a' }));

    await expect(repo.findById('order-1', 'user-b')).resolves.toBeNull();
  });

  it('returns the order regardless of userId when no userId filter is given', async () => {
    const repo = new MemoryOrderRepository();
    await repo.save(buildOrder({ id: 'order-1', userId: 'user-a' }));

    await expect(repo.findById('order-1')).resolves.toMatchObject({ id: 'order-1' });
  });
});
