import { describe, expect, it } from 'vitest';

import { IntentParser, toUnknownDomainError } from '@pouch/domain';
import { err, ok } from '@pouch/shared';

import { LlmIntentParser } from '../src/llm-intent-parser';
import type { LLMProvider } from '../src/llm-provider';
import { POUCH_TOOL_DECLARATIONS } from '../src/llm-tools';

function fakeProvider(respond: () => ReturnType<LLMProvider['generateWithTools']>): LLMProvider & {
  calledWith: string[];
} {
  const calledWith: string[] = [];
  return {
    calledWith,
    async generateWithTools(req) {
      calledWith.push(req.message);
      return respond();
    },
    async generateText() {
      throw new Error('not used');
    },
  };
}

describe('LlmIntentParser', () => {
  it('returns a CashOutIntent when the LLM calls cash_out', async () => {
    const provider = fakeProvider(async () =>
      ok({
        functionCall: { name: 'cash_out', args: { category: 'giftcard', brand: 'steam', amount: 20 } },
      }),
    );
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('turn my leftover ETH into steam credit');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      action: 'cash_out',
      category: 'giftcard',
      brand: 'steam',
      amount: { value: 20, currency: 'USD' },
    });
  });

  it('handles off_topic function calls without falling back to regex', async () => {
    const provider = fakeProvider(async () => ok({ functionCall: { name: 'off_topic', args: {} } }));
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('hello');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('off_topic');
  });

  it('handles check_balance function calls', async () => {
    const provider = fakeProvider(async () => ok({ functionCall: { name: 'check_balance', args: {} } }));
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('how much do I have');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('check_balance');
  });

  it('falls back to regex when the LLM returns plain text (no function call)', async () => {
    const provider = fakeProvider(async () => ok({ text: 'Hello! How can I help?' }));
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('cash out $50 to amazon');

    expect(result.ok).toBe(true);
  });

  it('falls back to regex when the LLM provider returns an error', async () => {
    const provider = fakeProvider(async () => err(toUnknownDomainError('network down')));
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('cash out $50 to amazon');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brand).toBe('amazon');
  });

  it('returns the regex error when neither LLM nor regex can parse', async () => {
    const provider = fakeProvider(async () => ok({ text: 'hi there' }));
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('just saying hello');

    expect(result.ok).toBe(false);
  });
});
