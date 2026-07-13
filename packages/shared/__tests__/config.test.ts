import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

function validEnv() {
  return {
    APP_URL: 'http://localhost:3000',
    SETTLEMENT_CHAIN_ID: '42161',
    SUPPORTED_CHAINS: '42161,8453',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/pouch',
    JWT_SECRET: 'a'.repeat(32),
    WEBHOOK_SECRET: 'b'.repeat(32),
  };
}

describe('loadConfig', () => {
  it('defaults LLM config to undefined when not provided', () => {
    const config = loadConfig(validEnv());

    expect(config.LLM_PROVIDER).toBeUndefined();
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.LLM_MODEL).toBeUndefined();
  });

  it('parses LLM_PROVIDER, GEMINI_API_KEY, and LLM_MODEL when provided', () => {
    const config = loadConfig({
      ...validEnv(),
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-test-key',
      LLM_MODEL: 'gemini-2.0-flash',
    });

    expect(config.LLM_PROVIDER).toBe('gemini');
    expect(config.GEMINI_API_KEY).toBe('AIza-test-key');
    expect(config.LLM_MODEL).toBe('gemini-2.0-flash');
  });
});
