import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { BalanceServiceLike } from '../services/balance-service';
import { toDomainErrorMessage, toDomainErrorStatus } from './domain-errors';

export function createBalanceRoutes(balanceService: BalanceServiceLike): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get('/', async (context) => {
    // Prefer the authenticated EVM address (the real UA owner) from the auth context;
    // fall back to the auth userId, then to demo-user for local dev.
    // ?userId= is intentionally ignored — identity comes from the auth context only.
    const evmAddress = context.get('evmAddress');
    const userId = evmAddress ?? context.get('userId') ?? 'demo-user';
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
