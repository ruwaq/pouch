import { describe, expect, it } from 'vitest';

import { Hono } from 'hono';
import { SignJWT } from 'jose';

import { createAuthMiddleware, type AuthEnv } from './auth';

async function makeJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

// Builds a tiny Hono app that uses the auth middleware + one protected route
// that echoes back the ctx values, so we can assert on them.
function buildApp(options: { jwtSecret: string; allowDemoFallback: boolean }) {
  const app = new Hono<AuthEnv>();
  app.use('*', createAuthMiddleware({
    jwtSecret: options.jwtSecret,
    publicPaths: new Set(['/health']),
    allowDemoFallback: options.allowDemoFallback,
  }));

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/balance', (c) => c.json({ userId: c.get('userId'), evmAddress: c.get('evmAddress') }));
  return app;
}

describe('auth middleware', () => {
  it('populates ctx.userId + ctx.evmAddress from a valid JWT cookie', async () => {
    const secret = 'a'.repeat(32);
    const jwt = await makeJwt(secret, { sub: 'user-1', evmAddress: '0xabc' });
    const app = buildApp({ jwtSecret: secret, allowDemoFallback: false });

    const res = await app.request('/balance', {
      headers: { Cookie: `pouch_session=${jwt}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-1', evmAddress: '0xabc' });
  });

  it('skips public paths without touching the cookie', async () => {
    const app = buildApp({ jwtSecret: 'a'.repeat(32), allowDemoFallback: false });

    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('returns 401 when the JWT is missing on a protected path (production mode)', async () => {
    const app = buildApp({ jwtSecret: 'a'.repeat(32), allowDemoFallback: false });

    const res = await app.request('/balance');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('falls back to demo-user when allowDemoFallback is true and no cookie is present', async () => {
    const app = buildApp({ jwtSecret: 'a'.repeat(32), allowDemoFallback: true });

    const res = await app.request('/balance');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'demo-user', evmAddress: undefined });
  });

  it('treats a forged (invalid-signature) cookie like a missing cookie when allowDemoFallback is true', async () => {
    // Regression guard for the demo-delivery decision (2026-07-26): in production we
    // now allow demo fallback so judges without a session can use the app. This means
    // a tampered cookie must NOT 401 — it must silently fall through to demo-user,
    // exactly like an absent cookie, so a stale/bad cookie never blocks a judge.
    const app = buildApp({ jwtSecret: 'a'.repeat(32), allowDemoFallback: true });

    const res = await app.request('/balance', {
      headers: { Cookie: 'pouch_session=this-is-not-a-jwt' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'demo-user', evmAddress: undefined });
  });
});
