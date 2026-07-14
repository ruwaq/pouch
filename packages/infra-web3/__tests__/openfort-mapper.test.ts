import { describe, expect, it } from 'vitest';

import { mapOpenfortError } from '../src/openfort/openfort-mapper';

describe('mapOpenfortError', () => {
  it('maps an authentication error to AGENT_WALLET_SETTLE_FAILED', () => {
    const error = new Error('401 Unauthorized: invalid secret key');
    const result = mapOpenfortError(error, 'settle payment');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.message).toContain('settle payment');
      expect(result.cause).toContain('401');
    }
  });

  it('maps a policy/sponsorship error to AGENT_WALLET_SETTLE_FAILED', () => {
    const error = new Error('policy not found: fes_invalid');
    const result = mapOpenfortError(error, 'sponsor transaction');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.cause).toContain('policy');
    }
  });

  it('maps a non-Error thrown value to AGENT_WALLET_SETTLE_FAILED with a generic cause', () => {
    const result = mapOpenfortError('something weird', 'resolve wallet');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.cause).toBe('unknown');
    }
  });

  it('includes the operation context in the message', () => {
    const result = mapOpenfortError(new Error('timeout'), 'fund wallet');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.message).toContain('fund wallet');
    }
  });
});
