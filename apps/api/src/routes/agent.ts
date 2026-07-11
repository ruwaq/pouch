import { Hono } from 'hono';

import type { AgentChatServiceLike } from '../services/agent-chat-service';
import { toDomainErrorMessage, toDomainErrorStatus } from './domain-errors';

export function createAgentRoutes(agentService: AgentChatServiceLike): Hono {
  const router = new Hono();

  router.post('/chat', async (context) => {
    let body: unknown;

    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'request body must be valid JSON' }, 400);
    }

    const payload = body as {
      message?: unknown;
      userId?: unknown;
    };

    if (!body || typeof body !== 'object' || typeof payload.message !== 'string' || !payload.message.trim()) {
      return context.json({ error: 'message must be a non-empty string' }, 400);
    }

    const userId = typeof payload.userId === 'string' && payload.userId.trim() ? payload.userId : 'demo-user';
    const result = await agentService.handleMessage(payload.message, userId);

    if (!result.ok) {
      context.status(toDomainErrorStatus(result.error));
      return context.json({
        error: toDomainErrorMessage(result.error),
        type: result.error.type,
      });
    }

    return context.json(result.value, 200);
  });

  return router;
}
