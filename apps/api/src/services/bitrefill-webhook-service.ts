import { isOk, ok, type Result } from '@pouch/shared';
import type { DomainError, OffRampProvider, OrderRepository, OrderStatus } from '@pouch/domain';
import type { WebhookEventStore } from '@pouch/infra-db';

export interface BitrefillWebhookResponse {
  received: true;
  duplicate: boolean;
  ignored?: boolean;
  status?: OrderStatus;
}

export class BitrefillWebhookService {
  constructor(
    private readonly provider: OffRampProvider,
    private readonly orders: OrderRepository,
    private readonly eventStore: WebhookEventStore,
  ) {}

  async handle(rawBody: string, headers: Record<string, string>): Promise<Result<BitrefillWebhookResponse, DomainError>> {
    const event = await this.provider.verifyWebhook(rawBody, headers);

    if (!isOk(event)) {
      return event;
    }

    const isNew = await this.eventStore.recordIfNew(event.value.providerId, event.value.eventId, event.value.payload);

    if (!isNew) {
      return ok({
        received: true,
        duplicate: true,
      });
    }

    if (!event.value.orderId) {
      await this.eventStore.markProcessed(event.value.providerId, event.value.eventId);

      return ok({
        received: true,
        duplicate: false,
        ignored: true,
      });
    }

    const order =
      (await this.orders.findByProviderOrderId(event.value.providerId, event.value.orderId)) ??
      (await this.orders.findById(event.value.orderId));

    if (!order) {
      await this.eventStore.markProcessed(event.value.providerId, event.value.eventId);

      return ok({
        received: true,
        duplicate: false,
        ignored: true,
      });
    }

    await this.orders.updateStatus(
      order.id,
      event.value.status,
      event.value.redemption ? { redemption: event.value.redemption } : undefined,
    );
    await this.eventStore.markProcessed(event.value.providerId, event.value.eventId);

    return ok({
      received: true,
      duplicate: false,
      ignored: false,
      status: event.value.status,
    });
  }
}
