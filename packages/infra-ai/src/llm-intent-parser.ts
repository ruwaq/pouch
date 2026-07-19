import type { CashOutIntent, DomainError, IntentParserStrategy } from '@pouch/domain';
import { isOk, ok, type Result } from '@pouch/shared';

import type { LLMProvider, ToolDeclaration } from './llm-provider';
import { mapCashOutArgs } from './llm-tools';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * IntentParserStrategy backed by an LLM (function-calling).
 *
 * The LLM (Gemini 3.5 Flash) classifies the user's message into one of 5 tools:
 * cash_out, check_balance, search_products, help, or off_topic.
 *
 * Resilience: on ANY LLM failure (provider error, rate limit, plain-text reply,
 * or bad args), we fall back to the deterministic regex parser. The demo never
 * breaks because of the LLM.
 *
 * Design principle: TRUST THE LLM. The system prompt and tool descriptions are
 * the source of truth for intent classification. The regex fallback is ONLY for
 * when the LLM is unavailable — not for "correcting" the LLM's decisions.
 */
export class LlmIntentParser implements IntentParserStrategy {
  constructor(
    private readonly llm: LLMProvider,
    private readonly fallback: IntentParserStrategy,
    private readonly tools: ToolDeclaration[],
  ) {}

  async parse(message: string): Promise<Result<CashOutIntent, DomainError>> {
    const result = await this.llm.generateWithTools({
      message,
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: this.tools,
    });

    if (!isOk(result)) {
      return this.fallback.parse(message);
    }

    const fc = result.value.functionCall;

    // LLM returned plain text instead of a function call → fall back
    if (!fc) {
      return this.fallback.parse(message);
    }

    // Route to the correct handler based on the tool the LLM chose
    switch (fc.name) {
      case 'cash_out': {
        const mapped = mapCashOutArgs(fc.args);
        if (!isOk(mapped)) return this.fallback.parse(message);
        return mapped;
      }
      case 'check_balance':
        return ok({ action: 'check_balance', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
      case 'search_products': {
        const amount = typeof fc.args.amount === 'number' ? fc.args.amount : undefined;
        const brand = typeof fc.args.brand === 'string' ? fc.args.brand : undefined;
        return ok({ action: 'search_products', category: 'giftcard', amount: { value: amount ?? 50, currency: 'USD' }, ...(brand ? { brand } : {}) });
      }
      case 'help':
        return ok({ action: 'help', category: 'giftcard', amount: { value: 0, currency: 'USD' }, ...(typeof fc.args.topic === 'string' ? { brand: fc.args.topic } : {}) });
      case 'send':
        return ok({
          action: 'send',
          category: 'giftcard',
          amount: { value: typeof fc.args.amount === 'number' ? fc.args.amount : 0, currency: 'USD' },
          ...(typeof fc.args.token === 'string' ? { token: fc.args.token, brand: fc.args.token } : {}),
          ...(typeof fc.args.toWallet === 'string' ? { toLabel: fc.args.toWallet } : {}),
          ...(typeof fc.args.fromWallet === 'string' ? { fromLabel: fc.args.fromWallet } : {}),
          chainId: 42161,
        });
      case 'swap':
        return ok({
          action: 'swap',
          category: 'giftcard',
          amount: { value: typeof fc.args.amount === 'number' ? fc.args.amount : 0, currency: 'USD' },
          ...(typeof fc.args.token === 'string' ? { token: fc.args.token, brand: fc.args.token } : {}),
          ...(typeof fc.args.targetToken === 'string' ? { targetToken: fc.args.targetToken } : {}),
          chainId: 42161,
        });
      case 'off_topic':
        return ok({ action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
      default:
        // Unknown tool → fall back to regex
        return this.fallback.parse(message);
    }
  }
}