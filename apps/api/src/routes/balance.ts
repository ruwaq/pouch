import { Hono } from 'hono';

import type { BalanceServiceLike } from '../services/balance-service';
import { toDomainErrorMessage, toDomainErrorStatus } from './domain-errors';

export function createBalanceRoutes(balanceService: BalanceServiceLike): Hono {
  const router = new Hono();

  router.get('/', async (context) => {
    const userId = context.req.query('userId')?.trim() || 'demo-user';
    const result = await balanceService.getBalance(userId);

    if (!result.ok) {
      context.status(toDomainErrorStatus(result.error));
      return context.json({
        error: toDomainErrorMessage(result.error),
        type: result.error.type,
      });
    }

    return context.json({
      userId,
      ...result.value,
    });
  });

  return router;
}
