import { jwtVerify } from 'jose';
import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';

export interface AuthEnv {
  Variables: {
    userId?: string;
    evmAddress?: string;
  };
}

export function createAuthMiddleware(options: {
  jwtSecret: string;
  publicPaths: Set<string>;
  /**
   * When true (demo/local-dev mode), a missing cookie is treated as a 'demo-user'
   * session instead of returning 401. This keeps existing tests and local dev
   * working without requiring a real Magic login. Production always sets this false.
   */
  allowDemoFallback: boolean;
}): MiddlewareHandler<AuthEnv> {
  const secret = new TextEncoder().encode(options.jwtSecret);

  return async (ctx, next) => {
    const path = ctx.req.path;

    // Public paths + auth routes + webhooks skip auth entirely.
    if (options.publicPaths.has(path) || path.startsWith('/auth/') || path.startsWith('/webhooks/')) {
      await next();
      return;
    }

    const token = getCookie(ctx, 'pouch_session');

    if (!token) {
      if (options.allowDemoFallback) {
        ctx.set('userId', 'demo-user');
        await next();
        return;
      }
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });

      if (typeof payload.sub === 'string') {
        ctx.set('userId', payload.sub);
      }
      if (typeof payload.evmAddress === 'string') {
        ctx.set('evmAddress', payload.evmAddress);
      }

      await next();
    } catch {
      if (options.allowDemoFallback) {
        ctx.set('userId', 'demo-user');
        await next();
        return;
      }
      return ctx.json({ error: 'Unauthorized' }, 401);
    }
  };
}
