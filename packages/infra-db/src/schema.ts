import { jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  magicPublicKey: text('magic_public_key'),
  evmAddress: text('evm_address'),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  providerId: text('provider_id').notNull(),
  providerOrderId: text('provider_order_id'),
  category: text('category').notNull(),
  product: jsonb('product').notNull(),
  amountUsd: numeric('amount_usd', { precision: 12, scale: 2 }).notNull(),
  paymentAddress: text('payment_address'),
  paymentChainId: numeric('payment_chain_id', { precision: 10, scale: 0 }),
  paymentToken: text('payment_token').notNull().default('USDC'),
  paymentTxHash: text('payment_tx_hash'),
  status: text('status').notNull(),
  redemptionCode: text('redemption_code'),
  redemptionLink: text('redemption_link'),
  redemptionInstructions: text('redemption_instructions'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ordersIdempotencyIdx: uniqueIndex('orders_idempotency_key_idx').on(table.idempotencyKey),
  ordersProviderOrderIdx: uniqueIndex('orders_provider_order_idx').on(table.providerId, table.providerOrderId),
}));

export const balanceSnapshots = pgTable('balance_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  totalUsd: numeric('total_usd', { precision: 12, scale: 2 }).notNull(),
  assets: jsonb('assets').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerId: text('provider_id').notNull(),
    eventId: text('event_id').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    webhookEventIdx: uniqueIndex('webhook_events_provider_event_idx').on(table.providerId, table.eventId),
  }),
);

export const agentRules = pgTable('agent_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  rule: jsonb('rule').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
