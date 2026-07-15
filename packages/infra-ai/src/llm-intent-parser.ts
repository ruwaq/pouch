import type { CashOutIntent, DomainError, IntentParserStrategy } from '@pouch/domain';
import { isOk, ok, type Result } from '@pouch/shared';

import type { LLMProvider, ToolDeclaration } from './llm-provider';
import { mapCashOutArgs } from './llm-tools';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * IntentParserStrategy backed by an LLM (function-calling), with a deterministic
 * regex parser as the final fallback. Resilience rule (spec §7): on ANY LLM
 * failure — provider error, non-cash_out function, plain-text reply, or bad
 * cash_out args — we fall back to the regex parser. The demo never breaks
 * because of the LLM.
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
    if (!fc) {
      return this.fallback.parse(message);
    }

    // Handle all tool types
    switch (fc.name) {
      case 'cash_out': {
        const mapped = mapCashOutArgs(fc.args);
        if (!isOk(mapped)) return this.fallback.parse(message);
        return mapped;
      }
      case 'check_balance':
        return ok({ action: 'check_balance', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
      case 'search_products': {
        const amount = typeof fc.args.amount === 'number' ? fc.args.amount : 50;
        const brand = typeof fc.args.brand === 'string' ? fc.args.brand : undefined;
        return ok({ action: 'search_products', category: 'giftcard', amount: { value: amount, currency: 'USD' }, ...(brand ? { brand } : {}) });
      }
      case 'off_topic':
        return ok({ action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
      default:
        return this.fallback.parse(message);
    }
  }
}
