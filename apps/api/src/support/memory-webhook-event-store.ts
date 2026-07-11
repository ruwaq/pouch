import type { WebhookEventStore } from '@pouch/infra-db';

export class MemoryWebhookEventStore implements WebhookEventStore {
  private readonly events = new Set<string>();

  async recordIfNew(providerId: string, eventId: string): Promise<boolean> {
    const key = `${providerId}:${eventId}`;

    if (this.events.has(key)) {
      return false;
    }

    this.events.add(key);
    return true;
  }

  async markProcessed(): Promise<void> {}
}
