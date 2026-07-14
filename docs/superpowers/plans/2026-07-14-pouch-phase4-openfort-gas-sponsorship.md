# Phase 4 — Openfort Gas Sponsorship + CI Lint + Demo Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Openfort gas-sponsorship bounty ($100) via an agent backend wallet, add the long-pending CI lint step, harden the demo frontend (error/empty/mobile states), and write the submission docs — closing the hackathon build.

**Architecture:** Add a pure `AgentWalletPort` to the domain and an optional `agentWallet` injection point in `CashOutExecutor`. When configured, the executor changes its settlement leg from "UA pays Bitrefill directly" to a two-step flow: UA funds the agent wallet (`Funding agent wallet [UA 7702]`), then the agent wallet pays Bitrefill gasless (`Paid via Openfort gasless [NO POPUP]`). `OpenfortAgentWallet` in infra-web3 implements the port using `@openfort/openfort-node@^0.10.8` with a deferred ESM import (same pattern that fixed the Phase 1 Particle blocker). When unconfigured, `NoopAgentWallet` / `undefined` keeps the existing demo path 100% unchanged. CI gets a lint+build job. Frontend gets error bubbles, skeleton balance, and mobile breakpoints.

**Tech Stack:** TypeScript, Hono, Next.js 15, Vitest, Zod, `@openfort/openfort-node@^0.10.8`, ethers v6, GitHub Actions, Tailwind v4.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/domain/src/agent-wallet.ts` | `AgentWalletPort` interface + `AgentWalletError` type (pure, no SDK). Re-exported from domain index. |
| `packages/infra-web3/src/openfort/openfort-provider.ts` | `OpenfortAgentWallet` implements `AgentWalletPort` — deferred SDK import, calldata encoding, gasless `sendTransaction`, error mapping. |
| `packages/infra-web3/src/openfort/openfort-mapper.ts` | Maps SDK errors → `DomainError`. Pure, no SDK import. |
| `packages/infra-web3/src/noop-agent-wallet.ts` | `NoopAgentWallet` — returns `AGENT_WALLET_NOT_CONFIGURED` error on every call. Factory default when Openfort unset. |
| `packages/infra-web3/__tests__/openfort-provider.test.ts` | Unit tests for `OpenfortAgentWallet` with a mocked SDK client (no real SDK in tests). |
| `packages/infra-web3/__tests__/openfort-mapper.test.ts` | Unit tests for the error mapper. |
| `packages/infra-web3/__tests__/agent-wallet-factory.test.ts` | Unit tests for `createAgentWallet` (demo noop vs configured Openfort vs prod fail-fast). |
| `apps/api/src/bootstrap/create-runtime-app-services-agent-wallet.test.ts` | Integration test: configured-mode executor gets an agent wallet; demo-mode gets none. |
| `docs/SUBMISSION.md` | Bounty mapping doc — each criterion → where it's satisfied in code/demo. |
| `apps/web/src/components/chat/AgentErrorBubble.tsx` | Friendly error rendering when `/agent/chat` returns a `DomainError`. |

### Modified files

| File | Changes |
|------|---------|
| `packages/domain/src/types.ts` | Add `AgentWalletPort` + `AGENT_WALLET_NOT_CONFIGURED` DomainError variant. |
| `packages/domain/src/errors.ts` | Add `AGENT_WALLET_NOT_CONFIGURED` + `AGENT_WALLET_SETTLE_FAILED` error types. |
| `packages/domain/src/executor.ts` | Accept optional `agentWallet?: AgentWalletPort`; when present, run two-step settlement. |
| `packages/domain/src/index.ts` | Re-export `agent-wallet.ts`. |
| `packages/domain/__tests__/executor.test.ts` | Add tests for the two-step settlement trace + demo-path-unchanged assertion. |
| `packages/shared/src/config.ts` | No change (OPENFORT_* fields already present from Phase 0). |
| `packages/infra-web3/src/factory.ts` | Add `createAgentWallet(config, logger): AgentWalletPort \| undefined` (synchronous). |
| `packages/infra-web3/src/index.ts` | Re-export openfort + noop modules. |
| `packages/infra-web3/package.json` | Add `@openfort/openfort-node@^0.10.8` dependency. |
| `apps/api/src/bootstrap/create-runtime-app-services.ts` | Call `createAgentWallet`, pass into `CashOutExecutor`. Add `createAgentWallet` to `RuntimeDependencies`. Stays synchronous. |
| `apps/api/src/routes/domain-errors.ts` | Add status + message for `AGENT_WALLET_NOT_CONFIGURED` + `AGENT_WALLET_SETTLE_FAILED`. |
| `.github/workflows/ci.yml` | Add `pnpm lint` + `pnpm build` steps; tighten to `--frozen-lockfile`. |
| `apps/web/src/components/chat/MessageList.tsx` | Render error as a friendly agent bubble instead of raw `ErrorMessage`. |
| `apps/web/src/components/chat/AgentErrorBubble.tsx` | New — friendly error bubble. |
| `apps/web/src/context/chat-context.tsx` | Capture `errorType` from `ApiError` so the UI can render domain-specific copy. |
| `apps/web/src/components/chat/BalancePill.tsx` | Add skeleton loading state. |
| `apps/web/src/components/chat/ChatView.tsx` | Mobile responsive breakpoints; clarify demo banner. |
| `apps/web/src/lib/api-client.ts` | No change — `ApiError.type` already plumbed (Task 10 reads it via context). |
| `README.md` | Submission README: pitch, bounties, run instructions, env checklist. |
| `AGENTS.md` | Mark Phase 4 done; update bounty table (ZeroDev out, Openfort in). |
| `docs/HANDOFF.md` | Update Phase 4 status to code-complete. |
| `.env.example` | Clarify Openfort comments (policy + feeSponsorship setup). |

---

## Task 1: Domain — `AgentWalletPort` + error types

**Files:**
- Modify: `packages/domain/src/errors.ts`
- Modify: `packages/domain/src/types.ts`
- Create: `packages/domain/src/agent-wallet.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/__tests__/executor.test.ts` (extended in Task 3)

- [ ] **Step 1: Add the new DomainError variants**

Edit `packages/domain/src/errors.ts` — add two error types to the `DomainError` union (before the closing of the union) and extend the `toDomainErrorMessage`/status mapping is in the API layer (Task 9). The domain only needs the type.

Replace the entire `DomainError` union (lines 3–12) with:

```typescript
export type DomainError =
  | { type: 'UNSUPPORTED_INTENT'; message: string }
  | { type: 'INVALID_INTENT_AMOUNT'; message: string }
  | { type: 'NO_PROVIDER_AVAILABLE'; category: OffRampCategory }
  | { type: 'ALL_PROVIDERS_FAILED' }
  | { type: 'INSUFFICIENT_FUNDS'; available: number; required: number }
  | { type: 'INVALID_PROVIDER_RESPONSE'; providerId: ProviderId; message: string }
  | { type: 'PROVIDER_NOT_FOUND'; providerId: ProviderId }
  | { type: 'PAYMENT_ADDRESS_MISSING'; orderId: string }
  | { type: 'AGENT_WALLET_NOT_CONFIGURED'; message: string }
  | { type: 'AGENT_WALLET_SETTLE_FAILED'; message: string; cause?: string }
  | { type: 'UNKNOWN'; message: string };
```

- [ ] **Step 2: Add `AgentWalletPort` to types.ts**

Add to `packages/domain/src/types.ts`, after the `AccountProvider` interface (after line 148):

```typescript
/** A gasless signer the agent uses to settle an order payment server-side. */
export interface AgentWalletPort {
  /** The agent wallet's address (where UA funds are sent before settlement). */
  getAddress(): Promise<Result<{ address: string }, DomainError>>;

  /** Send an ERC-20 `amount` of `token` to `to` on `chainId`, gas-sponsored. */
  settlePayment(params: {
    to: string;
    amount: Amount;
    token: string;
    chainId: number;
  }): Promise<Result<TxResult, DomainError>>;

  /** Human label for the trace badge, e.g. "Openfort gasless". */
  readonly label: string;
}
```

Also add `import type { Result } from '@pouch/shared';` is already at the top of types.ts (line 1) — no new import needed.

- [ ] **Step 3: Create the agent-wallet module**

Create `packages/domain/src/agent-wallet.ts`:

```typescript
// Re-export the AgentWalletPort from types for ergonomic imports.
// The port is defined in types.ts so all domain interfaces live together;
// this module exists so callers can `import { AgentWalletPort } from '@pouch/domain'`
// without reaching into types.
export type { AgentWalletPort } from './types';
```

- [ ] **Step 4: Re-export from the domain index**

Add to `packages/domain/src/index.ts` (after the `export * from './types';` line):

```typescript
export * from './agent-wallet';
```

- [ ] **Step 5: Run typecheck to verify the domain compiles**

Run: `pnpm --filter @pouch/domain typecheck`
Expected: PASS (no errors — the new types are additive).

- [ ] **Step 6: Run existing domain tests to confirm nothing broke**

Run: `pnpm --filter @pouch/domain test`
Expected: PASS (all existing executor tests green — we only added types, no logic).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/errors.ts packages/domain/src/types.ts packages/domain/src/agent-wallet.ts packages/domain/src/index.ts
git commit -m "feat(domain): add AgentWalletPort + agent-wallet DomainError variants"
```

