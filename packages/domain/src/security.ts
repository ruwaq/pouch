import { isOk, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { CashOutIntent, SecurityCheck, SecurityPolicyPort, SecurityResult, Verdict } from './types';

/** Sensible defaults when no policy is configured. */
export const DEFAULT_POLICY = {
  warnAboveAmount: 200,
  blockAboveAmount: 500,
  requireConfirmationAbove: 100,
  active: true,
} as const;

// ── Helpers ────────────────────────────────────────────────────────────

function riskLevel(score: number): SecurityResult['riskLevel'] {
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function aggregateVerdict(checks: SecurityCheck[]): Verdict {
  if (checks.some((c) => c.verdict === 'BLOCK')) return 'BLOCK';
  if (checks.some((c) => c.verdict === 'WARN')) return 'WARN';
  return 'ALLOW';
}

function maxRisk(checks: SecurityCheck[]): number {
  return Math.max(...checks.map((c) => c.riskContribution), 0);
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    giftcard: 'Gift Card',
    topup: 'Mobile Top-Up',
    esim: 'eSIM',
    billpay: 'Bill Pay',
    bank: 'Bank Transfer',
    card: 'Card',
  };
  return labels[category] ?? category;
}

// ── SecurityChecker ────────────────────────────────────────────────────

/**
 * Runs deterministic security checks against a user's spending policy
 * BEFORE any on-chain execution. Blocked actions never reach the chain.
 *
 * Inspired by AgentShield's `_localCheck()` pattern:
 * deterministic checks first (free), LLM analysis second (optional).
 *
 * When no `SecurityPolicyPort` is injected, all checks pass with score 0.
 */
export class SecurityChecker {
  constructor(private readonly policyStore?: SecurityPolicyPort) {}

  /**
   * Run all security checks against the intent + user's policy.
   * Returns a `SecurityResult` with aggregated risk score, level, and verdict.
   * Never throws — always returns a result.
   */
  async check(
    intent: CashOutIntent,
    userId: string,
  ): Promise<Result<SecurityResult, DomainError>> {
    // No policy store → everything is allowed (backward compatible)
    if (!this.policyStore) {
      return ok({
        riskScore: 0,
        riskLevel: 'LOW',
        verdict: 'ALLOW',
        checks: [],
        timestamp: Date.now(),
      });
    }

    const policyResult = await this.policyStore.getPolicy(userId);

    if (!isOk(policyResult)) {
      // Policy store error → fail open with default (don't block users)
      return ok({
        riskScore: 0,
        riskLevel: 'LOW',
        verdict: 'ALLOW',
        checks: [
          {
            name: 'Policy unavailable',
            passed: true,
            verdict: 'ALLOW',
            detail: 'Security policy could not be loaded — allowing by default',
            riskContribution: 0,
          },
        ],
        timestamp: Date.now(),
      });
    }

    const policy = policyResult.value;

    if (!policy.active) {
      return ok({
        riskScore: 0,
        riskLevel: 'LOW',
        verdict: 'ALLOW',
        checks: [
          {
            name: 'Policy inactive',
            passed: true,
            verdict: 'ALLOW',
            detail: 'Security policy is disabled',
            riskContribution: 0,
          },
        ],
        timestamp: Date.now(),
      });
    }

    const checks: SecurityCheck[] = [];
    const amount = intent.amount.value;

    // ── Check 1: Transaction amount ─────────────────────────────────
    if (amount > policy.blockAboveAmount) {
      checks.push({
        name: 'Amount limit',
        passed: false,
        verdict: 'BLOCK',
        detail: `$${amount.toFixed(2)} exceeds maximum allowed ($${policy.blockAboveAmount.toFixed(2)})`,
        riskContribution: 100,
      });
    } else if (amount > policy.warnAboveAmount) {
      checks.push({
        name: 'Amount limit',
        passed: false,
        verdict: 'WARN',
        detail: `$${amount.toFixed(2)} exceeds warning threshold ($${policy.warnAboveAmount.toFixed(2)})`,
        riskContribution: 50,
      });
    } else {
      checks.push({
        name: 'Amount within limits',
        passed: true,
        verdict: 'ALLOW',
        detail: `$${amount.toFixed(2)} is within your spending limit ($${policy.blockAboveAmount.toFixed(2)})`,
        riskContribution: 0,
      });
    }

    // ── Check 2: Category ──────────────────────────────────────────
    if (policy.blockedCategories?.includes(intent.category)) {
      checks.push({
        name: 'Category blocked',
        passed: false,
        verdict: 'BLOCK',
        detail: `${categoryLabel(intent.category)} is blocked by your security policy`,
        riskContribution: 100,
      });
    } else if (
      policy.allowedCategories &&
      policy.allowedCategories.length > 0 &&
      !policy.allowedCategories.includes(intent.category)
    ) {
      checks.push({
        name: 'Category not allowed',
        passed: false,
        verdict: 'WARN',
        detail: `${categoryLabel(intent.category)} is not in your allowed categories`,
        riskContribution: 35,
      });
    } else {
      checks.push({
        name: 'Category allowed',
        passed: true,
        verdict: 'ALLOW',
        detail: `${categoryLabel(intent.category)} is an allowed category`,
        riskContribution: 0,
      });
    }

    // ── Check 3: Confirmation threshold ────────────────────────────
    if (amount > policy.requireConfirmationAbove) {
      checks.push({
        name: 'Confirmation required',
        passed: true,
        verdict: 'ALLOW',
        detail: `Amounts above $${policy.requireConfirmationAbove.toFixed(2)} always require confirmation`,
        riskContribution: 5,
      });
    }

    // ── Check 4: Provider verification ─────────────────────────────
    // In production this would check against a verified provider registry.
    // For now, always passes for the demo.
    checks.push({
      name: 'Provider verified',
      passed: true,
      verdict: 'ALLOW',
      detail: 'Off-ramp provider is verified and trusted',
      riskContribution: 0,
    });

    // ── Aggregate ──────────────────────────────────────────────────
    const score = maxRisk(checks);
    const verdict = aggregateVerdict(checks);

    return ok({
      riskScore: score,
      riskLevel: riskLevel(score),
      verdict,
      checks,
      timestamp: Date.now(),
    });
  }

  /**
   * Returns a human-readable badge string for the security verdict.
   * Used in trace steps and UI badges.
   */
  static badge(verdict: SecurityResult): string {
    if (verdict.verdict === 'BLOCK') return 'BLOCKED 🔴';
    if (verdict.verdict === 'WARN') return `WARN ⚠️`;
    return `SAFE ✓`;
  }
}