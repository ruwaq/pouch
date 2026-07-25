import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { createAgentRoutes } from './agent';
import type { AgentChatServiceLike } from '../services/agent-chat-service';

function buildAppWithUser(userId: string | undefined, captured: { userId?: string }) {
  const fakeService: AgentChatServiceLike = {
    async handleMessage(_message, uid) {
      captured.userId = uid;
      return {
        ok: true as const,
        value: {
          orderId: '',
          status: 'payment_pending',
          reply: 'ok',
          intent: { action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } },
          trace: [],
          phase: 'reply',
          llmReply: false,
        },
      };
    },
  };
  const parent = new Hono<AuthEnv>();
  if (userId !== undefined) {
    parent.use('*', async (c, next) => {
      c.set('userId', userId);
      await next();
    });
  }
  parent.route('/agent', createAgentRoutes(fakeService));
  return parent;
}

describe('POST /agent/chat identity (C4)', () => {
  it('uses authenticated userId and ignores body.userId', async () => {
    const captured: { userId?: string } = {};
    const app = buildAppWithUser('real-user', captured);
    const res = await app.request('/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi', userId: 'victim' }),
    });
    expect(res.status).toBe(200);
    expect(captured.userId).toBe('real-user');
  });

  it('falls back to demo-user when no authenticated principal is set', async () => {
    const captured: { userId?: string } = {};
    const app = buildAppWithUser(undefined, captured);
    const res = await app.request('/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi', userId: 'victim' }),
    });
    expect(res.status).toBe(200);
    expect(captured.userId).toBe('demo-user');
  });
});
