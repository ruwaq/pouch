import { describe, expect, it } from 'vitest';

import { IntentParser } from '../src/intent-parser';
import type { IntentParserStrategy } from '../src/intent-parser';

describe('IntentParser', () => {
  it('parses a gift card cash-out request from natural language', async () => {
    const parser = new IntentParser();

    const result = await parser.parse('Cash out $50 to Amazon');

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value).toEqual({
      action: 'cash_out',
      category: 'giftcard',
      brand: 'amazon',
      amount: {
        value: 50,
        currency: 'USD',
      },
    });
  });

  it('returns a structured error when the amount is missing', async () => {
    const parser = new IntentParser();

    const result = await parser.parse('Cash out to Amazon');

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error).toEqual({
      type: 'INVALID_INTENT_AMOUNT',
      message: 'Could not determine the USD amount to cash out.',
    });
  });

  it('returns a structured error when the message is not a supported cash-out request', async () => {
    const parser = new IntentParser();

    const result = await parser.parse('What is the weather today?');

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error).toEqual({
      type: 'UNSUPPORTED_INTENT',
      message: 'Only cash-out purchase requests are supported right now.',
    });
  });
});

describe('IntentParserStrategy', () => {
  it('is implemented by IntentParser so it can be substituted by an LLM parser', () => {
    const parser: IntentParserStrategy = new IntentParser();

    expect(typeof parser.parse).toBe('function');
  });
});
