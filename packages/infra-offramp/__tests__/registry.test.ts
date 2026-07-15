import { describe, expect, it } from 'vitest';

import { loadConfig } from '@pouch/shared';

import { buildOffRampProviders } from '../src';

const baseEnv = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SETTLEMENT_CHAIN_ID: '42161',
  SUPPORTED_CHAINS: '42161,8453',
  OFFRAMP_PROVIDERS: 'bitrefill',
  BITREFILL_API_KEY: 'br_test_key',
  BITREFILL_BASE_URL: 'https://api.bitrefill.com/v2',
  DATABASE_URL: 'postgresql://pouch:pouch@localhost:5432/pouch',
  JWT_SECRET: '12345678901234567890123456789012',
  WEBHOOK_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
};

describe('buildOffRampProviders', () => {
  it('builds the Bitrefill adapter when it is configured', () => {
    const config = loadConfig(baseEnv);

    const providers = buildOffRampProviders(config);

    expect(providers).toHaveLength(1);
    expect(providers[0]?.id).toBe('bitrefill');
  });

  it('returns an empty array when no configured providers can be built', () => {
    const config = loadConfig({
      ...baseEnv,
      OFFRAMP_PROVIDERS: 'bitrefill',
      BITREFILL_API_KEY: '',
    });

    const providers = buildOffRampProviders(config);
    expect(providers).toHaveLength(0);
  });

  it('fails fast when the settlement chain is unsupported', () => {
    const config = loadConfig({
      ...baseEnv,
      SETTLEMENT_CHAIN_ID: '10',
    });

    expect(() => buildOffRampProviders(config)).toThrow('Unsupported settlement chain');
  });
});