---

## Task 2: Domain — `CashOutExecutor` two-step settlement (TDD)

**Files:**
- Modify: `packages/domain/src/executor.ts:17-166`
- Test: `packages/domain/__tests__/executor.test.ts`

This is the core behavioral change. When `agentWallet` is injected, the payment leg splits into two trace steps. When it's absent, behavior is unchanged.

- [ ] **Step 1: Write the failing test for two-step settlement**

Add to `packages/domain/__tests__/executor.test.ts` (append inside the `describe('CashOutExecutor', ...)` block, before its closing `});`):

```typescript
  it('runs the two-step agent-wallet settlement when an agentWallet is injected', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xfund-agent' });
      },
    };

    const agentWallet: AgentWalletPort = {
      label: 'Openfort gasless',
      async getAddress() {
        return ok({ address: '0xagent-wallet' });
      },
      async settlePayment() {
        return ok({ txHash: '0xgasless-settle' });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      agentWallet,
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const labels = result.value.trace.map((step) => step.label);
    expect(labels.some((label) => /funding agent wallet/i.test(label))).toBe(true);
    expect(labels.some((label) => /openfort gasless|paid via/i.test(label))).toBe(true);
    // The funding step should carry the UA 7702 badge.
    const fundingStep = result.value.trace.find((step) => /funding agent wallet/i.test(step.label));
    expect(fundingStep?.badge).toBe('UA 7702');
    // The settle step should carry the NO POPUP badge.
    const settleStep = result.value.trace.find((step) => /openfort gasless|paid via/i.test(step.label));
    expect(settleStep?.badge).toBe('NO POPUP');
  });

  it('returns AGENT_WALLET_SETTLE_FAILED and marks the order failed when settlePayment errors', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({
          total: 200,
          assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }],
          requiresConsolidation: false,
        });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xfund-agent' });
      },
    };

    const agentWallet: AgentWalletPort = {
      label: 'Openfort gasless',
      async getAddress() {
        return ok({ address: '0xagent-wallet' });
      },
      async settlePayment() {
        return err({ type: 'AGENT_WALLET_SETTLE_FAILED', message: 'sponsorship rejected', cause: 'policy mismatch' });
      },
    };

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      account,
      repository,
      logger,
      agentWallet,
    );

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    expect(repository.statuses.some((s) => s.status === 'failed')).toBe(true);
  });
```

Also add `AgentWalletPort` to the imports at the top of the test file. Replace the import block (lines 3–13):

```typescript
import {
  CashOutExecutor,
  OffRampRouter,
  type AccountProvider,
  type AgentWalletPort,
  type LoggerPort,
  type OffRampProvider,
  type Order,
  type OrderRepository,
  type OrderRequest,
  type Product,
} from '@pouch/domain';
import { err, ok } from '@pouch/shared';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @pouch/domain test`
Expected: FAIL — `agentWallet` is not a constructor parameter yet; the two-step trace labels don't exist.

- [ ] **Step 3: Implement the two-step settlement in the executor**

Edit `packages/domain/src/executor.ts`. First, add `AgentWalletPort` to the imports (line 6–15 block). Replace:

```typescript
import type {
  AccountProvider,
  CashOutIntent,
  CashOutResult,
  LoggerPort,
  OffRampProvider,
  Order,
  OrderRepository,
  UserId,
} from './types';
```

with:

```typescript
import type {
  AccountProvider,
  AgentWalletPort,
  CashOutIntent,
  CashOutResult,
  LoggerPort,
  OffRampProvider,
  Order,
  OrderRepository,
  UserId,
} from './types';
```

Then update the constructor (lines 18–24) to accept the optional wallet:

```typescript
export class CashOutExecutor {
  constructor(
    private readonly router: OffRampRouter,
    private readonly providers: readonly OffRampProvider[],
    private readonly account: AccountProvider,
    private readonly orders: OrderRepository,
    private readonly logger: LoggerPort,
    private readonly agentWallet?: AgentWalletPort,
  ) {}
```

Then replace the payment block (lines 120–135, from `const paymentStep = trace.start(...)` through `trace.complete(paymentStep.id);`) with the branching logic:

```typescript
    if (this.agentWallet) {
      // Two-step agent-wallet settlement: UA funds the gasless wallet, then
      // the gasless wallet pays the provider. Both are zero-popup for the user.
      const fundingStep = trace.start('Funding agent wallet', { badge: 'UA 7702' });
      const agentAddress = await this.agentWallet.getAddress();

      if (!isOk(agentAddress)) {
        this.logger.error({ orderId: order.value.id }, 'Agent wallet address lookup failed.');
        trace.fail(fundingStep.id, 'Could not resolve agent wallet address.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return agentAddress;
      }

      const funding = await this.account.sendPayment({
        from: userId,
        to: agentAddress.value.address,
        amount: order.value.payment.amount,
        chainId: order.value.payment.chainId,
        token: order.value.payment.token,
      });

      if (!isOk(funding)) {
        this.logger.error({ orderId: order.value.id }, 'Agent wallet funding failed.');
        trace.fail(fundingStep.id, 'Funding the agent wallet failed.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return funding;
      }

      trace.complete(fundingStep.id);

      const settleStep = trace.start(`Paid via ${this.agentWallet.label}`, { badge: 'NO POPUP' });
      const settlement = await this.agentWallet.settlePayment({
        to: order.value.payment.address,
        amount: order.value.payment.amount,
        token: order.value.payment.token,
        chainId: order.value.payment.chainId,
      });

      if (!isOk(settlement)) {
        this.logger.error({ orderId: order.value.id }, 'Agent wallet settlement failed.');
        trace.fail(settleStep.id, 'Gasless settlement failed.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return settlement;
      }

      trace.complete(settleStep.id);
      await this.orders.updateStatus(
        order.value.id,
        'payment_pending',
        this.withPaymentTxHash(order.value, settlement.value.txHash),
      );

      this.logger.info(
        {
          orderId: order.value.id,
          providerId: provider.id,
          txHash: settlement.value.txHash,
        },
        'Cash-out payment submitted via agent wallet.',
      );

      return ok({
        orderId: order.value.id,
        status: 'payment_pending',
        trace: trace.steps,
      });
    }

    // Demo / direct path (no agent wallet): UA pays the provider directly.
    const paymentStep = trace.start('Signing payment', { badge: 'NO POPUP' });
    const payment = await this.account.sendPayment({
      from: userId,
      to: order.value.payment.address,
      amount: order.value.payment.amount,
      chainId: order.value.payment.chainId,
      token: order.value.payment.token,
    });

    if (!isOk(payment)) {
      trace.fail(paymentStep.id, 'Payment failed.');
      await this.orders.updateStatus(order.value.id, 'failed');
      return payment;
    }

    trace.complete(paymentStep.id);
    await this.orders.updateStatus(
      order.value.id,
      'payment_pending',
      this.withPaymentTxHash(order.value, payment.value.txHash),
    );

    this.logger.info(
      {
        orderId: order.value.id,
        providerId: provider.id,
        txHash: payment.value.txHash,
      },
      'Cash-out payment submitted.',
    );

    return ok({
      orderId: order.value.id,
      status: 'payment_pending',
      trace: trace.steps,
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @pouch/domain test`
Expected: PASS — all 4 tests (2 existing + 2 new) green.

- [ ] **Step 5: Run typecheck across the monorepo (executor signature change ripples)**

Run: `pnpm typecheck`
Expected: PASS — the optional 6th param doesn't break existing callers (`create-runtime-app-services.ts` and `create-demo-agent-service.ts` both construct with 5 args; optional param is fine).

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/executor.ts packages/domain/__tests__/executor.test.ts
git commit -m "feat(domain): CashOutExecutor two-step agent-wallet settlement trace"
```

---

## Task 3: infra-web3 — Openfort error mapper (TDD)

**Files:**
- Create: `packages/infra-web3/src/openfort/openfort-mapper.ts`
- Test: `packages/infra-web3/__tests__/openfort-mapper.test.ts`

Pure error mapping. No SDK import. Done first so the provider (Task 4) can use it.

- [ ] **Step 1: Write the failing test**

Create `packages/infra-web3/__tests__/openfort-mapper.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { mapOpenfortError } from '../src/openfort/openfort-mapper';

