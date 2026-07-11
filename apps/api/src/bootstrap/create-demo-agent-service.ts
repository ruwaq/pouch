import { CashOutExecutor, IntentParser, OffRampRouter, type AccountProvider, type LoggerPort, type OffRampProvider, type Order, type OrderRepository, type OrderRequest, type OrderStatus, type Product } from '@pouch/domain';
import { ok } from '@pouch/shared';

import { AgentChatService } from '../services/agent-chat-service';
import { BalanceService } from '../services/balance-service';
import { OrderService } from '../services/order-service';
import { MemoryOrderRepository } from '../support/memory-order-repository';

class DemoProvider implements OffRampProvider {
  readonly id = 'demo-provider';
  readonly name = 'Demo Provider';
  readonly categories = ['giftcard', 'topup', 'esim'] as const;

  async searchProducts(query: string): ReturnType<OffRampProvider['searchProducts']> {
    const brand = query || 'amazon';

    return ok([
      {
        id: `${brand}-demo`,
        providerId: this.id,
        name: `${brand.toUpperCase()} Demo`,
        brand,
        category: 'giftcard',
        denominations: [10, 25, 50, 100],
      },
    ]);
  }

  async getQuote(product: Product, amount: { value: number; currency: 'USD' }): ReturnType<OffRampProvider['getQuote']> {
    return ok({
      providerId: this.id,
      productId: product.id,
      faceValue: amount,
      paymentAmount: amount,
      estimatedDelivery: 'instant',
    });
  }

  async createOrder(request: OrderRequest): ReturnType<OffRampProvider['createOrder']> {
    const brand = request.productId.replace(/-demo$/, '');

    return ok({
      id: `demo-order-${request.idempotencyKey}`,
      providerOrderId: `provider-${request.idempotencyKey}`,
      providerId: this.id,
      product: {
        id: request.productId,
        providerId: this.id,
        name: `${brand.toUpperCase()} Demo`,
        brand,
        category: 'giftcard',
        denominations: [10, 25, 50, 100],
      },
      faceValue: request.amount,
      payment: {
        address: '0xdemo',
        amount: request.amount,
        chainId: 42161,
        token: 'USDC',
      },
      status: 'payment_pending',
      idempotencyKey: request.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async getOrderStatus(): ReturnType<OffRampProvider['getOrderStatus']> {
    return ok('payment_pending');
  }

  async verifyWebhook(): ReturnType<OffRampProvider['verifyWebhook']> {
    throw new Error('Demo provider does not implement webhooks.');
  }
}

const demoAccountProvider: AccountProvider = {
  async getUnifiedBalance() {
    return ok({
      total: 150,
      assets: [{ chainId: 42161, symbol: 'USDC', amount: 150, usdValue: 150 }],
      requiresConsolidation: false,
    });
  },
  async consolidate() {
    return ok({ txHash: '0xdemo-consolidation' });
  },
  async sendPayment() {
    return ok({ txHash: '0xdemo-payment' });
  },
};

const logger: LoggerPort = {
  info() {},
  error() {},
};

export function createDemoAgentService(): AgentChatService {
  return createDemoAppServices().agentService;
}

export function createDemoBalanceService(): BalanceService {
  return createDemoAppServices().balanceService;
}

export function createDemoOrderService(): OrderService {
  return createDemoAppServices().orderService;
}

export function createDemoAppServices(): {
  agentService: AgentChatService;
  balanceService: BalanceService;
  orderService: OrderService;
} {
  const providers = [new DemoProvider()];
  const repository = new MemoryOrderRepository();
  const router = new OffRampRouter(providers);
  const executor = new CashOutExecutor(router, providers, demoAccountProvider, repository, logger);

  return {
    agentService: new AgentChatService(new IntentParser(), executor, repository),
    balanceService: new BalanceService(demoAccountProvider),
    orderService: new OrderService(repository),
  };
}
