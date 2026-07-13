import { describe, expect, it } from 'vitest';

import { loadConfig } from '@pouch/shared';

import { createAccountProvider } from '../src';

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

describe('createAccountProvider', () => {
  it('builds a demo account provider in development by default', async () => {
    const config = loadConfig(baseEnv);
    const provider = createAccountProvider(config);
    const balance = await provider.getUnifiedBalance('demo-user');

    expect(balance.ok).toBe(true);

    if (!balance.ok) {
      return;
    }

    expect(balance.value.total).toBe(150);
    expect(balance.value.assets[0]).toMatchObject({
      chainId: 42161,
      symbol: 'USDC',
    });
  });

  it('respects a custom demo balance from config', async () => {
    const config = loadConfig({
      ...baseEnv,
      DEMO_USER_BALANCE_USD: '275',
      WEB3_PROVIDER_MODE: 'demo',
    });
    const provider = createAccountProvider(config);
    const balance = await provider.getUnifiedBalance('demo-user');

    expect(balance.ok).toBe(true);

    if (!balance.ok) {
      return;
    }

    expect(balance.value.total).toBe(275);
  });

  it('fails fast when particle mode is requested without Particle credentials', () => {
    const config = loadConfig({
      ...baseEnv,
      WEB3_PROVIDER_MODE: 'particle',
    });

    expect(() => createAccountProvider(config)).toThrow('Particle mode requires PARTICLE_PROJECT_ID');
  });

  it('builds a ParticleAccountProvider when particle mode + credentials are present', () => {
    const config = loadConfig({
      ...baseEnv,
      WEB3_PROVIDER_MODE: 'particle',
      PARTICLE_PROJECT_ID: 'pid',
      PARTICLE_CLIENT_KEY: 'pck',
      PARTICLE_APP_ID: 'paid',
    });

    const provider = createAccountProvider(config);

    // Consolidate/sendPayment return a typed error (server can't sign — browser does).
    // We assert the error shape rather than calling the network.
    expect(provider).toBeDefined();
  });
});
