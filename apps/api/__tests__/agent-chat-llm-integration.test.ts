import { describe, expect, it } from 'vitest';

import {
  CashOutExecutor,
  IntentParser,
  OffRampRouter,
  toUnknownDomainError,
  type AccountProvider,
  type CashOutIntent,
  type IntentParserStrategy,
  type LoggerPort,
  type OffRampProvider,
  type OrderRequest,
  type Product,
  type ReplyStrategy,
} from '@pouch/domain';
import { err, ok } from '@pouch/shared';
import { LlmIntentParser, LlmReplyStrategy, POUCH_TOOL_DECLARATIONS, type LLMProvider } from '@pouch/infra-ai';

import { AgentChatService } from '../src/services/agent-chat-service';
import { BalanceService } from '../src/services/balance-service';
import { MemoryOrderRepository } from '../src/support/memory-order-repository';

/**
 * Integration test for the seam Phase 2 added: AgentChatService composing with
 * the REAL LlmIntentParser + LlmReplyStrategy (only the LLM wire call is faked).
 * Guards the async-parse plumbing + reply-strategy injection — the one
 * integration point not covered by the isolated unit tests.
 *
 * The off-ramp provider returns a product whose brand mirrors the parsed
 * intent's brand, so the order's product.brand matches what was requested
 * (and the order-first reply precedence yields the expected brand).
 */

class MirroringProvider implements OffRampProvider {
  readonly id = 'stub-offramp';
  readonly name = 'Stub';
  readonly categories = ['giftcard'] as const;

  private productFor(brand: string): Product {
    return {
      id: `${brand}-us`,
      providerId: this.id,
      name: `${brand} US`,
      brand,
      category: 'giftcard',
      denominations: [10, 20, 50, 100],
    };
  }

  async searchProducts(query: string): ReturnType<OffRampProvider['searchProducts']> {
    return ok([this.productFor(query || 'amazon')]);
  }

  async getQuote(
    product: Product,
    amount: { value: number; currency: 'USD' },
  ): ReturnType<OffRampProvider['getQuote']> {
    return ok({
      providerId: this.id,
      productId: product.id,
      faceValue: amount,
      paymentAmount: amount,
      estimatedDelivery: 'instant',
    });
  }

  async createOrder(request: OrderRequest): ReturnType<OffRampProvider['createOrder']> {
    const brand = request.productId.replace(/-us$/, '');
    return ok({
      id: `stub-${request.idempotencyKey}`,
      providerOrderId: `po-${request.idempotencyKey}`,
      providerId: this.id,
      ...(request.userId ? { userId: request.userId } : {}),
      product: this.productFor(brand),
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
    throw new Error('not used');
  }
}

const stubAccountProvider: AccountProvider = {
  async getUnifiedBalance() {
    return ok({ total: 100, assets: [], requiresConsolidation: false });
  },
  async consolidate() {
    return ok({ txHash: '0xconsolidate' });
  },
  async sendPayment() {
    return ok({ txHash: '0xpay' });
  },
};

const logger: LoggerPort = { info() {}, error() {} };

/**
 * Fake LLMProvider: programmable function-call + text responses. Tools-call and
 * text-call states are tracked INDEPENDENTLY because the parser calls
 * generateWithTools while the reply strategy calls generateText — they must not
 * clobber each other.
 */
function fakeLlm(): LLMProvider & {
  setFunctionCall(name: string, args: Record<string, unknown>): void;
  setText(text: string): void;
  failNext(): void;
} {
  let functionCall: { name: string; args: Record<string, unknown> } | undefined;
  let text: string | undefined;
  let fail = false;
  return {
    async generateWithTools() {
      if (fail) {
        return err(toUnknownDomainError('simulated LLM outage'));
      }
      return functionCall ? ok({ functionCall }) : ok({ text: text ?? '' });
    },
    async generateText() {
      if (fail) {
        return err(toUnknownDomainError('simulated LLM outage'));
      }
      return ok(text ?? 'LLM conversational reply.');
    },
    setFunctionCall(name, args) {
      functionCall = { name, args };
    },
    setText(nextText) {
      text = nextText;
    },
    failNext() {
      fail = true;
    },
  };
}

/** A regex strategy that always errors — used to PROVE the LLM path is taken. */
const neverRegex: IntentParserStrategy = {
  async parse(): ReturnType<IntentParserStrategy['parse']> {
    return err(toUnknownDomainError('regex fallback should not have run'));
  },
};

function buildService(parser: IntentParserStrategy, replyStrategy?: ReplyStrategy): AgentChatService {
  const providers = [new MirroringProvider()];
  const repository = new MemoryOrderRepository();
  const router = new OffRampRouter(providers);
  const executor = new CashOutExecutor(router, providers, stubAccountProvider, repository, logger);
  const balanceService = new BalanceService(stubAccountProvider);
  return replyStrategy
    ? new AgentChatService(parser, executor, repository, balanceService, providers, replyStrategy)
    : new AgentChatService(parser, executor, repository, balanceService, providers);
}

describe('AgentChatService + LLM integration', () => {
  it('uses the LLM-parsed intent end-to-end and shows the confirmation prompt', async () => {
    const llm = fakeLlm();
    // Free-form message the regex parser CANNOT parse — only the LLM can.
    llm.setFunctionCall('cash_out', { category: 'giftcard', brand: 'steam', amount: 20 });
    llm.setText('Ready to cash out $20.00 to Steam. Say yes to confirm! 🎮');

    const parser = new LlmIntentParser(llm, neverRegex, POUCH_TOOL_DECLARATIONS);
    const replyStrategy = new LlmReplyStrategy(llm);
    const service = buildService(parser, replyStrategy);

    const result = await service.handleMessage('turn my leftover ETH into steam credit', 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // LLM intent was used (brand 'steam', amount 20) — proves the async LLM parse threaded through.
    const intent = result.value.intent as CashOutIntent;
    expect(intent.brand).toBe('steam');
    expect(intent.amount.value).toBe(20);
    // New flow: LLM-generated confirmation prompt (via ReplyStrategy).
    expect(result.value.reply).toContain('Steam');
    expect(result.value.reply).toContain('20');
    expect(result.value.orderId).toBe('');
  });

  it('falls back to regex parse and shows confirmation prompt when the LLM fails', async () => {
    const llm = fakeLlm();
    llm.failNext(); // both generateWithTools and generateText return err

    const parser = new LlmIntentParser(llm, new IntentParser(), POUCH_TOOL_DECLARATIONS);
    const replyStrategy = new LlmReplyStrategy(llm);
    const service = buildService(parser, replyStrategy);

    const result = await service.handleMessage('cash out $50 to amazon', 'user-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Regex parse won (canonical phrasing).
    const intent = result.value.intent as CashOutIntent;
    expect(intent.brand).toBe('amazon');
    expect(intent.amount.value).toBe(50);
    // New flow: confirmation prompt.
    expect(result.value.reply).toContain('Confirm?');
  });
});
