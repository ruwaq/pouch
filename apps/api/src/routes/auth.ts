import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

import type { AuthService } from '../services/auth-service';

export function createAuthRoutes(authService: AuthService): Hono {
  const router = new Hono();

  router.post('/callback', async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'request body must be valid JSON' }, 400);
    }

    const didToken = (body as { didToken?: unknown })?.didToken;
    if (typeof didToken !== 'string' || !didToken.trim()) {
      return context.json({ error: 'didToken must be a non-empty string' }, 400);
    }

    const result = await authService.handleCallback(didToken);

    if (!result.ok) {
      const status = result.error.type === 'AUTH_INVALID_DID' ? 401 : 500;
      return context.json({ error: result.error.message, type: result.error.type }, status);
    }

    // Set the JWT in an httpOnly cookie (7-day browser session; JWT itself expires in 24h)
    setCookie(context, 'pouch_session', result.value.jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return context.json({ userId: result.value.userId, evmAddress: result.value.evmAddress }, 200);
  });

  router.post('/logout', (context) => {
    deleteCookie(context, 'pouch_session', { path: '/' });
    return context.json({ ok: true }, 200);
  });

  return router;
}
