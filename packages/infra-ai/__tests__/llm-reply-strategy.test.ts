import { describe, expect, it } from 'vitest';

import type { CashOutIntent, CashOutResult, Order, ReplyContext } from '@pouch/domain';
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

    const reply = await strategy.buildReply({
      scenario: 'success',
      intent: fakeIntent(),
      result: fakeResult(),
      order: fakeOrder(),
    });

    expect(reply).toBe('Done! Your $50 Amazon card is on the way. 🎉');
  });

  it('passes brand, amount, and orderId context to the LLM prompt', async () => {
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
      scenario: 'success',
      intent: fakeIntent(),
      result: { orderId: 'order-999', status: 'delivered', trace: [] },
      order: { ...fakeOrder(), product: { ...fakeOrder().product, brand: 'steam' } },
    });

    expect(seen).toContain('steam');
    expect(seen).not.toContain('amazon');
    expect(seen).toContain('order-999');
    expect(seen).toContain('completed successfully');
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

    const reply = await strategy.buildReply({
      scenario: 'success',
      intent: fakeIntent(),
      result: fakeResult(),
      order: fakeOrder(),
    });

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

    const reply = await strategy.buildReply({
      scenario: 'success',
      intent: fakeIntent(),
      result: fakeResult(),
      order: fakeOrder(),
    });

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

      const reply = await strategy.buildReply({
        scenario: 'success',
        intent: fakeIntent(),
        result: fakeResult(),
        order: fakeOrder(),
      });

      expect(reply).toContain('Amazon');
      expect(reply).toContain('order-123');
    }
  });

  it('generates a greeting for the greeting scenario', async () => {
    const provider: LLMProvider = {
      async generateText() {
        return ok("Hey! I'm Pouch, your crypto cash-out buddy.");
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({
      scenario: 'greeting',
      intent: { action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
    });

    expect(reply).toContain('Pouch');
  });

  it('generates a balance reply for the balance scenario', async () => {
    const provider: LLMProvider = {
      async generateText() {
        return ok('You have $100 across 2 assets.');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({
      scenario: 'balance',
      intent: { action: 'check_balance', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
      balance: {
        total: 100,
        assets: [
          { chainId: 42161, symbol: 'USDC', amount: 50, usdValue: 50 },
          { chainId: 8453, symbol: 'ETH', amount: 0.02, usdValue: 50 },
        ],
      },
    });

    expect(reply).toContain('100');
  });

  it('falls back to template for greeting when LLM fails', async () => {
    const provider: LLMProvider = {
      async generateText() {
        throw new Error('boom');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({
      scenario: 'greeting',
      intent: { action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
    });

    expect(reply).toContain('Pouch');
    expect(reply).toContain('cash-out');
  });

  it('passes conversation history as multi-turn contents with Gemini roles (agent→model)', async () => {
    let capturedContents: Array<{ role: 'user' | 'model'; text: string }> | undefined;
    const provider: LLMProvider = {
      async generateText(req) {
        capturedContents = req.contents;
        return ok('reply');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const context: ReplyContext = {
      scenario: 'greeting',
      intent: { action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
      history: [
        { role: 'user', content: 'hola' },
        { role: 'agent', content: 'hi there' },
      ],
    };

    await strategy.buildReply(context);

    expect(capturedContents).toBeDefined();
    expect(capturedContents).toEqual([
      { role: 'user', text: 'hola' },
      { role: 'model', text: 'hi there' },
    ]);
  });
});