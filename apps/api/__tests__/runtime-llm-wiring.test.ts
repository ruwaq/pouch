import { describe, expect, it } from 'vitest';

import { createRuntimeAppServices } from '../src/bootstrap/create-runtime-app-services';

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    SETTLEMENT_CHAIN_ID: '42161',
    SUPPORTED_CHAINS: '42161,8453',
    OFFRAMP_PROVIDERS: 'bitrefill',
    WEB3_PROVIDER_MODE: 'demo',
    DEMO_USER_BALANCE_USD: '150',
    DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
    JWT_SECRET: 'a'.repeat(40),
    WEBHOOK_SECRET: 'b'.repeat(40),
    ...overrides,
  };
}

describe('createRuntimeAppServices — LLM wiring', () => {
  it('boots in configured (demo provider) mode without an LLM and still answers', async () => {
    const services = createRuntimeAppServices({
      env: baseEnv(),
      dependencies: {
        // keep DB/providers inert so it boots into the configured path
        createDatabase: () => ({}),
        createOrderRepository: () => ({
          async save() {},
          async findById() {
            return null;
          },
          async findByProviderOrderId() {
            return null;
          },
          async updateStatus() {},
        }),
        createWebhookEventStore: () => ({
          async recordIfNew() {
            return true;
          },
          async markProcessed() {},
        }),
        createAccountProvider: () => ({
          async getUnifiedBalance() {
            return { ok: true, value: { total: 0, assets: [], requiresConsolidation: false } };
          },
          async consolidate() {
            return { ok: true, value: { txHash: '0x0' } };
          },
          async sendPayment() {
            return { ok: true, value: { txHash: '0x0' } };
          },
        }),
      },
    });

    expect(services.agentService).toBeDefined();
    expect(typeof services.agentService.handleMessage).toBe('function');
  });

  it('boots with LLM_PROVIDER=gemini but no key and still returns a working agent service', () => {
    const services = createRuntimeAppServices({
      env: baseEnv({ LLM_PROVIDER: 'gemini' }),
      dependencies: {
        createDatabase: () => ({}),
        createOrderRepository: () => ({
          async save() {},
          async findById() {
            return null;
          },
          async findByProviderOrderId() {
            return null;
          },
          async updateStatus() {},
        }),
        createWebhookEventStore: () => ({
          async recordIfNew() {
            return true;
          },
          async markProcessed() {},
        }),
        createAccountProvider: () => ({
          async getUnifiedBalance() {
            return { ok: true, value: { total: 0, assets: [], requiresConsolidation: false } };
          },
          async consolidate() {
            return { ok: true, value: { txHash: '0x0' } };
          },
          async sendPayment() {
            return { ok: true, value: { txHash: '0x0' } };
          },
        }),
      },
    });

    expect(services.agentService).toBeDefined();
  });
});
