import { err, isOk, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import { OffRampRouter } from './router';
import { TraceRecorder } from './trace';
import type {
  AccountProvider,
  CashOutIntent,
  CashOutResult,
  LoggerPort,
  OffRampProvider,
  Order,
  OrderRepository,
  UserId,
} from './types';

export class CashOutExecutor {
  constructor(
    private readonly router: OffRampRouter,
    private readonly providers: readonly OffRampProvider[],
    private readonly account: AccountProvider,
    private readonly orders: OrderRepository,
    private readonly logger: LoggerPort,
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
