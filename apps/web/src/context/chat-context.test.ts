import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatResponse } from '../lib/types';

vi.mock('../lib/api-client', () => ({ apiPost: vi.fn() }));
import { apiPost } from '../lib/api-client';
import { sendChatMessage } from './chat-context';

const fakeAgentResponse: AgentChatResponse = {
  orderId: 'order-1',
  status: 'delivered',
  trace: [],
  intent: {
    action: 'cash_out',
    category: 'giftcard',
    amount: { value: 25, currency: 'USD' },
  },
  reply: 'Done.',
  phase: 'reply',
} as AgentChatResponse;

describe('chat-context helpers', () => {
  afterEach(() => vi.clearAllMocks());

  it('sendChatMessage posts to /agent/chat and returns the AgentChatResponse', async () => {
    vi.mocked(apiPost).mockResolvedValue(fakeAgentResponse);
    const result = await sendChatMessage('Cash out $25 to Amazon', 'demo-user');
    expect(apiPost).toHaveBeenCalledWith('/agent/chat', {
      message: 'Cash out $25 to Amazon',
      userId: 'demo-user',
    });
    expect(result.reply).toBe('Done.');
  });

  it('sendChatMessage omits userId when undefined', async () => {
    vi.mocked(apiPost).mockResolvedValue(fakeAgentResponse);
    await sendChatMessage('hello');
    expect(apiPost).toHaveBeenCalledWith('/agent/chat', { message: 'hello' });
  });
});
