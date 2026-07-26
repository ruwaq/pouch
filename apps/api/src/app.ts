import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { SignJWT } from 'jose';

import { createRuntimeAppServices } from './bootstrap/create-runtime-app-services';
import { createAuthMiddleware, type AuthEnv } from './middleware/auth';
import { createAgentRoutes } from './routes/agent';
import { createAuthRoutes } from './routes/auth';
import { createBalanceRoutes } from './routes/balance';
import { createOrderRoutes } from './routes/orders';
import { createTransactionRoutes } from './routes/transactions';
import { createBitrefillWebhookRoutes } from './routes/webhooks/bitrefill';
import type { BalanceServiceLike } from './services/balance-service';
import { BitrefillWebhookService } from './services/bitrefill-webhook-service';
import type { AgentChatServiceLike } from './services/agent-chat-service';
import type { AuthService } from './services/auth-service';
import type { OrderServiceLike } from './services/order-service';
import type { TransactionPlanner } from './services/transaction-planner';

// ── Rate limiter (in-memory, per-IP) ──────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per window

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 300_000);

export function createApp(options: { agentService?: AgentChatServiceLike; balanceService?: BalanceServiceLike; orderService?: OrderServiceLike; bitrefillWebhookService?: BitrefillWebhookService; authService?: AuthService; transactionPlanner?: TransactionPlanner } = {}): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const runtimeServices = createRuntimeAppServices();
  const agentService = options.agentService ?? runtimeServices.agentService;
  const balanceService = options.balanceService ?? runtimeServices.balanceService;
  const orderService = options.orderService ?? runtimeServices.orderService;
  const bitrefillWebhookService = options.bitrefillWebhookService ?? runtimeServices.bitrefillWebhookService;

  // ── Rate limiter middleware ───────────────────────────────────────
  app.use('*', async (context, next) => {
    const ip = context.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? context.req.header('x-real-ip')
      ?? '127.0.0.1';
    if (!rateLimit(ip)) {
      return context.json({ error: 'Too many requests. Please try again later.' }, 429);
    }
    await next();
  });

  // Auth middleware — demo mode falls back to 'demo-user' when no cookie is present
  // (keeps existing tests + local dev working without a real Magic login).
  const isProduction = process.env.NODE_ENV === 'production';
  const isDemo = runtimeServices.mode === 'demo';
  const jwtSecret = process.env.JWT_SECRET;

  // Crash on missing JWT_SECRET in production (non-demo mode)
  if (!jwtSecret || jwtSecret === 'dev-insecure-secret-change-me') {
    if (isProduction && !isDemo) {
      throw new Error(
        'FATAL: JWT_SECRET is not set or is the insecure default. ' +
        'Set JWT_SECRET in environment or enable DEMO_MODE=true.',
      );
    }
  }
  const effectiveSecret = jwtSecret ?? 'dev-insecure-secret-change-me';

  // Demo fallback default (C2): production stays fail-closed (401 on missing cookie).
  // DEMO_FALLBACK_ENABLED is an explicit opt-in for live demos where the URL is shared
  // privately with non-malicious judges (e.g. the Jul 30 hackathon demo) and the wallet
  // whitelist gate (C5, private-key-provider.ts:392) already blocks any external send.
  // Without this flag a judge with no session cookie gets 401 and can't use the app.
  const demoFallbackExplicitlyEnabled = process.env.DEMO_FALLBACK_ENABLED === 'true';

  app.use('*', createAuthMiddleware({
    jwtSecret: effectiveSecret,
    publicPaths: new Set(['/', '/health']),
    allowDemoFallback: (isDemo && !isProduction) || demoFallbackExplicitlyEnabled,
  }));

  app.get('/', (context) => {
    return context.json({
      name: 'pouch-api',
      status: 'ok',
      mode: runtimeServices.mode,
    });
  });

  // Health endpoint — sanitized: no LLM response or internal details exposed
  app.get('/health', async (context) => {
    const llmProvider = (process.env.LLM_PROVIDER ?? '').trim();
    const hasGeminiKey = Boolean((process.env.GEMINI_API_KEY ?? '').trim());

    let geminiStatus: string = 'not_tested';
    if (hasGeminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': process.env.GEMINI_API_KEY!.trim(),
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Say "ok"' }] }],
            }),
          },
        );
        geminiStatus = res.ok ? 'ok' : `error_${res.status}`;
      } catch {
        geminiStatus = 'fetch_error';
      }
    }

    return context.json({
      ok: true,
      service: 'api',
      mode: runtimeServices.mode,
      llm: llmProvider || 'none',
      geminiConfigured: hasGeminiKey,
      geminiStatus,
    });
  });

  app.route('/agent', createAgentRoutes(agentService));
  app.route('/balance', createBalanceRoutes(balanceService));
  app.route('/orders', createOrderRoutes(orderService));

  // Demo login — creates a session for judges who don't want to sign up.
  // Issues a valid JWT for 'demo-user' so the app works without Magic.
  // C3: only mount outside production so anonymous clients can't mint demo
  // tokens in prod.
  if (!isProduction) {
    app.post('/auth/demo', async (context) => {
      const secret = new TextEncoder().encode(effectiveSecret);
      const jwt = await new SignJWT({ sub: 'demo-user', evmAddress: '0xdemo' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);

      setCookie(context, 'pouch_session', jwt, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'Strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return context.json({ userId: 'demo-user', evmAddress: '0xdemo' }, 200);
    });
  }

  if (bitrefillWebhookService) {
    app.route('/webhooks/bitrefill', createBitrefillWebhookRoutes(bitrefillWebhookService));
  }

  if (options.authService) {
    app.route('/auth', createAuthRoutes(options.authService));
  }

  if (options.transactionPlanner) {
    app.route('/transactions', createTransactionRoutes(options.transactionPlanner));
  }

  return app;
}

export const app = createApp();