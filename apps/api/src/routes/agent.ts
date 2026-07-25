import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { AgentChatServiceLike } from '../services/agent-chat-service';
import { toDomainErrorMessage, toDomainErrorStatus } from './domain-errors';

export function createAgentRoutes(agentService: AgentChatServiceLike): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.post('/chat', async (context) => {
    let body: unknown;

    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'request body must be valid JSON' }, 400);
    }

    const payload = body as { message?: unknown };

    if (!body || typeof body !== 'object' || typeof payload.message !== 'string' || !payload.message.trim()) {
      return context.json({ error: 'message must be a non-empty string' }, 400);
    }

    if (payload.message.length > 2000) {
      return context.json({ error: 'message is too long (max 2000 characters)' }, 400);
    }

    // Identity from the JWT middleware (set to 'demo-user' in demo mode). Body is never trusted.
    const userId = context.get('userId') ?? 'demo-user';

    try {
      const result = await agentService.handleMessage(payload.message, userId);

      if (!result.ok) {
        context.status(toDomainErrorStatus(result.error));
        const detail = 'message' in result.error ? (result.error as { message: string }).message : undefined;
        return context.json({
          error: toDomainErrorMessage(result.error),
          type: result.error.type,
          ...(detail ? { detail } : {}),
        });
      }

      return context.json(result.value, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return context.json({ error: 'Chat service error', detail: msg }, 500);
    }
  });

  return router;
}
