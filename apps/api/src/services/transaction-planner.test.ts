import { describe, expect, it } from 'vitest';

import { TransactionPlanner, type UaClientLike } from './transaction-planner';

function fakeUa(plan: { transactionId: string; rootHash: string; userOps: unknown[] }): UaClientLike {
  return {
    async createConvertTransaction() { return plan as any; },
    async createTransferTransaction() { return plan as any; },
  };
}

describe('TransactionPlanner', () => {
  it('plans a consolidation transaction and returns the unsigned plan', async () => {
    const ua = fakeUa({ transactionId: 'tx-1', rootHash: '0xroot', userOps: [{ userOpHash: '0xop1', eip7702Delegated: true }] });
    const planner = new TransactionPlanner(ua);

    const plan = await planner.planConsolidation({
      ownerAddress: '0xabc',
      targetChainId: 42161,
      token: 'USDC',
      amount: '1.00',
    });

    expect(plan.transactionId).toBe('tx-1');
    expect(plan.rootHash).toBe('0xroot');
    expect(plan.requires7702Signature).toBe(false); // all userOps delegated
  });

  it('flags requires7702Signature when any userOp needs an auth', async () => {
    const ua = fakeUa({
      transactionId: 'tx-2',
      rootHash: '0xroot2',
      userOps: [
        { userOpHash: '0xop1', eip7702Delegated: true },
        { userOpHash: '0xop2', eip7702Auth: { chainId: 8453, nonce: 5, address: '0ximpl' }, eip7702Delegated: false },
      ],
    });
    const planner = new TransactionPlanner(ua);

    const plan = await planner.planConsolidation({ ownerAddress: '0xabc', targetChainId: 42161, token: 'USDC', amount: '1.00' });

    expect(plan.requires7702Signature).toBe(true);
    expect(plan.userOpsNeedingAuth).toHaveLength(1);
    expect(plan.userOpsNeedingAuth[0]).toMatchObject({ chainId: 8453, nonce: 5, address: '0ximpl' });
  });

  it('plans a payment transaction', async () => {
    const ua = fakeUa({ transactionId: 'tx-3', rootHash: '0xroot3', userOps: [] });
    const planner = new TransactionPlanner(ua);

    const plan = await planner.planPayment({
      ownerAddress: '0xabc',
      token: { chainId: 42161, address: '0xusdc' },
      amount: '5.00',
      receiver: '0xbitrefill',
    });

    expect(plan.transactionId).toBe('tx-3');
    expect(plan.requires7702Signature).toBe(false);
  });
});
