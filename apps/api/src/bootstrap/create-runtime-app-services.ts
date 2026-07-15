import { CashOutExecutor, OffRampRouter, type AccountProvider, type AgentWalletPort, type Balance, type LoggerPort, type OffRampProvider, type OrderRepository, type OrderRequest, type Product, type SendPaymentParams, type TxResult } from '@pouch/domain';
import { createAgentLlm } from '@pouch/infra-ai';
import { buildOffRampProviders } from '@pouch/infra-offramp';
import {
  createDatabase,
  DrizzleOrderRepository,
  DrizzleWebhookEventStore,
  type WebhookEventStore,
} from '@pouch/infra-db';
import { createAccountProvider, createAgentWallet } from '@pouch/infra-web3';
import { loadConfig, ok, type Config, type Result } from '@pouch/shared';
import type { DomainError } from '@pouch/domain';

import { BitrefillWebhookService } from '../services/bitrefill-webhook-service';
import { AgentChatService, type AgentChatServiceLike } from '../services/agent-chat-service';
import { BalanceService, type BalanceServiceLike } from '../services/balance-service';
import { OrderService, type OrderServiceLike } from '../services/order-service';
import { MemoryOrderRepository } from '../support/memory-order-repository';
import { createDemoAppServices } from './create-demo-agent-service';

export interface RuntimeAppServices {
  mode: 'demo' | 'configured';
  agentService: AgentChatServiceLike;
  balanceService: BalanceServiceLike;
  orderService: OrderServiceLike;
  bitrefillWebhookService?: BitrefillWebhookService;
}

interface RuntimeDependencies {
  createDatabase?: (connectionString: string) => unknown;
  createOrderRepository?: (database: unknown) => OrderRepository;
  createWebhookEventStore?: (database: unknown) => WebhookEventStore;
  buildOffRampProviders?: typeof buildOffRampProviders;
  createAccountProvider?: (config: Config) => AccountProvider;
  createAgentWallet?: (config: Config, logger: LoggerPort) => AgentWalletPort | undefined;
}

const runtimeLogger: LoggerPort = {
  info() {},
  error() {},
};

/** Demo account provider used when a judge clicks "Try Demo" — no real funds needed. */
function createDemoAccountProvider(): AccountProvider {
  return {
    async getUnifiedBalance() {
      return ok({
        total: 100,
        assets: [
          { chainId: 42161, symbol: 'USDC', amount: 45, usdValue: 45 },
          { chainId: 8453, symbol: 'USDC', amount: 30, usdValue: 30 },
          { chainId: 8453, symbol: 'ETH', amount: 0.007, usdValue: 25 },
        ],
        requiresConsolidation: true,
      });
    },
    async consolidate() {
      return ok({ txHash: '0xdemo-consolidation' });
    },
    async sendPayment() {
      return ok({ txHash: '0xdemo-payment' });
    },
  };
}

