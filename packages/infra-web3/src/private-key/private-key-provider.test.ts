import { describe, expect, it } from 'vitest';

import { PrivateKeyAccountProvider } from './private-key-provider';

/**
 * C5 — Remove the hardcoded wallet-address bypass.
 *
 * Scope of these tests: the SECURITY_BLOCKED whitelist gate must be authoritative.
 * Two hardcoded addresses (commits 9ded248, 28c983d) were injected as escape
 * hatches into BOTH the balance path and the send path. Removing the bypass
 * means:
 *   - sendPayment() rejects those addresses (they are not derived from any seed)
 *   - resolveSender() no longer falls back to "first wallet with a key"
 *   - an invalid SEED_PHRASE_* fails fast in production, is skipped in dev
 *
 * NOTE on the balance test:
 *   The bypass adds ARB assets on Arbitrum (chainId 42161) for the two hardcoded
 *   addresses. A *separate* L2 code block (out of scope for C5) injects AVAX on
 *   Avalanche (chainId 43114) under the same "Wallet 3"/"Wallet 4" labels. The
 *   labels alone are therefore ambiguous, so we assert specifically that no
 *   chainId=42161 ARB asset is labelled "Wallet 3"/"Wallet 4". With a throwaway
 *   key the on-chain balance is 0, so getUnifiedBalance() early-returns before
 *   reaching the bypass — this test is a regression guard (not a fail-before
 *   test) and makes no network calls.
 */

// The two addresses that previously bypassed the whitelist gate.
const VICTIM_ADDR = '0x4c7eB03cb8c77A27a55c691D74Ee27C1A57bd619';
const VICTIM_ADDR_2 = '0x4DC637B52827fD797Bf480b62093a210Cb471581';

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    PRIVATE_KEY: '0x' + '11'.repeat(32),
    SETTLEMENT_CHAIN_ID: 42161,
    SUPPORTED_CHAINS: [42161],
    NODE_ENV: 'development',
    ...overrides,
  } as never;
}

describe('PrivateKeyAccountProvider security (C5)', () => {
  it('blocks sendPayment to the first previously-bypassed address', async () => {
    const provider = new PrivateKeyAccountProvider(makeConfig());
    const result = await provider.sendPayment({
      from: 'Wallet 1',
      to: VICTIM_ADDR,
      amount: { value: 1, currency: 'USD' },
      chainId: 42161,
      token: 'ARB',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('SECURITY_BLOCKED');
    }
  });

  it('blocks sendPayment to the second previously-bypassed address', async () => {
    const provider = new PrivateKeyAccountProvider(makeConfig());
    const result = await provider.sendPayment({
      from: 'Wallet 1',
      to: VICTIM_ADDR_2,
      amount: { value: 1, currency: 'USD' },
      chainId: 42161,
      token: 'ARB',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('SECURITY_BLOCKED');
    }
  });

  it('throws on an invalid seed phrase in production', () => {
    const config = makeConfig({
      SEED_PHRASE_1: 'not a valid mnemonic at all',
      NODE_ENV: 'production',
    });
    expect(() => new PrivateKeyAccountProvider(config)).toThrow(/SEED_PHRASE_1/);
  });

  it('skips an invalid seed phrase in development (no throw)', () => {
    const config = makeConfig({ SEED_PHRASE_1: 'not a valid mnemonic at all' });
    expect(() => new PrivateKeyAccountProvider(config)).not.toThrow();
  });

  it('resolveSender returns undefined when no wallet matches (strict)', () => {
    const provider = new PrivateKeyAccountProvider(makeConfig());
    // resolveSender is private — access via cast. Returns undefined now
    // (previously: fell back to "first wallet with a private key").
    const result = (
      provider as unknown as { resolveSender: (u: string) => unknown }
    ).resolveSender('nonexistent-user');
    expect(result).toBeUndefined();
  });

  it('does NOT inject the hardcoded addresses as ARB assets on Arbitrum', async () => {
    const provider = new PrivateKeyAccountProvider(makeConfig());
    const result = await provider.getUnifiedBalance('any-user');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The C5 bypass added ARB on chainId 42161 labelled "Wallet 3"/"Wallet 4".
      // (The separate AVAX-on-43114 "Wallet 3/4" block is L2 / out of scope.)
      const arbInjections = (result.value.assets ?? []).filter(
        (a) => a.chainId === 42161 && a.symbol === 'ARB',
      );
      const injectedLabels = arbInjections.map((a) => a.walletLabel).filter(Boolean);
      expect(injectedLabels).not.toContain('Wallet 3');
      expect(injectedLabels).not.toContain('Wallet 4');
    }
  });
});
