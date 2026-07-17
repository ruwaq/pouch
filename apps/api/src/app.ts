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

export function createApp(options: { agentService?: AgentChatServiceLike; balanceService?: BalanceServiceLike; orderService?: OrderServiceLike; bitrefillWebhookService?: BitrefillWebhookService; authService?: AuthService; transactionPlanner?: TransactionPlanner } = {}): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const runtimeServices = createRuntimeAppServices();
  const agentService = options.agentService ?? runtimeServices.agentService;
  const balanceService = options.balanceService ?? runtimeServices.balanceService;
  const orderService = options.orderService ?? runtimeServices.orderService;
  const bitrefillWebhookService = options.bitrefillWebhookService ?? runtimeServices.bitrefillWebhookService;

  // Auth middleware — demo mode falls back to 'demo-user' when no cookie is present
  // (keeps existing tests + local dev working without a real Magic login).
  const jwtSecret = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
  app.use('*', createAuthMiddleware({
    jwtSecret,
    publicPaths: new Set(['/', '/health']),
    allowDemoFallback: runtimeServices.mode === 'demo',
  }));

  app.get('/', (context) => {
    return context.json({
      name: 'pouch-api',
      status: 'ok',
      mode: runtimeServices.mode,
    });
  });

  app.get('/health', async (context) => {
    const llmProvider = (process.env.LLM_PROVIDER ?? '').trim();
    const hasGeminiKey = Boolean((process.env.GEMINI_API_KEY ?? '').trim());
    
    // Test Gemini API directly
    let geminiStatus = 'not_tested';
    let geminiReply = '';
    if (hasGeminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY!.trim()}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'System: You are a helpful assistant.\n\nUser: Say hi in one sentence' }] }] }) }
        );
        geminiStatus = res.ok ? 'ok' : `error_${res.status}`;
        if (res.ok) {
          const data = await res.json() as any;
          geminiReply = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').slice(0, 100);
        }
      } catch (e) {
        geminiStatus = `fetch_error: ${String(e).slice(0, 100)}`;
      }
    }
    
    return context.json({
      ok: true,
      service: 'api',
      mode: runtimeServices.mode,
      llm: llmProvider || 'none',
      geminiConfigured: hasGeminiKey,
      geminiStatus,
      geminiReply,
    });
  });

  app.route('/agent', createAgentRoutes(agentService));
  app.route('/balance', createBalanceRoutes(balanceService));
  app.route('/orders', createOrderRoutes(orderService));

  // Demo login — creates a session for judges who don't want to sign up.
  // Issues a valid JWT for 'demo-user' so the app works without Magic.
  app.post('/auth/demo', async (context) => {
    const secret = new TextEncoder().encode(jwtSecret);
    const jwt = await new SignJWT({ sub: 'demo-user', evmAddress: '0xdemo' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    setCookie(context, 'pouch_session', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return context.json({ userId: 'demo-user', evmAddress: '0xdemo' }, 200);
  });

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
