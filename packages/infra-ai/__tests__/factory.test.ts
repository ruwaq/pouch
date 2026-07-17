import { describe, expect, it } from 'vitest';

import type { Config } from '@pouch/shared';
import type { IntentParserStrategy, ReplyStrategy } from '@pouch/domain';

import { createAgentLlm, createIntentParser, createLlmProvider, createReplyStrategy } from '../src/factory';

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    SETTLEMENT_CHAIN_ID: 42161,
    SUPPORTED_CHAINS: [42161, 8453],
    OFFRAMP_PROVIDERS: ['bitrefill'],
    BITREFILL_BASE_URL: 'https://api.bitrefill.com/v2',
    DEMO_USER_BALANCE_USD: 150,
    DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
    JWT_SECRET: 'a'.repeat(40),
    WEBHOOK_SECRET: 'b'.repeat(40),
    ...overrides,
  } as unknown as Config;
}

describe('createLlmProvider', () => {
  it('returns undefined when no provider configured', () => {
    expect(createLlmProvider(baseConfig())).toBeUndefined();
  });

  it('returns undefined when provider set but key missing', () => {
    expect(createLlmProvider(baseConfig({ LLM_PROVIDER: 'gemini' }))).toBeUndefined();
  });

  it('returns a provider when configured', () => {
    const provider = createLlmProvider(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key' }),
    );
    expect(provider).toBeDefined();
  });
});

describe('createIntentParser', () => {
  it('returns a parser with an async parse when LLM_PROVIDER=gemini + key present', () => {
    const parser = createIntentParser(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key', LLM_MODEL: 'gemini-2.0-flash' }),
    );
    expect(typeof (parser as IntentParserStrategy).parse).toBe('function');
  });

  it('still returns a parser when the LLM key is missing (regex fallback)', () => {
    const parser = createIntentParser(baseConfig({ LLM_PROVIDER: 'gemini' }));
    expect(typeof (parser as IntentParserStrategy).parse).toBe('function');
  });
});

describe('createReplyStrategy', () => {
  it('returns undefined when no LLM provider is given', () => {
    expect(createReplyStrategy(baseConfig(), undefined)).toBeUndefined();
  });

  it('returns an LlmReplyStrategy when a provider is supplied', () => {
    const provider = createLlmProvider(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key' }),
    );
    const strategy = createReplyStrategy(baseConfig(), provider);
    expect(strategy).toBeDefined();
    expect(typeof (strategy as ReplyStrategy | undefined)?.buildReply).toBe('function');
  });
});

describe('createAgentLlm', () => {
  it('returns the regex parser + undefined strategy when not configured', () => {
    const { intentParser, replyStrategy } = createAgentLlm(baseConfig());
    expect(typeof (intentParser as IntentParserStrategy).parse).toBe('function');
    expect(replyStrategy).toBeUndefined();
  });

  it('returns an LLM parser + reply strategy sharing one provider when configured', () => {
    const { intentParser, replyStrategy } = createAgentLlm(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key' }),
    );
    expect(typeof (intentParser as IntentParserStrategy).parse).toBe('function');
    expect(replyStrategy).toBeDefined();
  });
});
