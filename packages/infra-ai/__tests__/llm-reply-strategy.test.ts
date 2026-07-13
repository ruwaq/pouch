import { describe, expect, it } from 'vitest';

import type { CashOutIntent, CashOutResult, Order } from '@pouch/domain';
import { err, ok } from '@pouch/shared';
import { toUnknownDomainError } from '@pouch/domain';

import type { LLMProvider } from '../src/llm-provider';
import { LlmReplyStrategy } from '../src/llm-reply-strategy';

function fakeIntent(overrides: Partial<CashOutIntent> = {}): CashOutIntent {
  return {
    action: 'cash_out',
    category: 'giftcard',
    brand: 'amazon',
    amount: { value: 50, currency: 'USD' },
    ...overrides,
  } as CashOutIntent;
}

function fakeResult(): CashOutResult {
  return { orderId: 'order-123', status: 'payment_pending', trace: [] };
}

function fakeOrder(): Order {
  return {
    id: 'order-123',
    providerId: 'bitrefill',
    product: { id: 'amazon', providerId: 'bitrefill', name: 'Amazon', category: 'giftcard', brand: 'amazon' },
    faceValue: { value: 50, currency: 'USD' },
    payment: { amount: { value: 50, currency: 'USD' }, chainId: 42161, token: 'USDC' },
    status: 'payment_pending',
    idempotencyKey: 'k1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Order;
}

describe('LlmReplyStrategy', () => {
  it('returns the LLM-generated text on success', async () => {
    const provider: LLMProvider = {
      async generateText() {
        return ok('Done! Your $50 Amazon card is on the way. 🎉');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

    expect(reply).toBe('Done! Your $50 Amazon card is on the way. 🎉');
  });

  it('passes brand, amount, status, and orderId context to the LLM prompt', async () => {
    let seen = '';
    const provider: LLMProvider = {
      async generateText(req) {
        seen = req.message;
        return ok('ok');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    await strategy.buildReply({
      intent: fakeIntent(),
      result: { orderId: 'order-999', status: 'delivered', trace: [] },
      order: { ...fakeOrder(), product: { ...fakeOrder().product, brand: 'steam' } },
    });

    expect(seen).toContain('steam');
    expect(seen).not.toContain('amazon');
    expect(seen).toContain('order-999');
    expect(seen).toContain('delivered');
  });

  it('falls back to a deterministic template when the LLM fails', async () => {
    const provider: LLMProvider = {
      async generateText() {
        return err(toUnknownDomainError('down'));
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

    expect(reply).toContain('Amazon');
    expect(reply).toContain('order-123');
    expect(reply).toContain('50');
  });

  it('falls back when the provider throws', async () => {
    const provider: LLMProvider = {
      async generateText() {
        throw new Error('boom');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

    expect(reply).toContain('Amazon');
  });

  it('falls back when the LLM returns empty or whitespace-only text', async () => {
    for (const emptyValue of ['', '   \n  ']) {
      const provider: LLMProvider = {
        async generateText() {
          return ok(emptyValue);
        },
        async generateWithTools() {
          throw new Error('not used');
        },
      };
      const strategy = new LlmReplyStrategy(provider);

      const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

      expect(reply).toContain('Amazon');
      expect(reply).toContain('order-123');
    }
  });
});
