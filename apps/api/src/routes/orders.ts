import { Hono } from 'hono';

import type { OrderServiceLike } from '../services/order-service';

export function createOrderRoutes(orderService: OrderServiceLike): Hono {
  const router = new Hono();

  router.get('/:id', async (context) => {
    const orderId = context.req.param('id');
    const order = await orderService.getOrder(orderId);

    if (!order) {
      context.status(404);
      return context.json({ error: 'Order not found' });
    }

    return context.json(order);
  });

  return router;
}
