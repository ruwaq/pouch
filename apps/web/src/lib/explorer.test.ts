import { describe, expect, it } from 'vitest';

import { explorerAddressUrl, shortAddress } from './explorer';

describe('explorerAddressUrl', () => {
  it('returns Arbiscan URL for Arbitrum (42161)', () => {
    expect(explorerAddressUrl(42161, '0xabcDEF0123456789abcdef0123456789ABCDEF01'))
      .toBe('https://arbiscan.io/address/0xabcDEF0123456789abcdef0123456789ABCDEF01');
  });

  it('returns Basescan URL for Base (8453)', () => {
    expect(explorerAddressUrl(8453, '0xabc'))
      .toBe('https://basescan.org/address/0xabc');
  });

  it('returns Snowtrace URL for Avalanche (43114)', () => {
    expect(explorerAddressUrl(43114, '0xabc'))
      .toBe('https://snowtrace.io/address/0xabc');
  });

  it('returns null for unsupported chain (no fallback to Arbiscan)', () => {
    expect(explorerAddressUrl(99999, '0xabc')).toBeNull();
  });
});

describe('shortAddress', () => {
  it('truncates a full address to 0xAbcd…F01 format', () => {
    expect(shortAddress('0xAbcDEF0123456789abcdef0123456789ABCDEF01'))
      .toBe('0xAbcD…F01');
  });

  it('returns the address as-is if too short to truncate', () => {
    expect(shortAddress('0xAbcd')).toBe('0xAbcd');
  });
});