describe('mapOpenfortError', () => {
  it('maps an authentication error to AGENT_WALLET_SETTLE_FAILED', () => {
    const error = new Error('401 Unauthorized: invalid secret key');
    const result = mapOpenfortError(error, 'settle payment');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.message).toContain('settle payment');
      expect(result.cause).toContain('401');
    }
  });

  it('maps a policy/sponsorship error to AGENT_WALLET_SETTLE_FAILED', () => {
    const error = new Error('policy not found: fes_invalid');
    const result = mapOpenfortError(error, 'sponsor transaction');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.cause).toContain('policy');
    }
  });

  it('maps a non-Error thrown value to AGENT_WALLET_SETTLE_FAILED with a generic cause', () => {
    const result = mapOpenfortError('something weird', 'resolve wallet');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.cause).toBe('unknown');
    }
  });

  it('includes the operation context in the message', () => {
    const result = mapOpenfortError(new Error('timeout'), 'fund wallet');

    expect(result.type).toBe('AGENT_WALLET_SETTLE_FAILED');
    if (result.type === 'AGENT_WALLET_SETTLE_FAILED') {
      expect(result.message).toContain('fund wallet');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: FAIL — module `../src/openfort/openfort-mapper` doesn't exist.

- [ ] **Step 3: Implement the mapper**

Create `packages/infra-web3/src/openfort/openfort-mapper.ts`:

```typescript
import type { DomainError } from '@pouch/domain';

/**
 * Maps an error thrown by the Openfort SDK (or any thrown value) to a
 * `DomainError`. We always map to AGENT_WALLET_SETTLE_FAILED because the
 * Openfort integration is the settlement leg — any failure there is a
 * settlement failure. The `operation` context is included in the message
 * so the trace/reply can tell the user what went wrong.
 *
 * Pure: imports no SDK. The provider passes the caught error in.
 */
export function mapOpenfortError(error: unknown, operation: string): DomainError {
  const cause =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown';

  return {
    type: 'AGENT_WALLET_SETTLE_FAILED',
    message: `Failed to ${operation} via Openfort.`,
    cause,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: PASS — 4 mapper tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-web3/src/openfort/openfort-mapper.ts packages/infra-web3/__tests__/openfort-mapper.test.ts
git commit -m "feat(infra-web3): Openfort error mapper → DomainError"
```

---

## Task 4: infra-web3 — `OpenfortAgentWallet` provider (TDD, mocked SDK)

**Files:**
- Create: `packages/infra-web3/src/openfort/openfort-provider.ts`
- Test: `packages/infra-web3/__tests__/openfort-provider.test.ts`

The provider implements `AgentWalletPort`. The SDK is injected via a **lazy `clientFactory`** — a `() => Promise<OpenfortClientLike>` that the provider calls on first use. This mirrors the `ParticleAccountProvider.getInstance()` deferred-ESM pattern: `createAgentWallet` stays synchronous (it passes the factory, not a built client), so the runtime boot path is unchanged. Tests inject a factory that returns a fake client — no real SDK import.

- [ ] **Step 1: Add the SDK dependency**

Run:

```bash
pnpm --filter @pouch/infra-web3 add @openfort/openfort-node@^0.10.8
```

Expected: `@openfort/openfort-node@^0.10.8` added to `packages/infra-web3/package.json` dependencies and the lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `packages/infra-web3/__tests__/openfort-provider.test.ts`:

```typescript
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

    const result = await wallet.settlePayment({
      to: '0xbitrefill-payment',
      amount: { value: 25, currency: 'USD' },
      token: '0xaf88d61464a02d2e5e4f92bf5d4c1c0a6c6c1c0a6c',
      chainId: 42161,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.txHash).toBe('0xgasless-tx');

    const args = sentArgs as {
      account: string;
      chainId: number;
      interactions: Array<{ to: string; data: string }>;
      policy: string;
    };
    expect(args.policy).toBe('fes_test_123');
    expect(args.chainId).toBe(42161);
    expect(args.interactions[0]?.to).toBe('0xaf88d61464a02d2e5e4f92bf5d4c1c0a6c6c1c0a6c');
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
      to: '0xbitrefill',
      amount: { value: 25, currency: 'USD' },
      token: '0xtoken',
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: FAIL — `openfort-provider` module doesn't exist.

- [ ] **Step 4: Implement the provider**

Create `packages/infra-web3/src/openfort/openfort-provider.ts`:

```typescript
import { err, ok, type Result } from '@pouch/shared';
import type {
  AgentWalletPort,
  DomainError,
  LoggerPort,
  TxResult,
} from '@pouch/domain';
import { ethers } from 'ethers';

import { mapOpenfortError } from './openfort-mapper';

/**
 * Minimal structural type for the Openfort SDK pieces we call. Keeping this
 * local means tests inject a fake without importing @openfort/openfort-node.
 * The real SDK is imported ONLY inside the clientFactory passed to the
 * constructor (deferred ESM — same pattern as the Particle fix that resolved
 * the Phase 1 runtime blocker). Demo mode never constructs this class at all.
 */
export interface OpenfortClientLike {
  accounts: {
    evm: {
      backend: {
        create(): Promise<{ id: string; address: string }>;
        sendTransaction(args: {
          account: string;
          chainId: number;
          interactions: Array<{ to: string; data: string }>;
          policy: string;
        }): Promise<{ response: { transactionHash: string } }>;
      };
    };
  };
}

/**
 * A lazy factory that resolves the Openfort SDK client on first use. The
 * factory (not the client) is injected so `createAgentWallet` can stay
 * synchronous — the SDK import is deferred to the first `getAddress()` /
 * `settlePayment()` call, exactly like `ParticleAccountProvider.getInstance()`.
 */
export type OpenfortClientFactory = () => Promise<OpenfortClientLike>;

/**
 * The real factory, used by `createAgentWallet`. Defers the SDK import.
 * Exported so the factory test can assert it's wired (without calling it).
 */
export function createRealOpenfortClientFactory(config: {
  secretKey: string;
  walletSecret: string;
}): OpenfortClientFactory {
  return async () => {
    const Openfort = (await import('@openfort/openfort-node')).default;
    // Constructor: new Openfort(secretKey, { walletSecret }) — both required.
    return new Openfort(config.secretKey, { walletSecret: config.walletSecret }) as unknown as OpenfortClientLike;
  };
}

export class OpenfortAgentWallet implements AgentWalletPort {
  readonly label = 'Openfort gasless';

  private cachedAddress: string | null = null;
  private clientPromise: Promise<OpenfortClientLike> | null = null;

  constructor(
    private readonly clientFactory: OpenfortClientFactory,
    private readonly feeSponsorshipId: string,
    private readonly logger: LoggerPort,
  ) {}

  /**
   * Resolves the SDK client lazily and memoizes the promise so the deferred
   * import only happens once (even if getAddress + settlePayment race).
   */
  private async getClient(): Promise<Result<OpenfortClientLike, DomainError>> {
    if (this.clientPromise) {
      try {
        return ok(await this.clientPromise);
      } catch (error) {
        return err(mapOpenfortError(error, 'load Openfort SDK'));
      }
    }

    this.clientPromise = this.clientFactory();
    try {
      return ok(await this.clientPromise);
    } catch (error) {
      this.clientPromise = null; // allow retry on a later call
      this.logger.error({ error }, 'Openfort SDK client load failed.');
      return err(mapOpenfortError(error, 'load Openfort SDK'));
    }
  }

  async getAddress(): Promise<Result<{ address: string }, DomainError>> {
    if (this.cachedAddress) {
      return ok({ address: this.cachedAddress });
    }

    const clientResult = await this.getClient();
    if (!clientResult.ok) {
      return clientResult;
    }

    try {
      const account = await clientResult.value.accounts.evm.backend.create();
      this.cachedAddress = account.address;
      this.logger.info({ accountId: account.id, address: account.address }, 'Openfort agent wallet resolved.');
      return ok({ address: account.address });
    } catch (error) {
      this.logger.error({ error }, 'Openfort backend wallet creation failed.');
      return err(mapOpenfortError(error, 'resolve agent wallet'));
    }
  }

  async settlePayment(params: {
    to: string;
    amount: { value: number; currency: 'USD' };
    token: string;
    chainId: number;
  }): Promise<Result<TxResult, DomainError>> {
    const addressResult = await this.getAddress();
    if (!addressResult.ok) {
      return addressResult;
    }

    const clientResult = await this.getClient();
    if (!clientResult.ok) {
      return clientResult;
    }

    try {
      // Encode ERC-20 transfer(to, amount). USDC has 6 decimals.
      const erc20Interface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
      const amountWei = ethers.parseUnits(String(params.amount.value), 6);
      const data = erc20Interface.encodeFunctionData('transfer', [params.to, amountWei]);

      const result = await clientResult.value.accounts.evm.backend.sendTransaction({
        account: addressResult.value.address,
        chainId: params.chainId,
        interactions: [{ to: params.token, data }],
        policy: this.feeSponsorshipId,
      });

      this.logger.info(
        { txHash: result.response.transactionHash, chainId: params.chainId },
        'Openfort gasless settlement submitted.',
      );

      return ok({
        txHash: result.response.transactionHash,
        chainId: params.chainId,
      });
    } catch (error) {
      this.logger.error({ error, chainId: params.chainId }, 'Openfort settlement failed.');
      return err(mapOpenfortError(error, 'settle payment gasless'));
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: PASS — all 7 provider tests + 4 mapper tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/infra-web3/src/openfort/openfort-provider.ts packages/infra-web3/__tests__/openfort-provider.test.ts packages/infra-web3/package.json pnpm-lock.yaml
git commit -m "feat(infra-web3): OpenfortAgentWallet — gasless settlement via deferred SDK"
```

---

## Task 5: infra-web3 — `NoopAgentWallet` (TDD)

**Files:**
- Create: `packages/infra-web3/src/noop-agent-wallet.ts`
- Test: `packages/infra-web3/__tests__/agent-wallet-factory.test.ts` (shared with Task 6)

- [ ] **Step 1: Implement the noop wallet**

Create `packages/infra-web3/src/noop-agent-wallet.ts`:

```typescript
import { err } from '@pouch/shared';
import type { AgentWalletPort, DomainError, TxResult } from '@pouch/domain';

/**
 * A no-op agent wallet that returns AGENT_WALLET_NOT_CONFIGURED on every
 * call. This is the factory default when OPENFORT_* env vars are unset,
 * so the executor's agent-wallet code path has a safe sentinel that never
 * accidentally executes a real settlement. In practice the factory returns
 * `undefined` (not this noop) so the executor takes the demo path; this
 * class exists for explicit "configured but incomplete" scenarios and for
 * test clarity.
 */
export class NoopAgentWallet implements AgentWalletPort {
  readonly label = 'No agent wallet';

  async getAddress(): Promise<Result<{ address: string }, DomainError>> {
    return err({
      type: 'AGENT_WALLET_NOT_CONFIGURED',
      message: 'No agent wallet is configured. Set OPENFORT_SECRET_KEY, OPENFORT_WALLET_SECRET, and OPENFORT_FEE_SPONSORSHIP_ID.',
    });
  }

  async settlePayment(): Promise<Result<TxResult, DomainError>> {
    return err({
      type: 'AGENT_WALLET_NOT_CONFIGURED',
      message: 'No agent wallet is configured. Settlement is not available.',
    });
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @pouch/infra-web3 typecheck`
Expected: PASS.

- [ ] **Step 3: Commit (tests come in Task 6 which covers the factory + noop together)**

```bash
git add packages/infra-web3/src/noop-agent-wallet.ts
git commit -m "feat(infra-web3): NoopAgentWallet — safe sentinel for unset Openfort config"
```

---

## Task 6: infra-web3 — `createAgentWallet` factory (TDD)

**Files:**
- Modify: `packages/infra-web3/src/factory.ts`
- Modify: `packages/infra-web3/src/index.ts`
- Test: `packages/infra-web3/__tests__/agent-wallet-factory.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/infra-web3/__tests__/agent-wallet-factory.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { LoggerPort } from '@pouch/domain';
import { loadConfig } from '@pouch/shared';

import { createAgentWallet } from '../src/factory';

const noopLogger: LoggerPort = { info() {}, error() {} };

const baseEnv = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SETTLEMENT_CHAIN_ID: '42161',
  SUPPORTED_CHAINS: '42161,8453',
  OFFRAMP_PROVIDERS: 'bitrefill',
  BITREFILL_API_KEY: 'br_test',
  BITREFILL_BASE_URL: 'https://api.bitrefill.com/v2',
  DATABASE_URL: 'postgresql://pouch:pouch@localhost:5432/pouch',
  JWT_SECRET: '12345678901234567890123456789012',
  WEBHOOK_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
};

describe('createAgentWallet', () => {
  it('returns undefined when no OPENFORT env vars are set (demo path)', () => {
    const config = loadConfig(baseEnv);
    const wallet = createAgentWallet(config, noopLogger);
    expect(wallet).toBeUndefined();
  });

  it('returns undefined when only OPENFORT_SECRET_KEY is set (incomplete)', () => {
    const config = loadConfig({ ...baseEnv, OPENFORT_SECRET_KEY: 'sk_test' });
    const wallet = createAgentWallet(config, noopLogger);
    expect(wallet).toBeUndefined();
  });

  it('throws in production when OPENFORT_SECRET_KEY is set but WALLET_SECRET or FEE_SPONSORSHIP_ID is missing', () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      OPENFORT_SECRET_KEY: 'sk_test',
      // OPENFORT_WALLET_SECRET intentionally missing
      OPENFORT_FEE_SPONSORSHIP_ID: 'fes_test',
    });

    expect(() => createAgentWallet(config, noopLogger)).toThrow(/OPENFORT_WALLET_SECRET/);
  });

  it('throws in production when FEE_SPONSORSHIP_ID is missing but SECRET_KEY + WALLET_SECRET are set', () => {
    const config = loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      OPENFORT_SECRET_KEY: 'sk_test',
      OPENFORT_WALLET_SECRET: 'ws_test',
      // OPENFORT_FEE_SPONSORSHIP_ID intentionally missing
    });

    expect(() => createAgentWallet(config, noopLogger)).toThrow(/OPENFORT_FEE_SPONSORSHIP_ID/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: FAIL — `createAgentWallet` is not exported from `../src/factory`.

- [ ] **Step 3: Implement `createAgentWallet` in the factory**

Edit `packages/infra-web3/src/factory.ts`. Add imports at the top (after the existing imports):

```typescript
import type { AgentWalletPort, LoggerPort } from '@pouch/domain';

import { OpenfortAgentWallet, createRealOpenfortClientFactory } from './openfort/openfort-provider';
```

Then append the new function at the end of the file:

```typescript
/**
 * Creates the agent wallet for gasless settlement. Returns:
 * - `undefined` when OPENFORT_* env vars are unset → executor takes the demo
 *   (direct UA payment) path.
 * - An `OpenfortAgentWallet` when all three OPENFORT_* vars are set.
 * - Throws in production when SECRET_KEY is set but WALLET_SECRET or
 *   FEE_SPONSORSHIP_ID is missing (fail-fast on incomplete config).
 * - In dev with incomplete config, returns undefined (demo path, never breaks).
 *
 * SYNCHRONOUS by design: the SDK import is deferred inside the clientFactory
 * (called lazily on first getAddress/settlePayment), so this function never
 * blocks boot. Mirrors the createAccountProvider pattern (Particle's SDK
 * import is also deferred to getInstance()). Demo mode never constructs this.
 */
export function createAgentWallet(
  config: Config,
  logger: LoggerPort,
): AgentWalletPort | undefined {
  const hasSecret = Boolean(config.OPENFORT_SECRET_KEY);
  const hasWalletSecret = Boolean(config.OPENFORT_WALLET_SECRET);
  const hasFeeSponsorship = Boolean(config.OPENFORT_FEE_SPONSORSHIP_ID);

  if (!hasSecret) {
    return undefined;
  }

  // Secret is set but config is incomplete.
  if (!hasWalletSecret || !hasFeeSponsorship) {
    const missing = [
      !hasWalletSecret ? 'OPENFORT_WALLET_SECRET' : null,
      !hasFeeSponsorship ? 'OPENFORT_FEE_SPONSORSHIP_ID' : null,
    ]
      .filter(Boolean)
      .join(', ');

    if (config.NODE_ENV === 'production') {
      throw new Error(
        `OPENFORT_SECRET_KEY is set but ${missing} is missing. Set all three or unset OPENFORT_SECRET_KEY to use demo mode.`,
      );
    }

    logger.error({ missing }, 'Openfort config incomplete — falling back to demo agent wallet path.');
    return undefined;
  }

  const clientFactory = createRealOpenfortClientFactory({
    secretKey: config.OPENFORT_SECRET_KEY!,
    walletSecret: config.OPENFORT_WALLET_SECRET!,
  });

  return new OpenfortAgentWallet(clientFactory, config.OPENFORT_FEE_SPONSORSHIP_ID!, logger);
}
```

- [ ] **Step 4: Re-export from the index**

Edit `packages/infra-web3/src/index.ts` — add:

```typescript
export * from './openfort/openfort-provider';
export * from './openfort/openfort-mapper';
export * from './noop-agent-wallet';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: PASS — all factory tests (account provider + agent wallet) + mapper + provider tests green.

- [ ] **Step 6: Run typecheck (factory is synchronous — no async ripple)**

Run: `pnpm typecheck`
Expected: PASS — `createAgentWallet` is synchronous, so no callers need to await it. Task 7 wires it without changing the runtime's sync signature.

- [ ] **Step 7: Commit**

```bash
git add packages/infra-web3/src/factory.ts packages/infra-web3/src/index.ts packages/infra-web3/__tests__/agent-wallet-factory.test.ts
git commit -m "feat(infra-web3): createAgentWallet factory — deferred SDK, prod fail-fast"
```

---

## Task 7: API — Wire `createAgentWallet` into the runtime

**Files:**
- Modify: `apps/api/src/bootstrap/create-runtime-app-services.ts`
- Test: `apps/api/src/bootstrap/create-runtime-app-services-agent-wallet.test.ts`

Since `createAgentWallet` is synchronous (the SDK import is deferred inside the wallet's lazy `clientFactory`), `createRuntimeAppServices` stays synchronous. **No changes to `app.ts`, `server.ts`, or `app.test.ts`** — the boot path is untouched.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/bootstrap/create-runtime-app-services-agent-wallet.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import type { AccountProvider, AgentWalletPort, OffRampProvider, OrderRepository } from '@pouch/domain';
import { ok } from '@pouch/shared';

import { createRuntimeAppServices } from './create-runtime-app-services';

const validEnv = {
  NODE_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SETTLEMENT_CHAIN_ID: '42161',
  SUPPORTED_CHAINS: '42161,8453',
  OFFRAMP_PROVIDERS: 'bitrefill',
  BITREFILL_API_KEY: 'br_test_key',
  BITREFILL_BASE_URL: 'https://api.bitrefill.com/v2',
  DATABASE_URL: 'postgresql://pouch:pouch@localhost:5432/pouch',
  JWT_SECRET: '12345678901234567890123456789012',
  WEBHOOK_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
};

function buildBitrefillProvider(): OffRampProvider {
  return {
    id: 'bitrefill',
    name: 'Bitrefill',
    categories: ['giftcard'],
    async searchProducts() {
      return ok([]);
    },
    async getQuote() {
      throw new Error('Not used.');
    },
    async createOrder() {
      throw new Error('Not used.');
    },
    async getOrderStatus() {
      throw new Error('Not used.');
    },
    async verifyWebhook() {
      return ok({ eventId: 'evt_1', providerId: 'bitrefill', status: 'delivered', payload: {} });
    },
  };
}

const fakeOrderRepository: OrderRepository = {
  async save() {},
  async findById() {
    return null;
  },
  async findByProviderOrderId() {
    return null;
  },
  async updateStatus() {},
};

const fakeAccountProvider: AccountProvider = {
  async getUnifiedBalance() {
    return ok({ total: 100, assets: [], requiresConsolidation: false });
  },
  async consolidate() {
    return ok({ txHash: '0xconsolidate' });
  },
  async sendPayment() {
    return ok({ txHash: '0xpay' });
  },
};

const fakeAgentWallet: AgentWalletPort = {
  label: 'Openfort gasless',
  async getAddress() {
    return ok({ address: '0xagent' });
  },
  async settlePayment() {
    return ok({ txHash: '0xgasless' });
  },
};

describe('createRuntimeAppServices — agent wallet wiring', () => {
  it('does not call createAgentWallet when no OPENFORT env is set (demo path)', () => {
    const createAgentWallet = vi.fn(() => undefined);

    const services = createRuntimeAppServices({
      env: validEnv,
      dependencies: {
        createDatabase: () => ({ tag: 'db' }),
        createOrderRepository: () => fakeOrderRepository,
        createWebhookEventStore: () => ({ async recordIfNew() { return true; }, async markProcessed() {} }),
        buildOffRampProviders: () => [buildBitrefillProvider()],
        createAccountProvider: () => fakeAccountProvider,
        createAgentWallet,
      },
    });

    expect(services.mode).toBe('configured');
    expect(createAgentWallet).not.toHaveBeenCalled();
  });

  it('calls createAgentWallet when OPENFORT_SECRET_KEY is set and injects the result', () => {
    const createAgentWallet = vi.fn(() => fakeAgentWallet);

    const services = createRuntimeAppServices({
      env: { ...validEnv, OPENFORT_SECRET_KEY: 'sk_test', OPENFORT_WALLET_SECRET: 'ws_test', OPENFORT_FEE_SPONSORSHIP_ID: 'fes_test' },
      dependencies: {
        createDatabase: () => ({ tag: 'db' }),
        createOrderRepository: () => fakeOrderRepository,
        createWebhookEventStore: () => ({ async recordIfNew() { return true; }, async markProcessed() {} }),
        buildOffRampProviders: () => [buildBitrefillProvider()],
        createAccountProvider: () => fakeAccountProvider,
        createAgentWallet,
      },
    });

    expect(services.mode).toBe('configured');
    expect(createAgentWallet).toHaveBeenCalledTimes(1);
  });

  it('does not set an agent wallet when OPENFORT_SECRET_KEY is unset even if the dependency is provided', () => {
    const createAgentWallet = vi.fn(() => fakeAgentWallet);

    const services = createRuntimeAppServices({
      env: validEnv, // no OPENFORT_* vars
      dependencies: {
        createDatabase: () => ({ tag: 'db' }),
        createOrderRepository: () => fakeOrderRepository,
        createWebhookEventStore: () => ({ async recordIfNew() { return true; }, async markProcessed() {} }),
        buildOffRampProviders: () => [buildBitrefillProvider()],
        createAccountProvider: () => fakeAccountProvider,
        createAgentWallet,
      },
    });

    expect(services.mode).toBe('configured');
    expect(createAgentWallet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pouch/api test`
Expected: FAIL — `createAgentWallet` is not in `RuntimeDependencies`; the runtime doesn't call it.

- [ ] **Step 3: Wire `createAgentWallet` into the runtime**

Edit `apps/api/src/bootstrap/create-runtime-app-services.ts`.

Add to imports (after line 10, `import { createAccountProvider } from '@pouch/infra-web3';`):

```typescript
import { createAgentWallet } from '@pouch/infra-web3';
```

Add `AgentWalletPort` to the domain import (line 1):

```typescript
import { CashOutExecutor, OffRampRouter, type AccountProvider, type AgentWalletPort, type LoggerPort, type OrderRepository } from '@pouch/domain';
```

Add `createAgentWallet` to the `RuntimeDependencies` interface (after `createAccountProvider?: ...`):

```typescript
  createAgentWallet?: (config: Config, logger: LoggerPort) => AgentWalletPort | undefined;
```

Then, in the configured-mode `try` block, after the `accountProvider` line (line 84) and before the `executor` construction (line 86), add the agent wallet resolution. Replace the executor construction (lines 86–92):

```typescript
    const accountProvider = (dependencies.createAccountProvider ?? createAccountProvider)(config);

    const agentWallet = config.OPENFORT_SECRET_KEY
      ? (dependencies.createAgentWallet ?? createAgentWallet)(config, runtimeLogger)
      : undefined;

    const executor = new CashOutExecutor(
      new OffRampRouter(providers),
      providers,
      accountProvider,
      orderRepository,
      runtimeLogger,
      agentWallet,
    );
```

**No async changes needed** — `createAgentWallet` is synchronous (the SDK import is deferred inside `OpenfortAgentWallet`'s lazy `clientFactory`, called on first `getAddress()`/`settlePayment()`). `createRuntimeAppServices`, `createApp`, and `server.ts` all stay synchronous. The boot path is identical to Phase 3.

- [ ] **Step 4: Run the full API test suite**

Run: `pnpm --filter @pouch/api test`
Expected: PASS — all existing tests + the 3 new agent-wallet wiring tests green.

- [ ] **Step 5: Run typecheck across the monorepo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Verify the API boots in demo mode**

Run: `pnpm dev:api` (start, check for "Pouch API listening on http://localhost:3001", then Ctrl-C)
Expected: boots cleanly (demo mode, no OPENFORT env → agent wallet undefined → demo path).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/bootstrap/create-runtime-app-services.ts apps/api/src/bootstrap/create-runtime-app-services-agent-wallet.test.ts
git commit -m "feat(api): wire createAgentWallet into runtime (sync, deferred SDK)"
```

---

## Task 8: API — Domain error mapping for agent-wallet errors

**Files:**
- Modify: `apps/api/src/routes/domain-errors.ts`

- [ ] **Step 1: Add status + message for the two new error types**

Edit `apps/api/src/routes/domain-errors.ts`. In `toDomainErrorStatus`, the `default` case already catches unknown types as 500. Add explicit cases before `default`:

```typescript
    case 'AGENT_WALLET_NOT_CONFIGURED':
      return 503;
    case 'AGENT_WALLET_SETTLE_FAILED':
      return 502;
    default:
      return 500;
```

In `toDomainErrorMessage`, add cases before the closing brace:

```typescript
    case 'AGENT_WALLET_NOT_CONFIGURED':
      return error.message;
    case 'AGENT_WALLET_SETTLE_FAILED':
      return `Agent wallet settlement failed: ${error.message}${error.cause ? ` (${error.cause})` : ''}`;
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @pouch/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/domain-errors.ts
git commit -m "feat(api): map AGENT_WALLET_* errors to HTTP status + message"
```

---

## Task 9: CI — Add lint + build to the workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the workflow**

Replace the entire content of `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.17.1
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

Changes from the existing workflow:
1. `--frozen-lockfile=false` → `--frozen-lockfile` (CI should fail if the lockfile is out of date, not silently regenerate).
2. Added `pnpm lint` (after typecheck, before test).
3. Added `pnpm build` (after test).

- [ ] **Step 2: Verify lint passes locally**

Run: `pnpm lint`
Expected: PASS (0 errors). If there are pre-existing lint errors, fix them before committing (they would block CI).

- [ ] **Step 3: Verify build passes locally**

Run: `pnpm build`
Expected: PASS (8/8 packages).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + build steps; enforce frozen lockfile"
```

---

## Task 10: Frontend — Friendly error bubble for `/agent/chat` failures

**Files:**
- Modify: `apps/web/src/context/chat-context.tsx`
- Create: `apps/web/src/components/chat/AgentErrorBubble.tsx`
- Modify: `apps/web/src/components/chat/MessageList.tsx`
- Modify: `apps/web/src/lib/types.ts`

Currently a failed `/agent/chat` call sets `error` (a string) and `MessageList` renders it via the generic `ErrorMessage` component (red alert). We want a friendlier agent-bubble that reads like the agent replying with an apology + the error message, so the UX stays conversational.

- [ ] **Step 1: Capture the error type in chat context**

Edit `apps/web/src/context/chat-context.tsx`. Extend `ChatContextValue` to carry an error type:

Replace the `interface ChatContextValue` (lines 15–21):

```typescript
interface ChatContextValue {
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  errorType: string | null;
  sendMessage: (text: string, userId?: string) => Promise<void>;
  clearError: () => void;
}
```

Add `errorType` state + plumbing. In `ChatProvider`, replace the state + `sendMessage` catch + `value`:

```typescript
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string, userId?: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      setError(null);
      setErrorType(null);
      setIsSending(true);
      setMessages((prev) => [...prev, { id: newId(), role: 'user', text: trimmed }]);

      try {
        const response = await sendChatMessage(trimmed, userId);
        setMessages((prev) => [...prev, { id: newId(), role: 'agent', response }]);
      } catch (e) {
        const message = e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
        const type = e instanceof ApiError ? (e.type ?? null) : null;
        setError(message);
        setErrorType(type);
      } finally {
        setIsSending(false);
      }
    },
    [isSending],
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorType(null);
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({ messages, isSending, error, errorType, sendMessage, clearError }),
    [messages, isSending, error, errorType, sendMessage, clearError],
  );
```

- [ ] **Step 2: Create the `AgentErrorBubble` component**

Create `apps/web/src/components/chat/AgentErrorBubble.tsx`:

```typescript
'use client';

const FRIENDLY_PREFIX: Record<string, string> = {
  INSUFFICIENT_FUNDS: "You don't have enough balance for that. ",
  NO_PROVIDER_AVAILABLE: "I couldn't find a provider for that. ",
  ALL_PROVIDERS_FAILED: 'All providers are unavailable right now. ',
  AGENT_WALLET_SETTLE_FAILED: 'The gasless settlement failed. ',
  AGENT_WALLET_NOT_CONFIGURED: 'Gasless settlement is not configured. ',
};

export function AgentErrorBubble({ message, type }: { message: string; type?: string | null }) {
  const prefix = (type && FRIENDLY_PREFIX[type]) ?? "I couldn't complete that. ";
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-red-500/20 bg-red-500/5 px-4 py-3">
        <p className="text-sm text-[var(--fg)]">
          <span className="text-red-300">⚠ </span>
          {prefix}
          <span className="text-[var(--muted-2)]">{message}</span>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render the error bubble in MessageList**

Edit `apps/web/src/components/chat/MessageList.tsx`. Add the import + replace the error rendering.

Add to imports (after `import { ErrorMessage } from '../ui/ErrorMessage';`):

```typescript
import { AgentErrorBubble } from './AgentErrorBubble';
```

Replace the error rendering line (line 40, `{error ? <ErrorMessage>{error}</ErrorMessage> : null}`) with:

```typescript
      {error ? <AgentErrorBubble message={error} type={errorType} /> : null}
```

And destructure `errorType` from `useChat()` (line 10):

```typescript
  const { messages, isSending, error, errorType } = useChat();
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @pouch/web typecheck`
Expected: PASS.

- [ ] **Step 5: Run web tests**

Run: `pnpm --filter @pouch/web test`
Expected: PASS (existing 12 tests green; the chat-context test mocks `apiPost` and checks success path — error path isn't tested there but the types compile).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/context/chat-context.tsx apps/web/src/components/chat/AgentErrorBubble.tsx apps/web/src/components/chat/MessageList.tsx
git commit -m "feat(web): friendly agent error bubble for /agent/chat failures"
```

---

## Task 11: Frontend — BalancePill skeleton loading state

**Files:**
- Modify: `apps/web/src/components/chat/BalancePill.tsx`

- [ ] **Step 1: Add a loading state**

Edit `apps/web/src/components/chat/BalancePill.tsx`. Add a `loading` state and render a skeleton pill while the first fetch is in flight.

Replace the component body (from `const [balance, setBalance] = ...` through the `if (!balance) return null;` line):

```typescript
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      setBalance(await apiGet<BalanceResponse>('/balance'));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setBalance(null);
      }
    } finally {
      setLoading(false);
    }
  }
```

Then replace the `if (!balance) return null;` line with a skeleton + null check:

```typescript
  if (loading && !balance) {
    return (
      <span className="h-6 w-24 animate-pulse rounded-full bg-white/5" aria-label="Loading balance" />
    );
  }

  if (!balance) return null;
```

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/BalancePill.tsx
git commit -m "feat(web): BalancePill skeleton loading state"
```

---

## Task 12: Frontend — Mobile responsive breakpoints

**Files:**
- Modify: `apps/web/src/components/chat/ChatView.tsx`
- Modify: `apps/web/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Make the chat column responsive in ChatView**

Edit `apps/web/src/components/chat/ChatView.tsx`. The `<main>` currently uses `max-w-2xl`. Add full-width on mobile + padding:

Replace the `<main>` opening tag (line 15):

```typescript
      <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-0 sm:px-4">
```

Make the header wrap on mobile. Replace the `<header>` (lines 16–32):

```typescript
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="shrink-0 text-sm font-bold tracking-tight text-[var(--fg)]">Pouch</span>
            <BalancePill />
            <ZeroPopupBadge />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {session?.evmAddress ? (
              <span className="hidden text-xs text-[var(--muted)] sm:inline">
                {session.evmAddress.slice(0, 6)}…{session.evmAddress.slice(-4)}
              </span>
            ) : null}
            <Button variant="ghost" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </header>
```

Clarify the demo banner. Replace the demo banner block (lines 34–38):

```typescript
        {session?.userId === 'demo-user' || !session ? (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
            Demo mode — balances and payments are simulated. Add a Magic key for real wallet auth.
          </div>
        ) : null}
```

- [ ] **Step 2: Ensure MessageList bubbles don't overflow on mobile**

Edit `apps/web/src/components/chat/MessageList.tsx`. The user/agent bubbles use `max-w-[80%]` which is fine. Add `break-words` to the text to prevent long strings from overflowing:

In the user bubble (line 23), add `break-words`:

```typescript
            <div className="max-w-[80%] break-words rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2 text-sm text-white">
```

In the agent bubble (line 29), add `break-words`:

```typescript
            <div className="max-w-[80%] break-words rounded-2xl rounded-bl-sm border border-[var(--border)] bg-white/5 px-4 py-3">
```

- [ ] **Step 3: Run typecheck + build**

Run: `pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web build`
Expected: PASS (Next.js build succeeds).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ChatView.tsx apps/web/src/components/chat/MessageList.tsx
git commit -m "feat(web): mobile responsive breakpoints + demo banner clarity"
```

---

## Task 13: Docs — README submission rewrite

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the README for submission**

Replace the entire content of `README.md`:

```markdown
# 🫛 Pouch

> **Talk to your money. It cashes out anywhere.**

Pouch is an AI cashout agent for crypto. Users speak in natural language and an AI agent converts their crypto into real-world value — gift cards, mobile top-ups, eSIM — without ever seeing wallets, gas, chains, or signing popups.

Built for the **UXmaxx Hackathon** (Encode Club × Particle Network). Targets 4 bounties (~$4.1k–5.1k).

---

## 🎬 The demo (30s)

```
User:  "Cash out $50 to Amazon"

🤖 Pouch (agent trace visible inline):
  ● Reading unified balance       ✓  [3 assets, $55 total]
  ● Finding best provider         ✓  [cheapest: Bitrefill]
  ● Creating order with Bitrefill ✓
  ● Funding agent wallet          ✓  [UA 7702 cross-chain]
  ● Paid via Openfort gasless     ✓  [NO POPUP — gas sponsored]
  ✅ Amazon gift card: [AMZN-XXXX-XXXX]
```

**Zero popups. Zero gas visible. Zero "which chain?".** The user just talks. The agent does the rest — and shows its work.

---

## 🏆 Bounties targeted

| # | Bounty | Prize | Where it's satisfied |
|---|--------|-------|----------------------|
| 1 | **Universal Accounts Track** | $1.5k–2.5k | Cross-chain consolidation via Particle UA + EIP-7702 (`packages/infra-web3/src/particle/`) |
| 2 | **Arbitrum** | $2k | Settlement chain = Arbitrum One (42161), `SETTLEMENT_CHAIN_ID` in config |
| 3 | **Magic Labs** | $500 | Embedded wallet + blind signatures, zero popups (`apps/web/src/lib/magic-client.ts`, trace `[NO POPUP]` badge) |
| 4 | **Openfort** | $100 | Agent backend wallet + gas sponsorship (`packages/infra-web3/src/openfort/`) |

📖 Full bounty mapping: [`docs/SUBMISSION.md`](./docs/SUBMISSION.md)

---

## ✨ Features

- **Conversational interface** — natural language → crypto cash-out. Gemini LLM with regex fallback (always works, with or without API key).
- **Cross-chain consolidation** — funds across Arbitrum, Base, Polygon unified via Particle Universal Accounts (EIP-7702).
- **Agent wallet gasless settlement** — Openfort backend wallet (EIP-7702) pays the provider gasless via policy + feeSponsorship. The user never signs a settlement tx.
- **Agent trace transparency** — every step visible inline (balance → route → order → fund agent → gasless pay → deliver).
- **Invisible UX** — Magic embedded wallet with blind signatures; zero signing popups. Counter shows "N signatures · zero popups".
- **Real off-ramp integration** — Bitrefill adapter (8,000+ brands) with quote pricing, webhook verification, redemption fetch.

---

## 🏗️ Architecture

Hexagonal (ports & adapters). The domain logic is pure — no SDKs, no React, no fetch. Every external service is an interchangeable adapter.

```
┌─────────────────────────────────────────┐
│  apps/web (Next.js 15)  apps/api (Hono) │
└──────────────────┬──────────────────────┘
                   │
      ┌────────────▼────────────┐
      │   packages/domain       │  ← pure logic, zero deps
      └────────────┬────────────┘
                   │
   ┌───────────────┼───────────────┐
   ▼               ▼               ▼
infra-offramp   infra-web3      infra-db
(Bitrefill)     (Particle UA,   (Drizzle,
                 Magic,          Postgres)
                 Openfort)
```

**Adding a new provider = 1 file.** Zero changes to domain, router, executor, or frontend.

📖 Full design: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

---

## 🚀 Quick start

### Prerequisites
- Node.js 22+
- pnpm 10+
- Docker (for local Postgres)

### Setup
```bash
pnpm install
cp .env.example .env       # fill in your API keys (see checklist below)
docker compose up -d        # start Postgres (optional: only for persistence)
pnpm db:migrate             # run migrations (optional: needs Postgres)
pnpm dev                    # start API (:3001) + web (:3000)
```

### Demo mode (no keys needed)
Without any env keys, Pouch runs in **demo mode**: simulated balances, simulated payments, regex intent parser. Open `http://localhost:3000` and type "Cash out $25 to Amazon". The full agent trace renders.

### Env checklist (for real integrations)
| Variable | Provider | Required for |
|----------|----------|--------------|
| `BITREFILL_API_KEY` | Bitrefill | Real gift card quotes + orders |
| `MAGIC_PUBLISHABLE_KEY` + `MAGIC_SECRET_KEY` | Magic Labs | Real wallet auth (blind signatures) |
| `PARTICLE_PROJECT_ID` + `PARTICLE_CLIENT_KEY` + `PARTICLE_APP_ID` | Particle | Real UA balance + consolidation |
| `OPENFORT_SECRET_KEY` + `OPENFORT_WALLET_SECRET` + `OPENFORT_FEE_SPONSORSHIP_ID` | Openfort | Gasless agent-wallet settlement |
| `GEMINI_API_KEY` | Google | LLM conversational replies (regex fallback works without it) |
| `DATABASE_URL` | Supabase/Postgres | Order persistence (in-memory fallback in demo) |
| `JWT_SECRET` + `WEBHOOK_SECRET` | — | Auth + webhook verification (generate with `openssl rand -hex 32`) |

See [`.env.example`](./.env.example) for the full annotated list.

---

## 📋 Commands

```bash
pnpm dev          # start all dev servers (API + web)
pnpm typecheck    # TypeScript across all packages
pnpm lint         # ESLint across all packages
pnpm test         # Vitest across all packages
pnpm build        # build all packages
pnpm db:migrate   # run Drizzle migrations
```

---

## 🛠️ Tech stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Backend | Hono (Node.js, edge-ready) |
| Frontend | Next.js 15 (App Router) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| Web3 | Particle UA (EIP-7702) + Magic (blind signatures) + Openfort (gas sponsorship) |
| AI / LLM | Gemini (`@google/genai`) — function calling, structured output |

---

## 📚 Documentation

- [`AGENTS.md`](./AGENTS.md) — Start here (for agents and contributors)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Full technical design
- [`docs/SUBMISSION.md`](./docs/SUBMISSION.md) — Bounty mapping (judges read this)
- [`docs/PROVIDERS.md`](./docs/PROVIDERS.md) — API reference for all integrations
- [`docs/HACKATHON_INTEL.md`](./docs/HACKATHON_INTEL.md) — Competitive analysis
- [`docs/HANDOFF.md`](./docs/HANDOFF.md) — Current implementation snapshot

---

## 📄 License

Private — built for UXmaxx Hackathon. All rights reserved.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: submission README — bounties, demo, env checklist"
```

---

## Task 14: Docs — `SUBMISSION.md` bounty mapping

**Files:**
- Create: `docs/SUBMISSION.md`

- [ ] **Step 1: Write the bounty mapping doc**

Create `docs/SUBMISSION.md`:

```markdown
# Pouch — Bounty Submission Mapping

> For UXmaxx Hackathon judges. This doc maps each bounty's criteria to where it's satisfied in the codebase and demo.

---

## 1. Universal Accounts Track ($1.5k–2.5k)

**Requirement:** Use Particle Universal Accounts (EIP-7702 mode) for chain abstraction.

| Criterion | Where |
|-----------|-------|
| UA integration | `packages/infra-web3/src/particle/universal-account.ts` — `ParticleAccountProvider` uses `@particle-network/universal-account-sdk@^2.0.3` with `useEIP7702: true` |
| EIP-7702 mode | `smartAccountOptions: { name: 'UNIVERSAL', version: UNIVERSAL_ACCOUNT_VERSION, useEIP7702: true }` (line 66 of universal-account.ts) |
| Cross-chain consolidation | `CashOutExecutor` consolidation step: `account.consolidate(userId, chainId, token)` → trace step `Consolidating via Universal Account [UA 7702]` |
| Unified balance | `GET /balance` → `ParticleAccountProvider.getUnifiedBalance()` → `ua.getPrimaryAssets()` |
| UX (40%) | Chat interface, blind signatures, trace shows the consolidation transparently |
| Demo artifact | Trace step `Funding agent wallet [UA 7702]` — visible in the chat UI |

---

## 2. Arbitrum ($2k)

**Requirement:** Build on Arbitrum.

| Criterion | Where |
|-----------|-------|
| Settlement chain = Arbitrum One | `SETTLEMENT_CHAIN_ID=42161` in `.env.example` + Zod config (`packages/shared/src/config.ts`) |
| Real Arbitrum tx (when configured) | Agent wallet settlement: `OpenfortAgentWallet.settlePayment({ chainId: 42161, ... })` — gasless ERC-20 transfer on Arbitrum |
| Openfort + Arbitrum | Openfort policy configured for Arbitrum (42161) + Base (8453); feeSponsorship `pay_for_user` |

---

## 3. Magic Labs ($500)

**Requirement:** Embedded wallet + blind signatures (zero popups).

| Criterion | Where |
|-----------|-------|
| Magic embedded wallet | `apps/web/src/lib/magic-client.ts` — `magic-sdk` + `@magic-ext/evm`, lazy singleton |
| Blind signature login | `loginWithEmail()` → Magic DID token → `/auth/callback` → server validates via `@magic-sdk/admin` → JWT cookie |
| Zero popups | The trace emphasizes `[NO POPUP]` badges; the header shows "N signatures · zero popups" counter (`ChatView.tsx` `ZeroPopupBadge`) |
| EIP-7702 signing | Magic signs the UA `rootHash` + 7702 auths in the browser (Phase 1 transaction planner seam: `apps/api/src/services/transaction-planner.ts`) |
| UX differentiator | User never sees a wallet, gas, chain, or signing popup — just a chat |

---

## 4. Openfort ($100)

**Requirement:** Agent backend wallet + gas sponsorship.

| Criterion | Where |
|-----------|-------|
| Agent backend wallet | `packages/infra-web3/src/openfort/openfort-provider.ts` — `OpenfortAgentWallet` implements `AgentWalletPort` |
| SDK | `@openfort/openfort-node@^0.10.8` — `accounts.evm.backend.create()` + `accounts.evm.backend.sendTransaction()` |
| Gas sponsorship | `sendTransaction({ ..., policy: feeSponsorshipId })` — policy + feeSponsorship (`pay_for_user`) linked in Openfort dashboard |
| EIP-7702 delegation | Automatic on first tx per chain (Openfort "Calibur" implementation) |
| Deferred ESM import | `createRealOpenfortClientFactory()` returns a lazy factory; the SDK `import()` runs on first `getAddress()`/`settlePayment()` call (same pattern as Particle fix) — demo mode never constructs the wallet |
| Domain port | `packages/domain/src/types.ts` `AgentWalletPort` — pure, no SDK |
| Two-step settlement trace | `CashOutExecutor`: `Funding agent wallet [UA 7702]` → `Paid via Openfort gasless [NO POPUP]` |
| Config fail-fast | `packages/infra-web3/src/factory.ts` `createAgentWallet()` — throws in production if OPENFORT_SECRET_KEY is set but WALLET_SECRET or FEE_SPONSORSHIP_ID is missing |
| Tests | `packages/infra-web3/__tests__/openfort-provider.test.ts` (7 tests, mocked SDK), `openfort-mapper.test.ts` (4), `agent-wallet-factory.test.ts` (4), `apps/api/src/bootstrap/create-runtime-app-services-agent-wallet.test.ts` (3), `packages/domain/__tests__/executor.test.ts` (2 new) |

### Openfort dashboard setup (manual gate, documented for reproducibility)
1. Create a project at openfort.io → Dashboard.
2. Enable backend wallets → get `WALLET_SECRET`.
3. Create a **policy** (chains: Base 8453 + Arbitrum 42161, rules: `sponsorEvmTransaction`).
4. Create a **feeSponsorship** (strategy: `pay_for_user`, linked to the policy above).
5. Put the 3 IDs in `.env`: `OPENFORT_SECRET_KEY`, `OPENFORT_WALLET_SECRET`, `OPENFORT_FEE_SPONSORSHIP_ID`.
6. Optional smoke: one real gasless tx (free tier = 2,000 ops/mo).

---

## What is NOT claimed

- **ZeroDev SRA** ($500): Dropped. Free tier is testnet-only; Particle UA is mainnet-only → architecturally incompatible on a free budget. No code shipped for ZeroDev.
- **Bitrefill real purchase**: Mock fulfillment for dev and demo (zero cost, zero demo risk). The adapter is real (quotes, webhook verification, redemption fetch) but no live purchase is executed.
- **Production deployment**: Local demo only. Deploy is post-hackathon.
```

- [ ] **Step 2: Commit**

```bash
git add docs/SUBMISSION.md
git commit -m "docs: SUBMISSION.md — bounty mapping for judges"
```

---

## Task 15: Docs — Update AGENTS.md + HANDOFF.md + `.env.example`

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/HANDOFF.md`
- Modify: `.env.example`

- [ ] **Step 1: Update AGENTS.md — Phase 4 status + bounty table**

In `AGENTS.md`, update the header status line (line 3):

```markdown
> Last updated: 2026-07-14. Project status: **Phase 1 — Web3 + auth (code done, 2 manual gates pending; runtime blocker FIXED); Phase 2 — LLM layer (merged); Phase 3 — Frontend (code complete, E2E verified); Phase 4 — Openfort + CI + demo hardening (code complete)**.
```

In the bounty table (lines ~16–22), the ZeroDev row is already marked dropped. Verify the Openfort row reads `$100` and the "How Pouch covers it" column says "Agent backend wallet + gas sponsorship (policy + feeSponsorship `pay_for_user`)".

In the "Current phase & status" section, add Phase 4 as complete. After the Phase 3 checklist item, add:

```markdown
- [x] **Phase 4 (2026-07-14):** Openfort gas sponsorship — `AgentWalletPort` (domain) + `OpenfortAgentWallet` (infra-web3, deferred ESM via lazy `clientFactory`) + `NoopAgentWallet` + `createAgentWallet` factory (prod fail-fast, synchronous). `CashOutExecutor` two-step settlement trace (`Funding agent wallet [UA 7702]` → `Paid via Openfort gasless [NO POPUP]`). Runtime wiring (sync, no boot change). CI lint+build step. Frontend hardening (error bubbles, balance skeleton, mobile responsive). README + SUBMISSION.md. See `docs/superpowers/plans/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md`.
- [x] CI lint step (`.github/workflows/ci.yml` now runs typecheck + lint + test + build)
```

- [ ] **Step 2: Update HANDOFF.md — Phase 4 status**

In `docs/HANDOFF.md`, update the "Last updated" line (line 3):

```markdown
Last updated: 2026-07-14 (Phase 4 code complete — Openfort + CI + demo hardening)
```

In the Phase 4 section (lines 129–136), change the `⬜` items to `✅`:

```markdown
### Phase 4 — Bounties + polish (CODE COMPLETE 2026-07-14)
- ✅ **Spec written (2026-07-14):** [`docs/superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md`](./superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md)
- ❌ **ZeroDev SRA DROPPED (2026-07-14):** [keep existing text]
- ❌ **Bitrefill real purchase DROPPED:** [keep existing text]
- ✅ **Openfort gas sponsorship — BUILT:** `AgentWalletPort` (domain) + `OpenfortAgentWallet` (infra-web3) + `NoopAgentWallet` + factory. Two-step settlement trace. Runtime wired (sync, no boot change). ~20 new tests.
- ✅ **CI lint step** — `.github/workflows/ci.yml` runs typecheck + lint + test + build on every PR/push.
- ✅ **Demo hardening** — error bubbles, balance skeleton, mobile responsive, demo banner clarity.
- ✅ **Submission prep** — README rewritten, `docs/SUBMISSION.md` bounty mapping.
```

- [ ] **Step 3: Update `.env.example` Openfort comments**

Edit `.env.example`. Replace the Openfort section (lines 58–62):

```bash
# Openfort (agent backend wallet + gas sponsorship) — $100 bounty
# Get keys: openfort.io → Dashboard
# Setup: create project → enable backend wallets (get WALLET_SECRET) →
#   create policy (Base 8453 + Arbitrum 42161, sponsorEvmTransaction) →
#   create feeSponsorship (pay_for_user, linked to policy) →
#   put all 3 IDs below. See docs/SUBMISSION.md §4.
OPENFORT_SECRET_KEY=
OPENFORT_WALLET_SECRET=
OPENFORT_FEE_SPONSORSHIP_ID=
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/HANDOFF.md .env.example
git commit -m "docs: mark Phase 4 complete; update bounty table + Openfort setup"
```

---

## Task 16: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run all quality gates**

```bash
pnpm typecheck   # all packages
pnpm lint        # all packages
pnpm test        # all packages — expect 104 baseline + new Phase 4 tests
pnpm build       # all packages
```

Expected: ALL PASS. Test count should be 104 (existing) + ~20 new (2 domain executor + 4 mapper + 7 provider + 4 factory + 3 runtime wiring) = ~124.

- [ ] **Step 2: Boot the API in demo mode**

Run: `pnpm dev:api`
Expected: `Pouch API listening on http://localhost:3001` (no OPENFORT env → agent wallet undefined → demo path).

- [ ] **Step 3: Boot the web app in demo mode**

Run: `pnpm dev:web` (in a second terminal)
Expected: Next.js on :3000, chat renders, demo banner shows, "Cash out $25 to Amazon" returns the full trace.

- [ ] **Step 4: E2E smoke — demo flow**

With both servers running:
```bash
curl -s http://localhost:3000/api/health
# Expected: {"ok":true,"service":"api","mode":"demo"}

curl -s -X POST http://localhost:3000/api/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Cash out $25 to Amazon"}' | head -c 500
# Expected: AgentChatResponse with trace (demo path: 4 steps, no agent-wallet steps since OPENFORT unset)
```

- [ ] **Step 5: Verify CI workflow is valid YAML**

```bash
cat .github/workflows/ci.yml
# Confirm: install --frozen-lockfile, typecheck, lint, test, build — all present
```

- [ ] **Step 6: Final commit (if any stray changes)**

If the verification surfaced any fixes, commit them. Otherwise, no commit needed.

```bash
git status  # should be clean
```

---

## Manual gates (user-run, NOT agent tasks — documented for completeness)

These are NOT part of this plan's tasks. They are listed in the spec (§5) and make the demo real:

1. **UA spike (Phase 1):** `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike` (~$1 USDC)
2. **DB migration (Phase 1):** `pnpm db:migrate` (needs live Postgres)
3. **Openfort dashboard setup (Phase 4):** Create project → backend wallets → policy → feeSponsorship → 3 IDs in `.env`. Documented step-by-step in `docs/SUBMISSION.md` §4.

**The demo works without any of these gates** (demo mode). The gates make it real.

---

## Phase summary

| Work item | Layer | Bounty | Task # |
|-----------|-------|--------|--------|
| `AgentWalletPort` + error types | domain | Openfort narrative | 1 |
| `CashOutExecutor` two-step settlement | domain | Openfort narrative | 2 |
| Openfort error mapper | infra-web3 | Openfort $100 | 3 |
| `OpenfortAgentWallet` provider | infra-web3 | Openfort $100 | 4 |
| `NoopAgentWallet` | infra-web3 | — | 5 |
| `createAgentWallet` factory | infra-web3 | Openfort $100 | 6 |
| Runtime wiring (sync, deferred SDK) | api | — | 7 |
| Domain error HTTP mapping | api | — | 8 |
| CI lint + build step | ci | — | 9 |
| Friendly error bubble | web | UX 40% | 10 |
| Balance skeleton loading | web | UX 40% | 11 |
| Mobile responsive | web | UX 40% | 12 |
| README submission rewrite | docs | all | 13 |
| `SUBMISSION.md` bounty mapping | docs | all | 14 |
| AGENTS + HANDOFF + .env updates | docs | — | 15 |
| Final verification | — | — | 16 |
