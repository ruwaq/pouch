import type { Order, OrderRepository, OrderStatus } from '@pouch/domain';

export class MemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }

  async findById(id: string, userId?: string): Promise<Order | null> {
    const order = this.orders.get(id) ?? null;

    if (!order) {
      return null;
    }

    if (userId && order.userId && order.userId !== userId) {
      return null;
    }

    return order;
  }

  async findByProviderOrderId(providerId: string, providerOrderId: string): Promise<Order | null> {
    return (
      [...this.orders.values()].find(
        (order) => order.providerId === providerId && order.providerOrderId === providerOrderId,
      ) ?? null
    );
  }

  async updateStatus(id: string, status: OrderStatus, updates?: Partial<Order>): Promise<void> {
    const current = this.orders.get(id);

    if (!current) {
      return;
    }

    this.orders.set(id, {
      ...current,
      ...updates,
      ...(updates?.payment ? { payment: { ...current.payment, ...updates.payment } } : {}),
      ...(updates?.redemption ? { redemption: { ...current.redemption, ...updates.redemption } } : {}),
      status,
      updatedAt: new Date(),
    });
  }
}
