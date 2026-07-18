import { describe, expect, it } from 'vitest';

import { SecurityChecker, DEFAULT_POLICY, type SecurityPolicyPort, type SpendingPolicy } from '@pouch/domain';
import { ok } from '@pouch/shared';

function createPolicyStore(overrides: Partial<SpendingPolicy> = {}): SecurityPolicyPort {
  return {
    async getPolicy() {
      return ok<SpendingPolicy>({
        ...DEFAULT_POLICY,
        ...overrides,
      });
    },
  };
}

const baseIntent = {
  action: 'cash_out' as const,
  category: 'giftcard' as const,
  brand: 'amazon',
  amount: { value: 50, currency: 'USD' as const },
};

describe('SecurityChecker', () => {
  it('returns ALLOW with score 0 when no policy store is injected', async () => {
    const checker = new SecurityChecker();
    const result = await checker.check(baseIntent, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('ALLOW');
    expect(result.value.riskScore).toBe(0);
    expect(result.value.riskLevel).toBe('LOW');
    expect(result.value.checks).toHaveLength(0);
  });

  it('returns ALLOW when amount is within limits', async () => {
    const checker = new SecurityChecker(createPolicyStore());
    const result = await checker.check(
      { ...baseIntent, amount: { value: 50, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('ALLOW');
    expect(result.value.riskScore).toBeLessThan(40);
    expect(result.value.riskLevel).toBe('LOW');
    expect(result.value.checks.some((c) => c.name === 'Amount within limits' && c.passed)).toBe(true);
  });

  it('returns WARN when amount exceeds warnAboveAmount', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ warnAboveAmount: 100, blockAboveAmount: 500 }),
    );
    const result = await checker.check(
      { ...baseIntent, amount: { value: 250, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('WARN');
    expect(result.value.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.value.riskLevel).toBe('MEDIUM');
    expect(result.value.checks.some((c) => c.name === 'Amount limit' && c.verdict === 'WARN')).toBe(
      true,
    );
  });

  it('returns BLOCK when amount exceeds blockAboveAmount', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ blockAboveAmount: 500 }),
    );
    const result = await checker.check(
      { ...baseIntent, amount: { value: 600, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('BLOCK');
    expect(result.value.riskScore).toBe(100);
    expect(result.value.riskLevel).toBe('CRITICAL');
    expect(result.value.checks.some((c) => c.name === 'Amount limit' && c.verdict === 'BLOCK')).toBe(
      true,
    );
  });

  it('returns BLOCK when category is blocked', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ blockedCategories: ['bank'] }),
    );
    const result = await checker.check(
      { ...baseIntent, category: 'bank' },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('BLOCK');
    expect(result.value.checks.some((c) => c.name === 'Category blocked' && c.verdict === 'BLOCK')).toBe(
      true,
    );
  });

  it('returns WARN when category is not in allowed list', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ allowedCategories: ['giftcard', 'topup'] }),
    );
    const result = await checker.check(
      { ...baseIntent, category: 'bank' },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('WARN');
    expect(result.value.checks.some((c) => c.name === 'Category not allowed' && c.verdict === 'WARN')).toBe(
      true,
    );
  });

  it('aggregates risk score as the maximum of all checks', async () => {
    // WARN on amount (50) + WARN on category (35) → max risk = 50
    const checker = new SecurityChecker(
      createPolicyStore({
        warnAboveAmount: 100,
        blockAboveAmount: 500,
        allowedCategories: ['giftcard', 'topup'],
      }),
    );
    const result = await checker.check(
      { ...baseIntent, category: 'bank', amount: { value: 250, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.riskScore).toBe(50); // max of 50 (amount WARN) and 35 (category WARN)
    expect(result.value.verdict).toBe('WARN');
  });

  it('BLOCK takes precedence over WARN in aggregate verdict', async () => {
    // WARN on amount + BLOCK on category → BLOCK
    const checker = new SecurityChecker(
      createPolicyStore({
        warnAboveAmount: 100,
        blockAboveAmount: 500,
        blockedCategories: ['bank'],
      }),
    );
    const result = await checker.check(
      { ...baseIntent, category: 'bank', amount: { value: 250, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('BLOCK');
    expect(result.value.riskScore).toBe(100);
  });

  it('returns ALLOW when policy is inactive', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ active: false }),
    );
    const result = await checker.check(
      { ...baseIntent, amount: { value: 999, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdict).toBe('ALLOW');
    expect(result.value.riskScore).toBe(0);
  });

  it('includes a confirmation threshold check for large amounts', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ requireConfirmationAbove: 100 }),
    );
    const result = await checker.check(
      { ...baseIntent, amount: { value: 150, currency: 'USD' } },
      'user-1',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.some((c) => c.name === 'Confirmation required')).toBe(true);
  });

  it('includes a provider verification check', async () => {
    const checker = new SecurityChecker(createPolicyStore());
    const result = await checker.check(baseIntent, 'user-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.some((c) => c.name === 'Provider verified')).toBe(true);
  });

  it('sets riskLevel correctly for each threshold', async () => {
    const checker = new SecurityChecker(
      createPolicyStore({ warnAboveAmount: 0, blockAboveAmount: 1000 }),
    );

    // Score 0 → LOW
    const low = await checker.check(
      { ...baseIntent, amount: { value: 0, currency: 'USD' } },
      'user-1',
    );
    expect(low.ok && low.value.riskLevel).toBe('LOW');

    // Score 50 → MEDIUM (warnAboveAmount triggered)
    const med = await checker.check(
      { ...baseIntent, amount: { value: 1, currency: 'USD' } },
      'user-1',
    );
    expect(med.ok && med.value.riskLevel).toBe('MEDIUM');
  });

  describe('SecurityChecker.badge()', () => {
    it('returns SAFE ✓ for ALLOW', () => {
      const verdict = { riskScore: 0, riskLevel: 'LOW' as const, verdict: 'ALLOW' as const, checks: [], timestamp: 0 };
      expect(SecurityChecker.badge(verdict)).toBe('SAFE ✓');
    });

    it('returns WARN ⚠️ for WARN', () => {
      const verdict = { riskScore: 50, riskLevel: 'MEDIUM' as const, verdict: 'WARN' as const, checks: [], timestamp: 0 };
      expect(SecurityChecker.badge(verdict)).toBe('WARN ⚠️');
    });

    it('returns BLOCKED 🔴 for BLOCK', () => {
      const verdict = { riskScore: 100, riskLevel: 'CRITICAL' as const, verdict: 'BLOCK' as const, checks: [], timestamp: 0 };
      expect(SecurityChecker.badge(verdict)).toBe('BLOCKED 🔴');
    });
  });
});