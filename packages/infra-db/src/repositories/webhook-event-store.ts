import { and, eq } from 'drizzle-orm';

import type { createDatabase } from '../client';
import { webhookEvents } from '../schema';

type Database = ReturnType<typeof createDatabase>;

export interface WebhookEventStore {
  recordIfNew(providerId: string, eventId: string, payload: unknown): Promise<boolean>;
  markProcessed(providerId: string, eventId: string): Promise<void>;
}

export class DrizzleWebhookEventStore implements WebhookEventStore {
  constructor(private readonly db: Database) {}

  async recordIfNew(providerId: string, eventId: string, payload: unknown): Promise<boolean> {
    const inserted = await this.db
      .insert(webhookEvents)
      .values({
        providerId,
        eventId,
        payload,
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });

    return inserted.length > 0;
  }

  async markProcessed(providerId: string, eventId: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(and(eq(webhookEvents.providerId, providerId), eq(webhookEvents.eventId, eventId)));
  }
}
