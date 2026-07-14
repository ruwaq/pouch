import { describe, expect, it } from 'vitest';

import type { LoggerPort } from '@pouch/domain';
import { loadConfig } from '@pouch/shared';

import { createAgentWallet } from '../src/factory';

const noopLogger: LoggerPort = { info() {}, error() {} };

const baseEnv = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SETTLEMENT_CHAIN_ID: '42161',
  SUPPORTED_CHAINS: '42161,8453',
  OFFRAMP_PROVIDERS: 'bitrefill',
  BITREFILL_API_KEY: 'br_test',
  BITREFILL_BASE_URL: 'https://api.bitrefill.com/v2',
  DATABASE_URL: 'postgresql://pouch:pouch@localhost:5432/pouch',
  JWT_SECRET: '12345678901234567890123456789012',
  WEBHOOK_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
};

describe('createAgentWallet', () => {
  it('returns undefined when no OPENFORT env vars are set (demo path)', () => {
    const config = loadConfig(baseEnv);
    const wallet = createAgentWallet(config, noopLogger);
    expect(wallet).toBeUndefined();
  });

  it('returns undefined when only OPENFORT_SECRET_KEY is set (incomplete)', () => {
    const config = loadConfig({ ...baseEnv, OPENFORT_SECRET_KEY: 'sk_test' });
    const wallet = createAgentWallet(config, noopLogger);
    expect(wallet).toBeUndefined();
  });

  it('throws in production when OPENFORT_SECRET_KEY is set but WALLET_SECRET or FEE_SPONSORSHIP_ID is missing', () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      OPENFORT_SECRET_KEY: 'sk_test',
      // OPENFORT_WALLET_SECRET intentionally missing
      OPENFORT_FEE_SPONSORSHIP_ID: 'fes_test',
    });

    expect(() => createAgentWallet(config, noopLogger)).toThrow(/OPENFORT_WALLET_SECRET/);
  });

  it('throws in production when FEE_SPONSORSHIP_ID is missing but SECRET_KEY + WALLET_SECRET are set', () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      OPENFORT_SECRET_KEY: 'sk_test',
      OPENFORT_WALLET_SECRET: 'ws_test',
      // OPENFORT_FEE_SPONSORSHIP_ID intentionally missing
    });

    expect(() => createAgentWallet(config, noopLogger)).toThrow(/OPENFORT_FEE_SPONSORSHIP_ID/);
  });

  it('returns an OpenfortAgentWallet when all three OPENFORT env vars are set', () => {
    const config = loadConfig({
      ...baseEnv,
      OPENFORT_SECRET_KEY: 'sk_test',
      OPENFORT_WALLET_SECRET: 'ws_test',
      OPENFORT_FEE_SPONSORSHIP_ID: 'fes_test',
    });
    const wallet = createAgentWallet(config, noopLogger);
    expect(wallet).toBeDefined();
    expect(wallet?.label).toBe('Openfort gasless');
  });
});
