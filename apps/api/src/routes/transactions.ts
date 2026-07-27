import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { TransactionPlanner } from '../services/transaction-planner';
import type { UaExecutor } from '../services/ua-executor';

export function createTransactionRoutes(
  planner: TransactionPlanner,
  uaExecutor?: UaExecutor,
): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  // Plan a consolidation (frontend will sign the rootHash + 7702 auths via Magic)
  router.post('/plan/consolidate', async (context) => {
    const evmAddress = context.get('evmAddress');
    if (!evmAddress) {
      return context.json({ error: 'Authenticated EVM address required.' }, 401);
    }

    const body = (await context.req.json().catch(() => null)) as { targetChainId?: number; token?: string; amount?: string } | null;
    if (!body?.targetChainId || !body.token || !body.amount) {
      return context.json({ error: 'targetChainId, token, and amount are required.' }, 400);
    }

    try {
      const plan = await planner.planConsolidation({
        ownerAddress: evmAddress,
        targetChainId: body.targetChainId,
        token: body.token,
        amount: body.amount,
      });
      return context.json(plan, 200);
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : 'Planning failed.' }, 500);
    }
  });

  // Plan a payment (frontend signs + sends)
  router.post('/plan/payment', async (context) => {
    const evmAddress = context.get('evmAddress');
    if (!evmAddress) {
      return context.json({ error: 'Authenticated EVM address required.' }, 401);
    }

    const body = (await context.req.json().catch(() => null)) as {
      token?: { chainId: number; address: string };
      amount?: string;
      receiver?: string;
    } | null;

    if (!body?.token || !body.amount || !body.receiver) {
      return context.json({ error: 'token, amount, and receiver are required.' }, 400);
    }

    try {
      const plan = await planner.planPayment({
        ownerAddress: evmAddress,
        token: body.token,
        amount: body.amount,
        receiver: body.receiver,
      });
      return context.json(plan, 200);
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : 'Planning failed.' }, 500);
    }
  });

  // Execute a consolidation server-side (frictionless: server signs, no browser signer).
  // Only mounted when DEMO_USE_UA=true wired a real UaExecutor.
  if (uaExecutor) {
    router.post('/execute', async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        targetChainId?: number;
        token?: string;
        amount?: string;
      } | null;
      if (!body?.targetChainId || !body.token || !body.amount) {
        return context.json({ error: 'targetChainId, token, and amount are required.' }, 400);
      }
      const receipt = await uaExecutor.executeConsolidation({
        targetChainId: body.targetChainId,
        token: body.token,
        amount: body.amount,
      });
      return context.json(receipt, receipt.ok ? 200 : 500);
    });
  }

  return router;
}
