import type { Order, OrderRepository, UserId } from '@pouch/domain';

export interface OrderServiceLike {
  getOrder(orderId: string, userId?: UserId): Promise<Order | null>;
}

export class OrderService implements OrderServiceLike {
  constructor(private readonly orders: OrderRepository) {}

  async getOrder(orderId: string, userId?: UserId): Promise<Order | null> {
    return this.orders.findById(orderId, userId);
  }
}