/** Demo off-ramp provider — simulates gift card purchases without a real API key. */
function createDemoOffRampProvider(): OffRampProvider {
  return {
    id: 'demo-provider',
    name: 'Demo Provider',
    categories: ['giftcard', 'topup', 'esim'] as const,

    async searchProducts(query) {
      const brand = query || 'amazon';
      return ok([
        {
          id: `${brand}-demo`,
          providerId: 'demo-provider',
          name: `${brand.toUpperCase()} Demo`,
          brand,
          category: 'giftcard',
          denominations: [10, 25, 50, 100],
        },
      ]);
    },
    async getQuote(product, amount) {
      return ok({
        providerId: 'demo-provider',
        productId: product.id,
        faceValue: amount,
        paymentAmount: amount,
        estimatedDelivery: 'instant',
      });
    },
    async createOrder(request) {
      const brand = request.productId.replace(/-demo$/, '');
      return ok({
        id: `demo-order-${request.idempotencyKey}`,
        providerOrderId: `provider-${request.idempotencyKey}`,
        providerId: 'demo-provider',
        ...(request.userId ? { userId: request.userId } : {}),
        product: {
          id: request.productId,
          providerId: 'demo-provider',
          name: `${brand.toUpperCase()} Demo`,
          brand,
          category: 'giftcard',
          denominations: [10, 25, 50, 100],
        },
        faceValue: request.amount,
        payment: {
          address: '0x000000000000000000000000000000000000dEaD',
          amount: request.amount,
          chainId: 42161,
          token: 'USDC',
        },
        status: 'payment_pending',
        idempotencyKey: request.idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
    async getOrderStatus() {
      return ok('payment_pending');
    },
    async verifyWebhook() {
      throw new Error('Demo provider does not implement webhooks.');
    },
  };
}

/**
 * Hybrid order repository: demo-user orders go to memory (no DB needed),
 * real users go to the Drizzle-backed PostgreSQL repository.
 */
function createHybridOrderRepository(drizzleRepo: OrderRepository): OrderRepository {
  const memoryRepo = new MemoryOrderRepository();
  const isDemo = (idOrUserId?: string) =>
    idOrUserId === 'demo-user' || idOrUserId?.startsWith('demo-order-');

  return {
    async save(order) {
      if (isDemo(order.userId) || isDemo(order.id)) return memoryRepo.save(order);
      return drizzleRepo.save(order);
    },
    async findById(id, userId) {
      if (isDemo(userId) || isDemo(id)) return memoryRepo.findById(id, userId);
      return drizzleRepo.findById(id, userId);
    },
    async findByProviderOrderId(providerId, providerOrderId) {
      return drizzleRepo.findByProviderOrderId(providerId, providerOrderId);
    },
    async updateStatus(id, status, updates) {
      if (isDemo(id)) return memoryRepo.updateStatus(id, status, updates);
      const memOrder = await memoryRepo.findById(id);
      if (memOrder) return memoryRepo.updateStatus(id, status, updates);
      return drizzleRepo.updateStatus(id, status, updates);
    },
  };
}
function createHybridAccountProvider(realProvider: AccountProvider): AccountProvider {
  const demoProvider = createDemoAccountProvider();
  const isDemo = (userId: string) => userId === 'demo-user' || userId === '0xdemo';

  return {
    async getUnifiedBalance(userId) {
      if (isDemo(userId)) return demoProvider.getUnifiedBalance(userId);
      return realProvider.getUnifiedBalance(userId);
    },
    async consolidate(userId, targetChainId, targetToken) {
      if (isDemo(userId)) return demoProvider.consolidate(userId, targetChainId, targetToken);
      return realProvider.consolidate(userId, targetChainId, targetToken);
    },
    async sendPayment(params) {
      if (isDemo(params.from)) return demoProvider.sendPayment(params);
      return realProvider.sendPayment(params);
    },
  };
}

function shouldFailFast(env: Record<string, string | undefined>): boolean {
  if ((env.DEMO_MODE ?? process.env.DEMO_MODE ?? '').trim() === 'true') return false;
  return (env.NODE_ENV ?? process.env.NODE_ENV ?? 'development') === 'production';
}

export function createRuntimeAppServices(options: {
  env?: Record<string, string | undefined>;
  dependencies?: RuntimeDependencies;
} = {}): RuntimeAppServices {
  const env = options.env ?? process.env;
  const dependencies = options.dependencies ?? {};

  // Explicit demo override — skip all real config and use simulated services.
  const demoFlag = (env.DEMO_MODE ?? process.env.DEMO_MODE ?? '').trim();
  if (demoFlag === 'true') {
    return {
      mode: 'demo',
      ...createDemoAppServices(),
    };
  }

  let config: Config;

  try {
    config = loadConfig(env);
  } catch (error) {
    if (shouldFailFast(env)) {
      throw error;
    }

    const demoServices = createDemoAppServices();

    return {
      mode: 'demo',
      ...demoServices,
    };
  }

  try {
    const database = (dependencies.createDatabase ?? createDatabase)(config.DATABASE_URL);
    const orderRepository =
      (dependencies.createOrderRepository ?? ((db) => new DrizzleOrderRepository(db as ReturnType<typeof createDatabase>)))(
        database,
      );
    const hybridOrderRepo = createHybridOrderRepository(orderRepository);
    const webhookEventStore =
      (dependencies.createWebhookEventStore ??
        ((db) => new DrizzleWebhookEventStore(db as ReturnType<typeof createDatabase>)))(database);
    const providers = (dependencies.buildOffRampProviders ?? buildOffRampProviders)(config);

    // If no real providers are configured (e.g. waiting for Bitrefill key),
    // inject a demo provider so the "Try Demo" flow works end-to-end.
    const allProviders = providers.length > 0
      ? providers
      : [createDemoOffRampProvider()];

    const bitrefillProvider = allProviders.find((provider) => provider.id === 'bitrefill');
    const bitrefillWebhookService = bitrefillProvider
      ? new BitrefillWebhookService(bitrefillProvider, hybridOrderRepo, webhookEventStore)
      : undefined;

    const accountProvider = (dependencies.createAccountProvider ?? createAccountProvider)(config);
    // Wrap with hybrid: demo-user gets simulated balances; real users get Particle UA.
    const hybridAccountProvider = createHybridAccountProvider(accountProvider);

    const agentWallet = config.OPENFORT_SECRET_KEY
      ? (dependencies.createAgentWallet ?? createAgentWallet)(config, runtimeLogger)
      : undefined;

    // Don't use the real agent wallet for demo users — the demo provider
    // uses a simulated payment address that would fail on-chain.
    const hybridAgentWallet: AgentWalletPort | undefined = agentWallet
      ? {
          label: agentWallet.label,
          async getAddress() {
            return agentWallet.getAddress();
          },
          async settlePayment(params) {
            if (params.to === '0x000000000000000000000000000000000000dEaD') {
              return ok({ txHash: '0xdemo-gasless-settlement' });
            }
            return agentWallet.settlePayment(params);
          },
        }
      : undefined;

    const executor = new CashOutExecutor(
      new OffRampRouter(allProviders),
      allProviders,
      hybridAccountProvider,
      hybridOrderRepo,
      runtimeLogger,
      hybridAgentWallet,
    );

    const { intentParser, replyStrategy } = createAgentLlm(config);
    const balanceService = new BalanceService(hybridAccountProvider);
    const agentService = replyStrategy
      ? new AgentChatService(intentParser, executor, hybridOrderRepo, balanceService, allProviders, replyStrategy)
      : new AgentChatService(intentParser, executor, hybridOrderRepo, balanceService, allProviders);

    return {
      mode: 'configured',
      agentService,
      balanceService,
      orderService: new OrderService(hybridOrderRepo),
      ...(bitrefillWebhookService ? { bitrefillWebhookService } : {}),
    };
  } catch (error) {
    if (shouldFailFast(env)) {
      throw error;
    }

    const demoServices = createDemoAppServices();

    return {
      mode: 'demo',
      ...demoServices,
    };
  }
}
