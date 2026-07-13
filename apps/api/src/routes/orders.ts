import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { OrderServiceLike } from '../services/order-service';

export function createOrderRoutes(orderService: OrderServiceLike): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get('/:id', async (context) => {
    const orderId = context.req.param('id');
    // Prefer userId from the auth context; fall back to ?userId= for demo.
    const userId = context.get('userId') ?? context.req.query('userId');

    const order = await orderService.getOrder(orderId, userId);

    if (!order) {
      context.status(404);
      return context.json({ error: 'Order not found' });
    }

    return context.json(order);
  });

  return router;
}
