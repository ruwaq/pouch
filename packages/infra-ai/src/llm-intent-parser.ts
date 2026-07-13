import type { CashOutIntent, DomainError, IntentParserStrategy } from '@pouch/domain';
import { isOk, type Result } from '@pouch/shared';

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
    if (!fc || fc.name !== 'cash_out') {
      return this.fallback.parse(message);
    }

    const mapped = mapCashOutArgs(fc.args);
    if (!isOk(mapped)) {
      return this.fallback.parse(message);
    }

    return mapped;
  }
}
