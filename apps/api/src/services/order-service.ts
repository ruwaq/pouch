import type { Order, OrderRepository } from '@pouch/domain';

export interface OrderServiceLike {
  getOrder(orderId: string): Promise<Order | null>;
}

export class OrderService implements OrderServiceLike {
  constructor(private readonly orders: OrderRepository) {}

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.findById(orderId);
  }
}
