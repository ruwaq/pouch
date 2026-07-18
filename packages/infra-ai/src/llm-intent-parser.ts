import type { CashOutIntent, DomainError, IntentParserStrategy } from '@pouch/domain';
import { isOk, ok, type Result } from '@pouch/shared';

import type { LLMProvider, ToolDeclaration } from './llm-provider';
import { mapCashOutArgs } from './llm-tools';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * Patterns for operations Pouch deterministically does NOT support.
 * When the message matches one of these, we skip the LLM entirely and
 * return a helpful error immediately. This is faster and more reliable
 * than hoping the LLM picks the right tool — especially for edge cases
 * like "envia" (Spanish for "send") which Gemini 3.5 Flash sometimes
 * misclassifies as check_balance or cash_out.
 */
const UNSUPPORTED_PATTERN = /\b(send|transfer|withdraw|swap|exchange|convert|bridge|stake|lend|borrow|deposit|unwrap|wrap|env[ií]a[r]?|mandar|transferir|intercambiar|mover\s+a)\b/i;

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
    // ── Deterministic pre-check for unsupported operations ──────────
    //     Skip the LLM for known-bad inputs like "send to wallet",
    //     "swap tokens", "bridge to chain". These are cheap to detect
    //     with regex and Gemini 3.5 Flash sometimes misclassifies them.
    if (UNSUPPORTED_PATTERN.test(message)) {
      return {
        ok: false,
        error: {
          type: 'UNSUPPORTED_INTENT',
          message: "Pouch is a crypto off-ramp agent — I convert crypto to gift cards, mobile top-ups, and eSIMs. I don't support sending crypto to wallets, swapping tokens, or transferring between chains. Try 'Cash out $50 to Amazon' or 'Show my balance'.",
        },
      };
    }

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
        const amount = typeof fc.args.amount === 'number' ? fc.args.amount : undefined;
        const brand = typeof fc.args.brand === 'string' ? fc.args.brand : undefined;
        return ok({ action: 'search_products', category: 'giftcard', amount: { value: amount ?? 50, currency: 'USD' }, ...(brand ? { brand } : {}) });
      }
      case 'help':
        return ok({ action: 'help', category: 'giftcard', amount: { value: 0, currency: 'USD' }, ...(typeof fc.args.topic === 'string' ? { brand: fc.args.topic } : {}) });
      case 'off_topic':
        return ok({ action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
      default:
        return this.fallback.parse(message);
    }
  }
}
