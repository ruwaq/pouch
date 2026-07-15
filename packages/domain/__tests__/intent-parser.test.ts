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

  it('returns a structured error when the message is truly unsupported', async () => {
    const parser = new IntentParser();

    const result = await parser.parse('What is the weather today?');

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error).toEqual({
      type: 'UNSUPPORTED_INTENT',
      message: 'I can help you cash out crypto, check your balance, or search for gift cards. Try saying "Cash out $50 to Amazon" or "Show my balance".',
    });
  });

  // ── New: regex parser handles greetings (off_topic) ──────────────────

  it('returns off_topic for "hola"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('hola');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('off_topic');
  });

  it('returns off_topic for "what can you do?"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('what can you do?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('off_topic');
  });

  it('returns off_topic for "help"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('help');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('off_topic');
  });

  it('returns off_topic for "hi"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('hi');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('off_topic');
  });

  // ── New: regex parser handles balance checks ────────────────────────

  it('returns check_balance for "show my balance"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('show my balance');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('check_balance');
  });

  it('returns check_balance for "how much do i have"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('how much do i have');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('check_balance');
  });

  it('returns check_balance for "balance"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('balance');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('check_balance');
  });

  // ── New: regex parser handles product search ────────────────────────

  it('returns search_products for "what gift cards do you have?"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('what gift cards do you have?');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('search_products');
  });

  it('returns search_products for "what can i buy"', async () => {
    const parser = new IntentParser();
    const result = await parser.parse('what can i buy');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toBe('search_products');
  });
});

describe('IntentParserStrategy', () => {
  it('is implemented by IntentParser so it can be substituted by an LLM parser', () => {
    const parser: IntentParserStrategy = new IntentParser();

    expect(typeof parser.parse).toBe('function');
  });
});
