import { describe, expect, it } from 'vitest';

import { mapCashOutArgs, POUCH_TOOL_DECLARATIONS } from '../src/llm-tools';

describe('mapCashOutArgs', () => {
  it('maps a complete cash_out argument object into a CashOutIntent', () => {
    const result = mapCashOutArgs({ category: 'giftcard', brand: 'amazon', amount: 50 });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value).toEqual({
      action: 'cash_out',
      category: 'giftcard',
      brand: 'amazon',
      amount: { value: 50, currency: 'USD' },
    });
  });

  it('defaults category to giftcard when missing or unrecognized', () => {
    const missing = mapCashOutArgs({ amount: 25 });
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(missing.value.category).toBe('giftcard');
    expect(missing.value.brand).toBeUndefined();

    const unrecognized = mapCashOutArgs({ category: 'nonsense', amount: 25 });
    expect(unrecognized.ok).toBe(true);
    if (!unrecognized.ok) return;
    expect(unrecognized.value.category).toBe('giftcard');
  });

  it('lowercases and trims the brand', () => {
    const result = mapCashOutArgs({ category: 'giftcard', brand: '  Steam ', amount: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brand).toBe('steam');
  });

  it('returns INVALID_INTENT_AMOUNT when amount is missing or non-positive', () => {
    const missing = mapCashOutArgs({ category: 'giftcard' });
    const zero = mapCashOutArgs({ category: 'giftcard', amount: 0 });
    const negative = mapCashOutArgs({ category: 'giftcard', amount: -5 });

    expect(missing.ok).toBe(false);
    expect(zero.ok).toBe(false);
    expect(negative.ok).toBe(false);

    if (missing.ok) return;
    expect(missing.error.type).toBe('INVALID_INTENT_AMOUNT');
  });

  it('rounds fractional amounts to 2 decimals', () => {
    const result = mapCashOutArgs({ amount: 12.345 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount.value).toBe(12.35);
  });
});

describe('POUCH_TOOL_DECLARATIONS', () => {
  it('declares the four Pouch functions', () => {
    const names = POUCH_TOOL_DECLARATIONS.map((t) => t.name);
    expect(names).toEqual(['cash_out', 'check_balance', 'search_products', 'off_topic']);
  });
});
