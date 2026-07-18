import { describe, expect, it } from 'vitest';

import {
  CashOutExecutor,
  OffRampRouter,
  SecurityChecker,
  DEFAULT_POLICY,
  type AccountProvider,
  type AgentWalletPort,
  type LoggerPort,
  type OffRampProvider,
  type Order,
  type OrderRepository,
  type OrderRequest,
  type Product,
  type SecurityPolicyPort,
  type SpendingPolicy,
} from '@pouch/domain';
import { err, ok } from '@pouch/shared';

class StubProvider implements OffRampProvider {
  readonly id = 'stub-provider';
  readonly name = 'Stub Provider';
  readonly categories = ['giftcard'] as const;

  private readonly product: Product = {
    id: 'amazon-us',
    providerId: this.id,
    name: 'Amazon US',
    brand: 'Amazon',
    category: 'giftcard',
    denominations: [50],
  };

  async searchProducts(): ReturnType<OffRampProvider['searchProducts']> {
    return ok([this.product]);
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
    return ok({
      id: 'order-1',
      providerOrderId: 'provider-order-1',
      providerId: this.id,
      ...(request.userId ? { userId: request.userId } : {}),
      product: this.product,
      faceValue: request.amount,
      payment: {
        address: '0xpayment',
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
    throw new Error('Not used in this test.');
  }
}

class CapturingRepository implements OrderRepository {
  readonly saved: Order[] = [];
  readonly statuses: Array<{ id: string; status: string }> = [];

  async save(order: Order): Promise<void> {
    this.saved.push(order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.saved.find((order) => order.id === id) ?? null;
  }

  async findByProviderOrderId(): Promise<Order | null> {
    return null;
  }

  async updateStatus(id: string, status: Order['status']): Promise<void> {
    this.statuses.push({ id, status });
  }
}

const logger: LoggerPort = { info() {}, error() {} };

describe('CashOutExecutor', () => {
  it('attaches the userId to the created order and returns a populated trace', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };
    const executor = new CashOutExecutor(new OffRampRouter(providers), providers, account, repository, logger);

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(repository.saved[0]?.userId).toBe('user-42');
    expect(result.value.orderId).toBe('order-1');
    expect(result.value.trace.length).toBeGreaterThanOrEqual(4);
    expect(result.value.trace.every((step) => step.status === 'complete')).toBe(true);
    const labels = result.value.trace.map((step) => step.label);
    expect(labels.some((label) => /balance/i.test(label))).toBe(true);
    expect(labels.some((label) => /provider|rout/i.test(label))).toBe(true);
    expect(labels.some((label) => /sign|payment|pay/i.test(label))).toBe(true);
  });

  it('includes a consolidation step when the balance requires consolidation', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 50,
          assets: [{ chainId: 8453, symbol: 'ETH', amount: 0.02, usdValue: 50 }],
          requiresConsolidation: true,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };
    const executor = new CashOutExecutor(new OffRampRouter(providers), providers, account, repository, logger);

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.trace.some((step) => /consolidat/i.test(step.label))).toBe(true);
  });

  it('runs the two-step agent-wallet settlement when an agentWallet is injected', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xfund-agent' });
      },
    };

    const agentWallet: AgentWalletPort = {
      label: 'Openfort gasless',
      async getAddress() {
        return ok({ address: '0xagent-wallet' });
      },
      async settlePayment() {
        return ok({ txHash: '0xgasless-settle' });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      agentWallet,
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const labels = result.value.trace.map((step) => step.label);
    expect(labels.some((label) => /funding agent wallet/i.test(label))).toBe(true);
    expect(labels.some((label) => /openfort gasless|paid via/i.test(label))).toBe(true);
    // The funding step should carry the UA 7702 badge.
    const fundingStep = result.value.trace.find((step) => /funding agent wallet/i.test(step.label));
    expect(fundingStep?.badge).toBe('UA 7702');
    // The settle step should carry the NO POPUP badge.
    const settleStep = result.value.trace.find((step) => /openfort gasless|paid via/i.test(step.label));
    expect(settleStep?.badge).toBe('NO POPUP');
  });

  it('returns AGENT_WALLET_SETTLE_FAILED and marks the order failed when settlePayment errors', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xfund-agent' });
      },
    };

    const agentWallet: AgentWalletPort = {
      label: 'Openfort gasless',
      async getAddress() {
        return ok({ address: '0xagent-wallet' });
      },
      async settlePayment() {
        return err({ type: 'AGENT_WALLET_SETTLE_FAILED', message: 'sponsorship rejected', cause: 'policy mismatch' });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      agentWallet,
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    expect(repository.statuses.some((s) => s.status === 'failed')).toBe(true);
  });

  it('returns the error and marks the order failed when getAddress fails', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xfund-agent' });
      },
    };

    const agentWallet: AgentWalletPort = {
      label: 'Openfort gasless',
      async getAddress() {
        return err({ type: 'AGENT_WALLET_NOT_CONFIGURED', message: 'not configured' });
      },
      async settlePayment() {
        return ok({ txHash: '0xgasless' });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      agentWallet,
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AGENT_WALLET_NOT_CONFIGURED');
    expect(repository.statuses.some((s) => s.status === 'failed')).toBe(true);
  });

  it('runs security check when SecurityChecker is injected and includes verdict in result', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };

    const policyStore: SecurityPolicyPort = {
      async getPolicy() {
        return ok<SpendingPolicy>({ ...DEFAULT_POLICY });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      undefined,
      new SecurityChecker(policyStore),
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Security step should be in the trace
    const labels = result.value.trace.map((step) => step.label);
    expect(labels.some((label) => /security/i.test(label))).toBe(true);

    // Security verdict should be in the result
    expect(result.value.securityVerdict).toBeDefined();
    expect(result.value.securityVerdict?.verdict).toBe('ALLOW');
    expect(result.value.securityVerdict?.riskLevel).toBe('LOW');
  });

  it('returns SECURITY_BLOCKED when security check blocks the transaction', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };

    // Policy that blocks anything above $100
    const policyStore: SecurityPolicyPort = {
      async getPolicy() {
        return ok<SpendingPolicy>({ ...DEFAULT_POLICY, blockAboveAmount: 100 });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      undefined,
      new SecurityChecker(policyStore),
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 150, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('SECURITY_BLOCKED');
    if (result.error.type === 'SECURITY_BLOCKED') {
      expect(result.error.riskScore).toBe(100);
    }
  });

  it('does not block when no SecurityChecker is injected (backward compatible)', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };

    // No SecurityChecker injected — should work exactly as before
    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No security verdict when no checker is injected
    expect(result.value.securityVerdict).toBeUndefined();
  });
});
