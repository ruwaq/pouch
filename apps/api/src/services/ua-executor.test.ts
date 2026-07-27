import { describe, expect, it } from 'vitest';

import { UaExecutor, type UaExecutorClient } from './ua-executor';

// A fake UaExecutorClient that resolves a consolidation in one poll tick.
function fakeClient(overrides: Partial<UaExecutorClient> = {}): UaExecutorClient {
  const plan = {
    transactionId: 'tx-1',
    rootHash: '0xroot',
    userOps: [{ userOpHash: '0xop1', eip7702Delegated: true }],
  };
  return {
    async createConvertTransaction() {
      return plan;
    },
    async sendTransaction() {
      return { transactionId: 'tx-1' };
    },
    async getTransaction() {
      return { status: 7 }; // FINISHED
    },
    ...overrides,
  };
}

describe('UaExecutor.executeConsolidation', () => {
  it('plans, sends, polls to FINISHED, and returns a receipt', async () => {
    const executor = new UaExecutor(fakeClient(), { pollIntervalMs: 0, maxPolls: 5 });
    const receipt = await executor.executeConsolidation({
      targetChainId: 42161,
      token: 'USDC',
      amount: '2',
    });
    expect(receipt.ok).toBe(true);
    expect(receipt.transactionId).toBe('tx-1');
    expect(receipt.activityUrl).toContain('universalx.app/activity/details?id=tx-1');
  });

  it('returns a failed receipt when status is 6 (FAILED)', async () => {
    const client = fakeClient({ async getTransaction() { return { status: 6 }; } });
    const executor = new UaExecutor(client, { pollIntervalMs: 0, maxPolls: 5 });
    const receipt = await executor.executeConsolidation({
      targetChainId: 42161,
      token: 'USDC',
      amount: '2',
    });
    expect(receipt.ok).toBe(false);
    expect(receipt.error).toMatch(/failed/i);
  });

  it('returns a timeout receipt when status never reaches 7 within maxPolls', async () => {
    const client = fakeClient({ async getTransaction() { return { status: 1 }; } });
    const executor = new UaExecutor(client, { pollIntervalMs: 0, maxPolls: 3 });
    const receipt = await executor.executeConsolidation({
      targetChainId: 42161,
      token: 'USDC',
      amount: '2',
    });
    expect(receipt.ok).toBe(false);
    expect(receipt.timedOut).toBe(true);
  });

  it('surfaces the rate-limit error from sendTransaction as a typed error', async () => {
    const client = fakeClient({
      async sendTransaction() {
        throw new Error('Can only be converted once per minute');
      },
    });
    const executor = new UaExecutor(client, { pollIntervalMs: 0, maxPolls: 5 });
    const receipt = await executor.executeConsolidation({
      targetChainId: 42161,
      token: 'USDC',
      amount: '2',
    });
    expect(receipt.ok).toBe(false);
    expect(receipt.rateLimited).toBe(true);
  });

  it('returns a timed-out receipt (with transactionId) if getTransaction always throws', async () => {
    const client = fakeClient({
      async getTransaction() {
        throw new Error('transient network error');
      },
    });
    const executor = new UaExecutor(client, { pollIntervalMs: 0, maxPolls: 3 });
    const receipt = await executor.executeConsolidation({
      targetChainId: 42161,
      token: 'USDC',
      amount: '2',
    });
    // The tx was sent successfully — the receipt must preserve transactionId + activityUrl.
    expect(receipt.ok).toBe(false);
    expect(receipt.timedOut).toBe(true);
    expect(receipt.transactionId).toBe('tx-1');
    expect(receipt.activityUrl).toContain('universalx.app/activity/details?id=tx-1');
  });
});
