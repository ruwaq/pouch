import { describe, expect, it } from 'vitest';

import type { LoggerPort } from '@pouch/domain';

import { OpenfortAgentWallet, type OpenfortClientLike } from '../src/openfort/openfort-provider';

const noopLogger: LoggerPort = { info() {}, error() {} };

function fakeClient(overrides: Partial<OpenfortClientLike> = {}): OpenfortClientLike {
  return {
    accounts: {
      evm: {
        backend: {
          create: overrides.accounts?.evm?.backend?.create ?? (async () => ({
            id: 'acc_1',
            address: '0xagent-wallet',
          })),
          sendTransaction:
            overrides.accounts?.evm?.backend?.sendTransaction ??
            (async () => ({
              response: { transactionHash: '0xgasless-tx' },
            })),
        },
      },
    },
  } as OpenfortClientLike;
}

// Helper: wrap a client in a factory so the constructor gets a lazy resolver.
function factoryFor(client: OpenfortClientLike): () => Promise<OpenfortClientLike> {
  return async () => client;
}

describe('OpenfortAgentWallet', () => {
  it('exposes the "Openfort gasless" label', () => {
    const wallet = new OpenfortAgentWallet(factoryFor(fakeClient()), 'fes_test', noopLogger);
    expect(wallet.label).toBe('Openfort gasless');
  });

  it('getAddress resolves the backend wallet address', async () => {
    const wallet = new OpenfortAgentWallet(factoryFor(fakeClient()), 'fes_test', noopLogger);

    const result = await wallet.getAddress();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.address).toBe('0xagent-wallet');
  });

  it('caches the wallet address across calls (does not create twice)', async () => {
    let createCount = 0;
    const client = fakeClient({
      accounts: {
        evm: {
          backend: {
            create: async () => {
              createCount += 1;
              return { id: 'acc_1', address: '0xagent-wallet' };
            },
            sendTransaction: async () => ({ response: { transactionHash: '0x' } }),
          },
        },
      },
    });
    const wallet = new OpenfortAgentWallet(factoryFor(client), 'fes_test', noopLogger);

    await wallet.getAddress();
    await wallet.getAddress();

    expect(createCount).toBe(1);
  });

  it('settlePayment encodes ERC-20 transfer and calls sendTransaction with the feeSponsorshipId as policy', async () => {
    let sentArgs: unknown = null;
    const client = fakeClient({
      accounts: {
        evm: {
          backend: {
            create: async () => ({ id: 'acc_1', address: '0xagent-wallet' }),
            sendTransaction: async (args: unknown) => {
              sentArgs = args;
              return { response: { transactionHash: '0xgasless-tx' } };
            },
          },
        },
      },
    });
    const wallet = new OpenfortAgentWallet(factoryFor(client), 'fes_test_123', noopLogger);

    // Recipient must be a valid 40-hex address: ethers v6 validates the `to`
    // argument inside encodeFunctionData('transfer', [to, amount]).
    const result = await wallet.settlePayment({
      to: '0x1111111111111111111111111111111111111111',
      amount: { value: 25, currency: 'USD' },
      token: '0xaf88d61464a02d2e5e4f92bf5d4c0a6c6c1c0a6c',
      chainId: 42161,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.txHash).toBe('0xgasless-tx');

    const args = sentArgs as {
      account: { id: string };
      chainId: number;
      interactions: Array<{ to: string; data: string }>;
      policy: string;
    };
    expect(args.account.id).toBe('acc_1');
    expect(args.policy).toBe('fes_test_123');
    expect(args.chainId).toBe(42161);
    expect(args.interactions[0]?.to).toBe('0xaf88d61464a02d2e5e4f92bf5d4c0a6c6c1c0a6c');
    // ERC-20 transfer(address,uint256) selector = 0xa9059cbb
    expect(args.interactions[0]?.data.startsWith('0xa9059cbb')).toBe(true);
  });

  it('returns AGENT_WALLET_SETTLE_FAILED when sendTransaction throws', async () => {
    const client = fakeClient({
      accounts: {
        evm: {
          backend: {
            create: async () => ({ id: 'acc_1', address: '0xagent-wallet' }),
            sendTransaction: async () => {
              throw new Error('policy fes_test not found');
            },
          },
        },
      },
    });
    const wallet = new OpenfortAgentWallet(factoryFor(client), 'fes_test', noopLogger);

    const result = await wallet.settlePayment({
      to: '0x2222222222222222222222222222222222222222',
      amount: { value: 25, currency: 'USD' },
      token: '0x3333333333333333333333333333333333333333',
      chainId: 42161,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AGENT_WALLET_SETTLE_FAILED');
  });

  it('returns AGENT_WALLET_SETTLE_FAILED when getAddress (backend.create) throws', async () => {
    const client = fakeClient({
      accounts: {
        evm: {
          backend: {
            create: async () => {
              throw new Error('401 invalid secret key');
            },
            sendTransaction: async () => ({ response: { transactionHash: '0x' } }),
          },
        },
      },
    });
    const wallet = new OpenfortAgentWallet(factoryFor(client), 'fes_test', noopLogger);

    const result = await wallet.getAddress();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AGENT_WALLET_SETTLE_FAILED');
  });

  it('returns AGENT_WALLET_SETTLE_FAILED when the clientFactory itself throws (SDK load failure)', async () => {
    const failingFactory = async (): Promise<OpenfortClientLike> => {
      throw new Error('cannot resolve @openfort/openfort-node module');
    };
    const wallet = new OpenfortAgentWallet(failingFactory, 'fes_test', noopLogger);

    const result = await wallet.getAddress();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AGENT_WALLET_SETTLE_FAILED');
  });
});
