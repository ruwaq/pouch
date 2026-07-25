import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { createBalanceRoutes } from './balance';
import type { BalanceServiceLike } from '../services/balance-service';

function buildAppWithUser(
  userId: string | undefined,
  evmAddress: string | undefined,
  captured: { userId?: string },
) {
  const fakeService: BalanceServiceLike = {
    async getBalance(uid) {
      captured.userId = uid;
      return {
        ok: true as const,
        value: {
          total: 0,
          assets: [],
          requiresConsolidation: false,
        },
      };
    },
  };
  const parent = new Hono<AuthEnv>();
  if (userId !== undefined || evmAddress !== undefined) {
    parent.use('*', async (c, next) => {
      if (userId !== undefined) c.set('userId', userId);
      if (evmAddress !== undefined) c.set('evmAddress', evmAddress);
      await next();
    });
  }
  parent.route('/balance', createBalanceRoutes(fakeService));
  return parent;
}

describe('GET /balance identity (C4)', () => {
  it('uses authenticated userId and ignores ?userId=', async () => {
    const captured: { userId?: string } = {};
    const app = buildAppWithUser('real-user', undefined, captured);
    const res = await app.request('/balance?userId=victim');
    expect(res.status).toBe(200);
    expect(captured.userId).toBe('real-user');
  });

  it('prefers authenticated evmAddress over userId when set', async () => {
    const captured: { userId?: string } = {};
    const app = buildAppWithUser('real-user', '0xevm', captured);
    const res = await app.request('/balance?userId=victim');
    expect(res.status).toBe(200);
    expect(captured.userId).toBe('0xevm');
  });

  it('falls back to demo-user when no authenticated principal is set', async () => {
    const captured: { userId?: string } = {};
    const app = buildAppWithUser(undefined, undefined, captured);
    const res = await app.request('/balance?userId=victim');
    expect(res.status).toBe(200);
    expect(captured.userId).toBe('demo-user');
  });
});
