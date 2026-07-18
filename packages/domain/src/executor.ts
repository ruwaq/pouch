import { err, isOk, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import { OffRampRouter } from './router';
import { SecurityChecker } from './security';
import { TraceRecorder } from './trace';
import type {
  AccountProvider,
  AgentWalletPort,
  CashOutIntent,
  CashOutResult,
  LoggerPort,
  OffRampProvider,
  Order,
  OrderRepository,
  SecurityResult,
  UserId,
} from './types';

export class CashOutExecutor {
  constructor(
    private readonly router: OffRampRouter,
    private readonly providers: readonly OffRampProvider[],
    private readonly account: AccountProvider,
    private readonly orders: OrderRepository,
    private readonly logger: LoggerPort,
    private readonly agentWallet?: AgentWalletPort,
    private readonly securityChecker?: SecurityChecker,
  ) {}

  async execute(intent: CashOutIntent, userId: UserId): Promise<Result<CashOutResult, DomainError>> {
    const trace = new TraceRecorder();

    const balanceStep = trace.start('Reading unified balance');
    const balance = await this.account.getUnifiedBalance(userId);

    if (!isOk(balance)) {
      trace.fail(balanceStep.id, 'Balance provider unavailable.');
      return balance;
    }

    trace.complete(balanceStep.id, {
      badge: `${balance.value.assets.length} asset${balance.value.assets.length === 1 ? '' : 's'}`,
    });

    if (balance.value.total < intent.amount.value) {
      return err({
        type: 'INSUFFICIENT_FUNDS',
        available: balance.value.total,
        required: intent.amount.value,
      });
    }

    // ── Security check (deterministic, runs before any on-chain action) ──
    let securityResult: SecurityResult | undefined;
    if (this.securityChecker) {
      const securityStep = trace.start('Security check', { badge: 'SHIELD' });
      const check = await this.securityChecker.check(intent, userId);

      if (isOk(check)) {
        securityResult = check.value;
        if (securityResult.verdict === 'BLOCK') {
          const blockedCheck = securityResult.checks.find((c) => c.verdict === 'BLOCK');
          trace.fail(securityStep.id, blockedCheck?.detail ?? 'Blocked by security policy');
          return err({
            type: 'SECURITY_BLOCKED',
            check: blockedCheck?.name ?? 'policy',
            detail: blockedCheck?.detail ?? 'Transaction blocked by security policy',
            riskScore: securityResult.riskScore,
          });
        }
        trace.complete(securityStep.id, { badge: SecurityChecker.badge(securityResult) });
      } else {
        // Security check errored — don't block, but log the failure
        this.logger.error({ userId, error: check.error }, 'Security check failed, allowing by default');
        trace.complete(securityStep.id, { badge: 'SAFE ✓' });
      }
    }

    const routingStep = trace.start('Finding best provider');
    const routing = await this.router.findBestOption(intent);

    if (!isOk(routing)) {
      trace.fail(routingStep.id, 'No provider could fulfill this request.');
      return routing;
    }

    trace.complete(routingStep.id, { badge: 'cheapest' });

    const provider = this.providers.find((candidate) => candidate.id === routing.value.quote.providerId);

    if (!provider) {
      trace.fail(routingStep.id, `Provider ${routing.value.quote.providerId} not found.`);
      return err({
        type: 'PROVIDER_NOT_FOUND',
        providerId: routing.value.quote.providerId,
      });
    }

    const orderStep = trace.start(`Creating order with ${provider.name}`);
    const orderRequest = {
      productId: routing.value.quote.productId,
      amount: intent.amount,
      idempotencyKey: crypto.randomUUID(),
      userId,
      ...(intent.recipient ? { recipient: intent.recipient } : {}),
    };

    const order = await provider.createOrder(orderRequest);

    if (!isOk(order)) {
      trace.fail(orderStep.id, 'Order creation failed.');
      return order;
    }

    trace.complete(orderStep.id);

    if (order.value.userId !== userId) {
      order.value.userId = userId;
    }

    await this.orders.save(order.value);

    if (balance.value.requiresConsolidation) {
      const consolidationStep = trace.start('Consolidating via Universal Account', { badge: 'UA 7702' });
      const consolidation = await this.account.consolidate(
        userId,
        order.value.payment.chainId,
        order.value.payment.token,
      );

      if (!isOk(consolidation)) {
        this.logger.error({ orderId: order.value.id }, 'Consolidation failed.');
        trace.fail(consolidationStep.id, 'Consolidation failed.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return consolidation;
      }

      trace.complete(consolidationStep.id);
    }

    if (!order.value.payment.address) {
      await this.orders.updateStatus(order.value.id, 'failed');

      return err({
        type: 'PAYMENT_ADDRESS_MISSING',
        orderId: order.value.id,
      });
    }

    if (this.agentWallet) {
      const fundingStep = trace.start('Funding agent wallet', { badge: 'UA 7702' });

      const agentAddress = await this.agentWallet.getAddress();

      if (!isOk(agentAddress)) {
        trace.fail(fundingStep.id, 'Agent wallet unavailable.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return agentAddress;
      }

      const funding = await this.account.sendPayment({
        from: userId,
        to: agentAddress.value.address,
        amount: order.value.payment.amount,
        chainId: order.value.payment.chainId,
        token: order.value.payment.token,
      });

      if (!isOk(funding)) {
        trace.fail(fundingStep.id, 'Agent wallet funding failed.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return funding;
      }

      trace.complete(fundingStep.id);

      const settleStep = trace.start(`Paid via ${this.agentWallet.label}`, { badge: 'NO POPUP' });
      const settlement = await this.agentWallet.settlePayment({
        to: order.value.payment.address,
        amount: order.value.payment.amount,
        token: order.value.payment.token,
        chainId: order.value.payment.chainId,
      });

      if (!isOk(settlement)) {
        trace.fail(settleStep.id, 'Gasless settlement failed.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return settlement;
      }

      trace.complete(settleStep.id);
      await this.orders.updateStatus(
        order.value.id,
        'payment_pending',
        this.withPaymentTxHash(order.value, settlement.value.txHash),
      );

      this.logger.info(
        {
          orderId: order.value.id,
          providerId: provider.id,
          txHash: settlement.value.txHash,
          agentWallet: this.agentWallet.label,
        },
        'Cash-out payment submitted via agent wallet.',
      );

      return ok({
        orderId: order.value.id,
        status: 'payment_pending',
        trace: trace.steps,
        ...(securityResult !== undefined ? { securityVerdict: securityResult } : {}),
      });
    }

    const paymentStep = trace.start('Signing payment', { badge: 'NO POPUP' });
    const payment = await this.account.sendPayment({
      from: userId,
      to: order.value.payment.address,
      amount: order.value.payment.amount,
      chainId: order.value.payment.chainId,
      token: order.value.payment.token,
    });

    if (!isOk(payment)) {
      trace.fail(paymentStep.id, 'Payment failed.');
      await this.orders.updateStatus(order.value.id, 'failed');
      return payment;
    }

    trace.complete(paymentStep.id);
    await this.orders.updateStatus(
      order.value.id,
      'payment_pending',
      this.withPaymentTxHash(order.value, payment.value.txHash),
    );

    this.logger.info(
      {
        orderId: order.value.id,
        providerId: provider.id,
        txHash: payment.value.txHash,
      },
      'Cash-out payment submitted.',
    );

    return ok({
      orderId: order.value.id,
      status: 'payment_pending',
      trace: trace.steps,
      ...(securityResult !== undefined ? { securityVerdict: securityResult } : {}),
    });
  }

  private withPaymentTxHash(order: Order, txHash: string): Partial<Order> {
    return {
      payment: {
        ...order.payment,
        txHash,
      },
    };
  }
}
