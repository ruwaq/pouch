import { eq, and } from 'drizzle-orm';

import type { Order, OrderRepository } from '@pouch/domain';

import type { createDatabase } from '../client';
import { orders } from '../schema';

type Database = ReturnType<typeof createDatabase>;
type OrderRow = typeof orders.$inferSelect;
type OrderInsertRow = typeof orders.$inferInsert;

function toUsdString(value: number): string {
  return value.toFixed(2);
}

export function mapOrderToRow(order: Order): OrderInsertRow {
  return {
    id: order.id,
    providerId: order.providerId,
    ...(order.userId ? { userId: order.userId } : {}),
    ...(order.providerOrderId ? { providerOrderId: order.providerOrderId } : {}),
    category: order.product.category,
    product: order.product,
    amountUsd: toUsdString(order.faceValue.value),
    ...(order.payment.address ? { paymentAddress: order.payment.address } : {}),
    paymentChainId: String(order.payment.chainId),
    paymentToken: order.payment.token,
    ...(order.payment.txHash ? { paymentTxHash: order.payment.txHash } : {}),
    status: order.status,
    ...(order.redemption?.code ? { redemptionCode: order.redemption.code } : {}),
    ...(order.redemption?.link ? { redemptionLink: order.redemption.link } : {}),
    ...(order.redemption?.instructions ? { redemptionInstructions: order.redemption.instructions } : {}),
    idempotencyKey: order.idempotencyKey,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function mapRowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    ...(row.providerOrderId ? { providerOrderId: row.providerOrderId } : {}),
    providerId: row.providerId,
    product: row.product as Order['product'],
    faceValue: {
      value: Number(row.amountUsd),
      currency: 'USD',
    },
    payment: {
      ...(row.paymentAddress ? { address: row.paymentAddress } : {}),
      amount: {
        value: Number(row.amountUsd),
        currency: 'USD',
      },
      chainId: row.paymentChainId ? Number(row.paymentChainId) : 0,
      token: row.paymentToken,
      ...(row.paymentTxHash ? { txHash: row.paymentTxHash } : {}),
    },
    status: row.status as Order['status'],
    ...(row.redemptionCode
      ? {
          redemption: {
            code: row.redemptionCode,
            ...(row.redemptionLink ? { link: row.redemptionLink } : {}),
            ...(row.redemptionInstructions ? { instructions: row.redemptionInstructions } : {}),
          },
        }
      : {}),
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: Database) {}

  async save(order: Order): Promise<void> {
    await this.db.insert(orders).values(mapOrderToRow(order));
  }

  async findById(id: string, userId?: Order['userId']): Promise<Order | null> {
    const [row] = userId
      ? await this.db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).limit(1)
      : await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);

    return row ? mapRowToOrder(row) : null;
  }

  async findByProviderOrderId(providerId: string, providerOrderId: string): Promise<Order | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.providerId, providerId), eq(orders.providerOrderId, providerOrderId)))
      .limit(1);

    return row ? mapRowToOrder(row) : null;
  }

  async updateStatus(id: string, status: Order['status'], updates?: Partial<Order>): Promise<void> {
    await this.db
      .update(orders)
      .set({
        status,
        ...(updates?.payment?.txHash ? { paymentTxHash: updates.payment.txHash } : {}),
        ...(updates?.redemption?.code ? { redemptionCode: updates.redemption.code } : {}),
        ...(updates?.redemption?.link ? { redemptionLink: updates.redemption.link } : {}),
        ...(updates?.redemption?.instructions
          ? { redemptionInstructions: updates.redemption.instructions }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));
  }
}
