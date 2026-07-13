import { Hono } from 'hono';

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

  app.get('/health', (context) => {
    return context.json({
      ok: true,
      service: 'api',
      mode: runtimeServices.mode,
    });
  });

  app.route('/agent', createAgentRoutes(agentService));
  app.route('/balance', createBalanceRoutes(balanceService));
  app.route('/orders', createOrderRoutes(orderService));

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
