import { Hono } from 'hono';

import { createRuntimeAppServices } from './bootstrap/create-runtime-app-services';
import { createAgentRoutes } from './routes/agent';
import { createBalanceRoutes } from './routes/balance';
import { createOrderRoutes } from './routes/orders';
import { createBitrefillWebhookRoutes } from './routes/webhooks/bitrefill';
import type { BalanceServiceLike } from './services/balance-service';
import { BitrefillWebhookService } from './services/bitrefill-webhook-service';
import type { AgentChatServiceLike } from './services/agent-chat-service';
import type { OrderServiceLike } from './services/order-service';

export function createApp(options: { agentService?: AgentChatServiceLike; balanceService?: BalanceServiceLike; orderService?: OrderServiceLike; bitrefillWebhookService?: BitrefillWebhookService } = {}): Hono {
  const app = new Hono();
  const runtimeServices = createRuntimeAppServices();
  const agentService = options.agentService ?? runtimeServices.agentService;
  const balanceService = options.balanceService ?? runtimeServices.balanceService;
  const orderService = options.orderService ?? runtimeServices.orderService;
  const bitrefillWebhookService = options.bitrefillWebhookService ?? runtimeServices.bitrefillWebhookService;

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

  return app;
}

export const app = createApp();
