import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountProvider, OffRampProvider, OrderRepository } from '@pouch/domain';
import { ok } from '@pouch/shared';

import { createRuntimeAppServices } from './create-runtime-app-services';

// Keys that createRuntimeAppServices reads via `options.env ?? process.env`
// fallback. Each test below passes an explicit env to control the branch, so we
// clear these from process.env to keep tests isolated from the developer's
// local .env (loaded globally for app.test.ts by vitest.setup.ts).
const ENV_KEYS_UNDER_TEST = [
  'NODE_ENV',
  'DEMO_MODE',
  'PRIVATE_KEY',
  'SECOND_PRIVATE_KEY',
  'SEED_PHRASE_1',
  'SEED_PHRASE_2',
  'SEED_PHRASE_3',
  'SETTLEMENT_CHAIN_ID',
  'SUPPORTED_CHAINS',
  'OPENFORT_SECRET_KEY',
  'OPENFORT_WALLET_SECRET',
  'OPENFORT_FEE_SPONSORSHIP_ID',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS_UNDER_TEST) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS_UNDER_TEST) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const validEnv = {
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

function buildBitrefillProvider(): OffRampProvider {
  return {
    id: 'bitrefill',
    name: 'Bitrefill',
    categories: ['giftcard'],
    async searchProducts() {
      return ok([]);
    },
    async getQuote() {
      throw new Error('Not used in this test.');
    },
    async createOrder() {
      throw new Error('Not used in this test.');
    },
    async getOrderStatus() {
      throw new Error('Not used in this test.');
    },
    async verifyWebhook() {
      return ok({
        eventId: 'evt_1',
        providerId: 'bitrefill',
        status: 'delivered',
        payload: {},
      });
    },
  };
}

const fakeOrderRepository: OrderRepository = {
  async save() {},
  async findById() {
    return null;
  },
  async findByProviderOrderId() {
    return null;
  },
  async updateStatus() {},
};

const fakeAccountProvider: AccountProvider = {
  async getUnifiedBalance() {
    return ok({ total: 100, assets: [], requiresConsolidation: false });
  },
  async consolidate() {
    return ok({ txHash: '0xconsolidate' });
  },
  async sendPayment() {
    return ok({ txHash: '0xpay' });
  },
};

describe('createRuntimeAppServices', () => {
  it('throws when env config is incomplete (never silently falls back to mock)', () => {
    // The owner's rule: a failure must surface as a failure, never as fake
    // data. With incomplete config the runtime must NOT return simulated
    // demo services — it must throw so the misconfiguration is visible.
    expect(() => createRuntimeAppServices({ env: { NODE_ENV: 'development' } })).toThrow();
  });

  it('fails fast in production when required env config is missing', () => {
    expect(() => createRuntimeAppServices({ env: { NODE_ENV: 'production' } })).toThrow();
  });

  it('builds configured runtime services when env and dependencies are valid', () => {
    const createDatabase = vi.fn(() => ({ tag: 'db' }));
    const createOrderRepository = vi.fn(() => fakeOrderRepository);
    const createWebhookEventStore = vi.fn(() => ({
      async recordIfNew() {
        return true;
      },
      async markProcessed() {},
    }));
    const buildProviders = vi.fn(() => [buildBitrefillProvider()]);
    const createAccountProvider = vi.fn(() => fakeAccountProvider);

    const services = createRuntimeAppServices({
      env: validEnv,
      dependencies: {
        createDatabase,
        createOrderRepository,
        createWebhookEventStore,
        buildOffRampProviders: buildProviders,
        createAccountProvider,
      },
    });

    expect(services.mode).toBe('configured');
    expect(services.balanceService).toBeDefined();
    expect(services.bitrefillWebhookService).toBeDefined();
    expect(createDatabase).toHaveBeenCalledWith(validEnv.DATABASE_URL);
    expect(buildProviders).toHaveBeenCalledTimes(1);
    expect(createOrderRepository).toHaveBeenCalledTimes(1);
    expect(createWebhookEventStore).toHaveBeenCalledTimes(1);
    expect(createAccountProvider).toHaveBeenCalledTimes(1);
  });

  it('throws when DEMO_MODE=true but no PRIVATE_KEY is set', () => {
    expect(() =>
      createRuntimeAppServices({ env: { NODE_ENV: 'development', DEMO_MODE: 'true' } }),
    ).toThrow(/PRIVATE_KEY/);
  });
});
