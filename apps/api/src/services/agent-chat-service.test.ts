import { describe, expect, it } from 'vitest';

import { IntentParser } from '@pouch/domain';
import { CashOutExecutor, OffRampRouter } from '@pouch/domain';
import type { AccountProvider, DomainError, OffRampProvider } from '@pouch/domain';
import { ok, type Result } from '@pouch/shared';

import { AgentChatService } from './agent-chat-service';
import type { AgentChatResponse } from './agent-chat-service';
import { BalanceService } from './balance-service';
import { MemoryOrderRepository } from '../support/memory-order-repository';

const logger = { info() {}, error() {} };

/**
 * C6 regression: the demo-fallback that fabricates a 'delivered' receipt on a
 * real send/swap/fund-gas failure must ONLY fire for the demo user. Real users
 * must get the propagated error instead of a fake success with a 404 Arbiscan
 * link. We drive `executeSend` directly (it is private; cast to access) with an
 * account provider whose sendPayment always fails.
 */
function buildServiceWithFailingSend(): AgentChatService {
  const failingProvider: AccountProvider = {
    async getUnifiedBalance() {
      return ok({ total: 100, assets: [{ chainId: 42161, symbol: 'ARB', amount: 50, usdValue: 5 }], requiresConsolidation: false });
    },
    async consolidate() {
      return ok({ txHash: '0xconsolidate' });
    },
    async sendPayment() {
      return { ok: false, error: { type: 'UNKNOWN', message: 'RPC down' } } as Result<{ txHash: string }, DomainError>;
    },
    // executeSend reads getWalletInfo() to resolve from/to addresses.
    getWalletInfo() {
      return [
        { label: 'Wallet 1', address: '0x' + '11'.repeat(20), hasKey: true },
        { label: 'Wallet 2', address: '0x' + '22'.repeat(20), hasKey: true },
      ];
    },
  } as unknown as AccountProvider;

  const providers: OffRampProvider[] = [];
  const repository = new MemoryOrderRepository();
  const router = new OffRampRouter(providers);
  const executor = new CashOutExecutor(router, providers, failingProvider, repository, logger);
  return new AgentChatService(
    new IntentParser(),
    executor,
    repository,
    new BalanceService(failingProvider),
    providers,
    failingProvider,
  );
}

// A send intent that executeSend accepts: action 'send', token + labels resolved.
function makeSendIntent() {
  return {
    action: 'send' as const,
    category: 'giftcard' as const,
    amount: { value: 1, currency: 'USD' as const },
    token: 'ARB',
    fromLabel: 'Wallet 1',
    toLabel: 'Wallet 2',
    chainId: 42161,
  };
}

describe('AgentChatService.executeSend fake-receipt gate (C6)', () => {
  it('fabricates a delivered receipt for demo-user when send fails', async () => {
    const service = buildServiceWithFailingSend();
    const executeSend = (service as unknown as {
      executeSend: (this: unknown, u: string, i: unknown) => Promise<Result<AgentChatResponse, DomainError>>;
    }).executeSend.bind(service);

    const result = await executeSend('demo-user', makeSendIntent());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('delivered');
      expect(result.value.sendReceipt?.txHash).toMatch(/^0xsend-/);
    }
  });

  it('propagates the error for a real user when send fails', async () => {
    const service = buildServiceWithFailingSend();
    const executeSend = (service as unknown as {
      executeSend: (this: unknown, u: string, i: unknown) => Promise<Result<AgentChatResponse, DomainError>>;
    }).executeSend.bind(service);

    const result = await executeSend('real-user', makeSendIntent());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('UNKNOWN');
    }
  });

  it('propagates the error for the 0xdemo-style real address user', async () => {
    // A real EVM address must NOT be treated as demo (only literal 'demo-user'/'0xdemo').
    const service = buildServiceWithFailingSend();
    const executeSend = (service as unknown as {
      executeSend: (this: unknown, u: string, i: unknown) => Promise<Result<AgentChatResponse, DomainError>>;
    }).executeSend.bind(service);

    const result = await executeSend('0xabc1234567890123456789012345678901234567', makeSendIntent());

    expect(result.ok).toBe(false);
  });
});
