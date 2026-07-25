import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { OrderServiceLike } from '../services/order-service';

export function createOrderRoutes(orderService: OrderServiceLike): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get('/:id', async (context) => {
    const orderId = context.req.param('id');
    // Identity MUST come from the auth context — never from the query string.
    // Orders contain sensitive redemption codes, so authentication is required
    // (no demo fallback here). In demo mode the middleware sets userId='demo-user'.
    const userId = context.get('userId');
    if (!userId) {
      context.status(401);
      return context.json({ error: 'Unauthorized' });
    }

    const order = await orderService.getOrder(orderId, userId);

    if (!order) {
      context.status(404);
      return context.json({ error: 'Order not found' });
    }

    return context.json(order);
  });

  return router;
}
