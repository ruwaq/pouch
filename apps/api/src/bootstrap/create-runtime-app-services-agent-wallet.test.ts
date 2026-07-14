import { describe, expect, it, vi } from 'vitest';

import type { AccountProvider, AgentWalletPort, OffRampProvider, OrderRepository } from '@pouch/domain';
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
      throw new Error('Not used.');
    },
    async createOrder() {
      throw new Error('Not used.');
    },
    async getOrderStatus() {
      throw new Error('Not used.');
    },
    async verifyWebhook() {
      return ok({ eventId: 'evt_1', providerId: 'bitrefill', status: 'delivered', payload: {} });
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

const fakeAgentWallet: AgentWalletPort = {
  label: 'Openfort gasless',
  async getAddress() {
    return ok({ address: '0xagent' });
  },
  async settlePayment() {
    return ok({ txHash: '0xgasless' });
  },
};

function buildDeps(overrides: { createAgentWallet?: ReturnType<typeof vi.fn> } = {}) {
  return {
    createDatabase: () => ({ tag: 'db' }),
    createOrderRepository: () => fakeOrderRepository,
    createWebhookEventStore: () => ({ async recordIfNew() { return true; }, async markProcessed() {} }),
    buildOffRampProviders: () => [buildBitrefillProvider()],
    createAccountProvider: () => fakeAccountProvider,
    ...overrides,
  };
}

describe('createRuntimeAppServices — agent wallet wiring', () => {
  it('does not call createAgentWallet when no OPENFORT env is set', () => {
    const createAgentWallet = vi.fn(() => undefined);

    const services = createRuntimeAppServices({
      env: validEnv,
      dependencies: buildDeps({ createAgentWallet }),
    });

    expect(services.mode).toBe('configured');
    expect(createAgentWallet).not.toHaveBeenCalled();
  });

  it('calls createAgentWallet when OPENFORT_SECRET_KEY is set', () => {
    const createAgentWallet = vi.fn(() => fakeAgentWallet);

    const services = createRuntimeAppServices({
      env: { ...validEnv, OPENFORT_SECRET_KEY: 'sk_test', OPENFORT_WALLET_SECRET: 'ws_test', OPENFORT_FEE_SPONSORSHIP_ID: 'fes_test' },
      dependencies: buildDeps({ createAgentWallet }),
    });

    expect(services.mode).toBe('configured');
    expect(createAgentWallet).toHaveBeenCalledTimes(1);
  });

  it('does not call createAgentWallet when OPENFORT_SECRET_KEY is unset even if dep provided', () => {
    const createAgentWallet = vi.fn(() => fakeAgentWallet);

    const services = createRuntimeAppServices({
      env: validEnv,
      dependencies: buildDeps({ createAgentWallet }),
    });

    expect(services.mode).toBe('configured');
    expect(createAgentWallet).not.toHaveBeenCalled();
  });
});
