import { CashOutExecutor, OffRampRouter, type AccountProvider, type AgentWalletPort, type LoggerPort, type OrderRepository } from '@pouch/domain';
import { createAgentLlm } from '@pouch/infra-ai';
import { buildOffRampProviders } from '@pouch/infra-offramp';
import {
  createDatabase,
  DrizzleOrderRepository,
  DrizzleWebhookEventStore,
  type WebhookEventStore,
} from '@pouch/infra-db';
import { createAccountProvider, createAgentWallet } from '@pouch/infra-web3';
import { loadConfig, type Config } from '@pouch/shared';

import { BitrefillWebhookService } from '../services/bitrefill-webhook-service';
import { AgentChatService, type AgentChatServiceLike } from '../services/agent-chat-service';
import { BalanceService, type BalanceServiceLike } from '../services/balance-service';
import { OrderService, type OrderServiceLike } from '../services/order-service';
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
    const webhookEventStore =
      (dependencies.createWebhookEventStore ??
        ((db) => new DrizzleWebhookEventStore(db as ReturnType<typeof createDatabase>)))(database);
    const providers = (dependencies.buildOffRampProviders ?? buildOffRampProviders)(config);

    const bitrefillProvider = providers.find((provider) => provider.id === 'bitrefill');
    const bitrefillWebhookService = bitrefillProvider
      ? new BitrefillWebhookService(bitrefillProvider, orderRepository, webhookEventStore)
      : undefined;

    const accountProvider = (dependencies.createAccountProvider ?? createAccountProvider)(config);

    const agentWallet = config.OPENFORT_SECRET_KEY
      ? (dependencies.createAgentWallet ?? createAgentWallet)(config, runtimeLogger)
      : undefined;

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      accountProvider,
      orderRepository,
      runtimeLogger,
      agentWallet,
    );

    const { intentParser, replyStrategy } = createAgentLlm(config);
    const agentService = replyStrategy
      ? new AgentChatService(intentParser, executor, orderRepository, replyStrategy)
      : new AgentChatService(intentParser, executor, orderRepository);

    return {
      mode: 'configured',
      agentService,
      balanceService: new BalanceService(accountProvider),
      orderService: new OrderService(orderRepository),
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
