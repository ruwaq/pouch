import { describe, expect, it, vi } from 'vitest';

import type { AccountProvider, OffRampProvider, OrderRepository } from '@pouch/domain';
import { ok } from '@pouch/shared';

import { createRuntimeAppServices } from './create-runtime-app-services';

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
  it('falls back to demo wiring in development when env config is incomplete', () => {
    const services = createRuntimeAppServices({ env: { NODE_ENV: 'development' } });

    expect(services.mode).toBe('demo');
    expect(services.agentService).toBeDefined();
    expect(services.balanceService).toBeDefined();
    expect(services.bitrefillWebhookService).toBeUndefined();
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
});
