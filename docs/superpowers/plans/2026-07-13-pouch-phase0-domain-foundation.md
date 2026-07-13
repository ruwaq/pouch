# Pouch Phase 0 — Domain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every internal seam that Phases 1–3 depend on (trace steps, parser strategy interface, ownership plumbing, the Gap F bug, config/schema prep) — with no SDK installs and no real funds, fully covered by the existing Vitest setup.

**Architecture:** This phase only touches pure domain logic, the Hono service/route layer, the Bitrefill adapter signature, the shared Zod config, and Drizzle schema/indexes. It introduces `TraceStep` + `TraceRecorder` in `domain`, widens `CashOutExecutor` to emit a trace, introduces `IntentParserStrategy` so an LLM parser can be injected later, fixes the `verifyWebhook` arity mismatch, threads `userId` through orders for ownership, adds the missing `LLM_*` config keys, and adds unique indexes on `users` for race-safe auth upsert.

**Tech Stack:** TypeScript 5.8, Vitest 3.2, Zod 3.25, Drizzle 0.44 (schema + indexes only — no migration run needed for tests), Hono 4.9, pnpm 10 workspaces, Turborepo 2.5.

---

## File Structure

### New files
- `packages/domain/src/trace.ts` — `TraceStep` interface, `TraceRecorder` class. Pure, no SDKs.
- `packages/domain/__tests__/trace.test.ts` — `TraceRecorder` unit tests.
- `packages/domain/__tests__/executor.test.ts` — `CashOutExecutor` trace + ownership tests with mock providers.

### Modified files
- `packages/domain/src/types.ts` — add `TraceStep` (re-exported from trace.ts), add `userId` to `Order` + `OrderRequest`, widen `CashOutResult` to include `trace`.
- `packages/domain/src/trace.ts` (new) — see above.
- `packages/domain/src/executor.ts` — accept `userId` for ownership, emit trace steps via `TraceRecorder`, return trace in `CashOutResult`.
- `packages/domain/src/intent-parser.ts` — `IntentParser` implements a new `IntentParserStrategy` interface.
- `packages/domain/src/index.ts` — export trace + `IntentParserStrategy`.
- `packages/infra-offramp/src/bitrefill/adapter.ts` — `verifyWebhook(payload, headers)` 2-arg signature (Gap F fix).
- `packages/infra-offramp/__tests__/bitrefill-adapter.test.ts` — call `verifyWebhook` with 2 args.
- `packages/infra-db/src/repositories/order-repository.ts` — set + filter `userId` on orders.
- `packages/infra-db/src/schema.ts` — add unique partial indexes on `users.magicPublicKey` + `users.evmAddress`.
- `apps/api/src/support/memory-order-repository.ts` — set + filter `userId`.
- `apps/api/src/services/agent-chat-service.ts` — depend on `IntentParserStrategy`; surface `trace` in `AgentChatResponse`.
- `apps/api/src/routes/orders.ts` — read `userId` from query (temporary, pre-auth), pass to `getOrder`.
- `apps/api/src/services/order-service.ts` — `getOrder(id, userId)` with ownership check.
- `apps/api/src/bootstrap/create-runtime-app-services.ts` + `create-demo-agent-service.ts` — pass `userId`-aware constructor; update demo/test wiring.
- `apps/api/src/app.test.ts` — update existing tests for `trace` + ownership + 2-arg `verifyWebhook` in mocks.
- `packages/shared/src/config.ts` — add `LLM_PROVIDER`, `GEMINI_API_KEY`, `LLM_MODEL`.

---

## Task 1: TraceStep + TraceRecorder (domain, pure)

**Files:**
- Create: `packages/domain/src/trace.ts`
- Test: `packages/domain/__tests__/trace.test.ts`

**Why first:** The executor trace (Task 2) and the API response (Task 5) both depend on this type existing. It is pure (no SDKs), so it lands first and unblocks everything.

- [ ] **Step 1: Write the failing test**

Create `packages/domain/__tests__/trace.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { TraceRecorder } from '../src/trace';

describe('TraceRecorder', () => {
  it('records a step as pending then completes it with a duration', async () => {
    const recorder = new TraceRecorder();

    const step = recorder.start('Consolidating via Universal Account');

    expect(step.status).toBe('active');
    expect(step.label).toBe('Consolidating via Universal Account');

    await new Promise((resolve) => setTimeout(resolve, 5));

    recorder.complete(step.id);
    const steps = recorder.steps;

    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe('complete');
    expect(steps[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('supports an optional badge and detail on a step', () => {
    const recorder = new TraceRecorder();
    const step = recorder.start('Signed via Magic', { badge: 'NO POPUP', detail: 'EIP-7702 blind signature' });

    recorder.complete(step.id);

    expect(recorder.steps[0]?.badge).toBe('NO POPUP');
    expect(recorder.steps[0]?.detail).toBe('EIP-7702 blind signature');
  });

  it('marks a step as error with a detail message', () => {
    const recorder = new TraceRecorder();
    const step = recorder.start('Routed to provider');

    recorder.fail(step.id, 'All providers returned an error');

    expect(recorder.steps[0]?.status).toBe('error');
    expect(recorder.steps[0]?.detail).toBe('All providers returned an error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pouch/domain test`
Expected: FAIL — `Cannot find module '../src/trace'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/domain/src/trace.ts`:

```typescript
export type TraceStepStatus = 'pending' | 'active' | 'complete' | 'error';

export interface TraceStep {
  id: string;
  label: string;
  status: TraceStepStatus;
  durationMs?: number;
  badge?: string;
  detail?: string;
}

export interface TraceRecorderPort {
  readonly steps: TraceStep[];
  start(label: string, options?: { badge?: string; detail?: string }): TraceStep;
  complete(stepId: string): void;
  fail(stepId: string, detail: string): void;
}

export class TraceRecorder implements TraceRecorderPort {
  private readonly stepList: TraceStep[] = [];
  private readonly startedAt = new Map<string, number>();

  get steps(): TraceStep[] {
    return [...this.stepList];
  }

  start(label: string, options: { badge?: string; detail?: string } = {}): TraceStep {
    const id = globalThis.crypto.randomUUID();
    const step: TraceStep = {
      id,
      label,
      status: 'active',
      ...(options.badge ? { badge: options.badge } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
    };

    this.stepList.push(step);
    this.startedAt.set(id, Date.now());

    return step;
  }

  complete(stepId: string): void {
    this.setTerminal(stepId, 'complete');
  }

  fail(stepId: string, detail: string): void {
    this.setTerminal(stepId, 'error', detail);
  }

  private setTerminal(stepId: string, status: 'complete' | 'error', detail?: string): void {
    const step = this.stepList.find((entry) => entry.id === stepId);

    if (!step) {
      return;
    }

    const startedAt = this.startedAt.get(stepId) ?? Date.now();

    step.status = status;
    step.durationMs = Date.now() - startedAt;

    if (detail) {
      step.detail = detail;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pouch/domain test`
Expected: PASS — 3 trace tests green.

- [ ] **Step 5: Export trace from the domain barrel**

Modify `packages/domain/src/index.ts` — add the export line so the file becomes:

```typescript
export * from './errors';
export * from './executor';
export * from './intent-parser';
export * from './router';
export * from './trace';
export * from './types';
```

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/trace.ts packages/domain/src/index.ts packages/domain/__tests__/trace.test.ts
git commit -m "feat(domain): add TraceStep + TraceRecorder for agent execution trace"
```

---

## Task 2: CashOutExecutor emits trace + threads userId for ownership

**Files:**
- Modify: `packages/domain/src/types.ts` (add `userId` to `Order` + `OrderRequest`; widen `CashOutResult`)
- Modify: `packages/domain/src/executor.ts` (emit trace, set order.userId, return trace)
- Test: `packages/domain/__tests__/executor.test.ts`

**Why:** The executor is the heart of the cash-out flow. It must (a) attach `userId` to every order it creates so ownership works, (b) record a trace step at each phase so the API + frontend can show "how I did this", and (c) return the trace in `CashOutResult`.

- [ ] **Step 1: Write the failing test**

Create `packages/domain/__tests__/executor.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  CashOutExecutor,
  OffRampRouter,
  type AccountProvider,
  type LoggerPort,
  type OffRampProvider,
  type Order,
  type OrderRequest,
  type Product,
} from '@pouch/domain';
import { ok } from '@pouch/shared';

class StubProvider implements OffRampProvider {
  readonly id = 'stub-provider';
  readonly name = 'Stub Provider';
  readonly categories = ['giftcard'] as const;

  private readonly product: Product = {
    id: 'amazon-us',
    providerId: this.id,
    name: 'Amazon US',
    brand: 'Amazon',
    category: 'giftcard',
    denominations: [50],
  };

  async searchProducts(): ReturnType<OffRampProvider['searchProducts']> {
    return ok([this.product]);
  }

  async getQuote(product: Product, amount: { value: number; currency: 'USD' }): ReturnType<OffRampProvider['getQuote']> {
    return ok({
      providerId: this.id,
      productId: product.id,
      faceValue: amount,
      paymentAmount: amount,
      estimatedDelivery: 'instant',
    });
  }

  async createOrder(request: OrderRequest): ReturnType<OffRampProvider['createOrder']> {
    return ok({
      id: 'order-1',
      providerOrderId: 'provider-order-1',
      providerId: this.id,
      userId: request.userId,
      product: this.product,
      faceValue: request.amount,
      payment: {
        address: '0xpayment',
        amount: request.amount,
        chainId: 42161,
        token: 'USDC',
      },
      status: 'payment_pending',
      idempotencyKey: request.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async getOrderStatus(): ReturnType<OffRampProvider['getOrderStatus']> {
    return ok('payment_pending');
  }

  async verifyWebhook(): ReturnType<OffRampProvider['verifyWebhook']> {
    throw new Error('Not used in this test.');
  }
}

class CapturingRepository {
  readonly saved: Order[] = [];
  readonly statuses: Array<{ id: string; status: string }> = [];

  async save(order: Order): Promise<void> {
    this.saved.push(order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.saved.find((order) => order.id === id) ?? null;
  }

  async findByProviderOrderId(): Promise<Order | null> {
    return null;
  }

  async updateStatus(id: string, status: Order['status']): Promise<void> {
    this.statuses.push({ id, status });
  }
}

const logger: LoggerPort = { info() {}, error() {} };

function buildExecutor() {
  const providers = [new StubProvider()];
  const repository = new CapturingRepository();
  const account: AccountProvider = {
    async getUnifiedBalance() {
      return ok({ total: 200, assets: [{ chainId: 42161, symbol: 'USDC', amount: 200, usdValue: 200 }], requiresConsolidation: false });
    },
    async consolidate() {
      return ok({ txHash: '0xconsolidate' });
    },
    async sendPayment() {
      return ok({ txHash: '0xpay' });
    },
  };
  const executor = new CashOutExecutor(new OffRampRouter(providers), providers, account, repository as any, logger);

  return { executor, repository };
}

describe('CashOutExecutor', () => {
  it('attaches the userId to the created order and returns a populated trace', async () => {
    const { executor, repository } = buildExecutor();

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(repository.saved[0]?.userId).toBe('user-42');
    expect(result.value.orderId).toBe('order-1');
    expect(result.value.trace.length).toBeGreaterThanOrEqual(4);
    expect(result.value.trace.every((step) => step.status === 'complete')).toBe(true);
    const labels = result.value.trace.map((step) => step.label);
    expect(labels.some((label) => /balance/i.test(label))).toBe(true);
    expect(labels.some((label) => /rout/i.test(label))).toBe(true);
    expect(labels.some((label) => /sign|payment|pay/i.test(label))).toBe(true);
  });

  it('includes a consolidation step when the balance requires consolidation', async () => {
    const providers = [new StubProvider()];
    const repository = new CapturingRepository();
    const account: AccountProvider = {
      async getUnifiedBalance() {
        return ok({ total: 50, assets: [{ chainId: 8453, symbol: 'ETH', amount: 0.02, usdValue: 50 }], requiresConsolidation: true });
      },
      async consolidate() {
        return ok({ txHash: '0xconsolidate' });
      },
      async sendPayment() {
        return ok({ txHash: '0xpay' });
      },
    };
    const executor = new CashOutExecutor(new OffRampRouter(providers), providers, account, repository as any, logger);

    const result = await executor.execute(
      { action: 'cash_out', category: 'giftcard', brand: 'amazon', amount: { value: 50, currency: 'USD' } },
      'user-42',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.trace.some((step) => /consolidat/i.test(step.label))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pouch/domain test`
Expected: FAIL — `Order` has no `userId`; `OrderRequest` has no `userId`; `CashOutResult` has no `trace`.

- [ ] **Step 3: Update domain types**

Modify `packages/domain/src/types.ts`. Three edits.

**Edit A** — add `userId` to `OrderRequest` (the `OrderRequest` interface, ~line 44–52). Replace the whole `OrderRequest` interface:

```typescript
export interface OrderRequest {
  productId: string;
  amount: Amount;
  idempotencyKey: string;
  userId?: UserId;
  recipient?: {
    name?: string;
    email?: string;
  };
}
```

**Edit B** — add `userId` to `Order` (the `Order` interface, ~line 54–76). Add `userId?: UserId;` as the second field (right after `id`):

```typescript
export interface Order {
  id: string;
  userId?: UserId;
  providerOrderId?: string;
  providerId: ProviderId;
  product: Product;
  faceValue: Amount;
  payment: {
    address?: string;
    amount: Amount;
    chainId: number;
    token: string;
    txHash?: string;
  };
  status: OrderStatus;
  redemption?: {
    code?: string;
    link?: string;
    instructions?: string;
  };
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Edit C** — widen `CashOutResult` to include the trace (the `CashOutResult` interface, ~line 159–162). Replace it:

```typescript
export interface CashOutResult {
  orderId: string;
  status: Extract<OrderStatus, 'payment_pending' | 'delivered'>;
  trace: TraceStep[];
}
```

Because `TraceStep` is defined in `trace.ts`, add the import at the top of `types.ts`. After the existing two imports, the top of the file becomes:

```typescript
import type { Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { TraceStep } from './trace';
```

- [ ] **Step 4: Update the executor to emit trace + set userId**

Modify `packages/domain/src/executor.ts`. Two edits.

**Edit A** — imports + add `TraceRecorder` to constructor + trace accessor. Replace lines 1–23 (the import block + class declaration + constructor):

```typescript
import { err, isOk, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import { OffRampRouter } from './router';
import { TraceRecorder } from './trace';
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

export class CashOutExecutor {
  constructor(
    private readonly router: OffRampRouter,
    private readonly providers: readonly OffRampProvider[],
    private readonly account: AccountProvider,
    private readonly orders: OrderRepository,
    private readonly logger: LoggerPort,
  ) {}
```

**Edit B** — rewrite `execute()` to thread `userId` into the order request, record a trace step at each phase, mark the failing step on error, and return the trace. Replace the entire `execute` method (lines 25–121):

```typescript
  async execute(intent: CashOutIntent, userId: UserId): Promise<Result<CashOutResult, DomainError>> {
    const trace = new TraceRecorder();

    const balanceStep = trace.start('Reading unified balance');
    const balance = await this.account.getUnifiedBalance(userId);

    if (!isOk(balance)) {
      trace.fail(balanceStep.id, 'Balance provider unavailable.');
      return balance;
    }

    trace.complete(balanceStep.id, {
      badge: `${balance.value.assets.length} asset${balance.value.assets.length === 1 ? '' : 's'}`,
    });

    if (balance.value.total < intent.amount.value) {
      return err({
        type: 'INSUFFICIENT_FUNDS',
        available: balance.value.total,
        required: intent.amount.value,
      });
    }

    const routingStep = trace.start('Finding best provider');
    const routing = await this.router.findBestOption(intent);

    if (!isOk(routing)) {
      trace.fail(routingStep.id, 'No provider could fulfill this request.');
      return routing;
    }

    trace.complete(routingStep.id, { badge: 'cheapest' });

    const provider = this.providers.find((candidate) => candidate.id === routing.value.quote.providerId);

    if (!provider) {
      trace.fail(routingStep.id, `Provider ${routing.value.quote.providerId} not found.`);
      return err({
        type: 'PROVIDER_NOT_FOUND',
        providerId: routing.value.quote.providerId,
      });
    }

    const orderStep = trace.start(`Creating order with ${provider.name}`);
    const orderRequest = {
      productId: routing.value.quote.productId,
      amount: intent.amount,
      idempotencyKey: crypto.randomUUID(),
      userId,
      ...(intent.recipient ? { recipient: intent.recipient } : {}),
    };

    const order = await provider.createOrder(orderRequest);

    if (!isOk(order)) {
      trace.fail(orderStep.id, 'Order creation failed.');
      return order;
    }

    trace.complete(orderStep.id);

    if (order.value.userId !== userId) {
      order.value.userId = userId;
    }

    await this.orders.save(order.value);

    if (balance.value.requiresConsolidation) {
      const consolidationStep = trace.start('Consolidating via Universal Account', { badge: 'UA 7702' });
      const consolidation = await this.account.consolidate(
        userId,
        order.value.payment.chainId,
        order.value.payment.token,
      );

      if (!isOk(consolidation)) {
        this.logger.error({ orderId: order.value.id }, 'Consolidation failed.');
        trace.fail(consolidationStep.id, 'Consolidation failed.');
        await this.orders.updateStatus(order.value.id, 'failed');
        return consolidation;
      }

      trace.complete(consolidationStep.id);
    }

    if (!order.value.payment.address) {
      await this.orders.updateStatus(order.value.id, 'failed');

      return err({
        type: 'PAYMENT_ADDRESS_MISSING',
        orderId: order.value.id,
      });
    }

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
  }
```

> **Why no helper for error returns:** after `if (!isOk(balance))`, TypeScript narrows `balance` to the error variant `{ ok: false; error: DomainError }`, which is assignable to the function's `Result<CashOutResult, DomainError>` return type (it matches the error member of the union). This is the exact pattern the existing executor already uses (`return balance;`), so the error-path returns here are type-safe with no cast. The trace recorder is mutated in place before each early return, so the trace is complete on the error path too — but only the success path returns it (the API ignores trace on errors, which is the desired behavior).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @pouch/domain test`
Expected: PASS — executor tests green, plus trace + intent-parser + router tests still pass.

- [ ] **Step 6: Verify domain typechecks**

Run: `pnpm --filter @pouch/domain typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/types.ts packages/domain/src/executor.ts packages/domain/__tests__/executor.test.ts
git commit -m "feat(domain): CashOutExecutor emits trace steps and attaches userId to orders"
```

---

## Task 3: IntentParserStrategy interface (LLM injection seam)

**Files:**
- Modify: `packages/domain/src/intent-parser.ts`
- Modify: `packages/domain/src/index.ts` (already touched in Task 1 — re-confirm export)

**Why:** The LLM layer (Phase 2) needs to swap in a parser without the service layer depending on a concrete class. Introducing a strategy interface now means Phase 2 is purely additive.

- [ ] **Step 1: Write the failing test**

Add to `packages/domain/__tests__/intent-parser.test.ts` — append a new `describe` block at the end of the file (after the closing `});` of the existing describe, still inside the file):

```typescript
import type { IntentParserStrategy } from '../src/intent-parser';

describe('IntentParserStrategy', () => {
  it('is implemented by IntentParser so it can be substituted by an LLM parser', () => {
    const parser: IntentParserStrategy = new IntentParser();

    expect(typeof parser.parse).toBe('function');
  });
});
```

(The `IntentParser` import already exists at the top of the test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pouch/domain test`
Expected: FAIL — `IntentParserStrategy` is not exported from `intent-parser.ts`.

- [ ] **Step 3: Add the interface**

Modify `packages/domain/src/intent-parser.ts`. The existing import already brings in `Result` and `DomainError`. Add the strategy interface above the `IntentParser` class (before `export class IntentParser`):

```typescript
export interface IntentParserStrategy {
  parse(message: string): Result<CashOutIntent, DomainError>;
}
```

Then make the class explicitly implement it. Change the class declaration line from:

```typescript
export class IntentParser {
```

to:

```typescript
export class IntentParser implements IntentParserStrategy {
```

`packages/domain/src/index.ts` already does `export * from './intent-parser';` (touched in Task 1), so `IntentParserStrategy` is automatically re-exported — no further barrel change needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pouch/domain test`
Expected: PASS — all intent-parser tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/intent-parser.ts packages/domain/__tests__/intent-parser.test.ts
git commit -m "feat(domain): introduce IntentParserStrategy for LLM parser injection"
```

---

## Task 4: Fix Gap F — BitrefillAdapter.verifyWebhook 2-arg signature

**Files:**
- Modify: `packages/infra-offramp/src/bitrefill/adapter.ts` (line 154)
- Modify: `packages/infra-offramp/__tests__/bitrefill-adapter.test.ts` (line 274)

**Why:** The `OffRampProvider.verifyWebhook` interface declares `(payload, headers)` but the Bitrefill adapter implements only `(payload)`. The existing test calls it with 1 arg so it passes despite the mismatch — a latent bug. The webhook route already collects headers into a `Record<string,string>` and passes both, so the adapter must accept both.

- [ ] **Step 1: Update the adapter signature**

Modify `packages/infra-offramp/src/bitrefill/adapter.ts`, line 154. Change:

```typescript
  async verifyWebhook(payload: unknown): Promise<Result<WebhookEvent, DomainError>> {
```

to:

```typescript
  async verifyWebhook(payload: unknown, _headers: Record<string, string> = {}): Promise<Result<WebhookEvent, DomainError>> {
```

The `_` prefix signals the param is intentionally accepted-but-unused (Bitrefill verification re-fetches the canonical invoice rather than trusting headers). The default `{}` keeps single-arg callers working.

- [ ] **Step 2: Update the test to exercise the 2-arg call**

Modify `packages/infra-offramp/__tests__/bitrefill-adapter.test.ts`, lines 274–279. Change:

```typescript
    const result = await adapter.verifyWebhook({
      data: {
        id: 'invoice-verified',
        status: 'denied',
      },
    });
```

to:

```typescript
    const result = await adapter.verifyWebhook(
      {
        data: {
          id: 'invoice-verified',
          status: 'denied',
        },
      },
      { 'x-bitrefill-signature': 'sha256=fake', 'content-type': 'application/json' },
    );
```

- [ ] **Step 3: Run the adapter tests + typecheck**

Run: `pnpm --filter @pouch/infra-offramp test && pnpm --filter @pouch/infra-offramp typecheck`
Expected: PASS — 4 bitrefill adapter tests green; typecheck confirms the adapter now structurally satisfies `OffRampProvider` with the 2-arg signature.

- [ ] **Step 4: Commit**

```bash
git add packages/infra-offramp/src/bitrefill/adapter.ts packages/infra-offramp/__tests__/bitrefill-adapter.test.ts
git commit -m "fix(infra-offramp): BitrefillAdapter.verifyWebhook accepts headers (Gap F)"
```

---

## Task 5: Config — add LLM_PROVIDER / GEMINI_API_KEY / LLM_MODEL

**Files:**
- Modify: `packages/shared/src/config.ts`

**Why:** `.env.example` lists these keys but the Zod `ConfigSchema` does not include them, so `loadConfig()` silently strips them. Phase 2's LLM layer reads them.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/config.test.ts` (if a config test already exists, append to it instead):

```typescript
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

function validEnv() {
  return {
    APP_URL: 'http://localhost:3000',
    SETTLEMENT_CHAIN_ID: '42161',
    SUPPORTED_CHAINS: '42161,8453',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/pouch',
    JWT_SECRET: 'a'.repeat(32),
    WEBHOOK_SECRET: 'b'.repeat(32),
  };
}

describe('loadConfig', () => {
  it('defaults LLM config to undefined when not provided', () => {
    const config = loadConfig(validEnv());

    expect(config.LLM_PROVIDER).toBeUndefined();
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.LLM_MODEL).toBeUndefined();
  });

  it('parses LLM_PROVIDER, GEMINI_API_KEY, and LLM_MODEL when provided', () => {
    const config = loadConfig({
      ...validEnv(),
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'AIza-test-key',
      LLM_MODEL: 'gemini-2.0-flash',
    });

    expect(config.LLM_PROVIDER).toBe('gemini');
    expect(config.GEMINI_API_KEY).toBe('AIza-test-key');
    expect(config.LLM_MODEL).toBe('gemini-2.0-flash');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pouch/shared test`
Expected: FAIL — `config.LLM_PROVIDER` is `undefined` because Zod strips unknown keys (the test for "parses when provided" fails since the key isn't in the schema). The first test ("defaults") may pass by accident; the second is the real assertion.

- [ ] **Step 3: Add the keys to the schema**

Modify `packages/shared/src/config.ts`. In the `ConfigSchema` object, immediately after the `ZERODEV_PROJECT_ID` line (line 55) and before `DATABASE_URL`, add:

```typescript
  LLM_PROVIDER: z.enum(['gemini']).optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pouch/shared test`
Expected: PASS — both config tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config.ts packages/shared/__tests__/config.test.ts
git commit -m "feat(shared): add LLM_PROVIDER/GEMINI_API_KEY/LLM_MODEL to config schema"
```

---

## Task 6: Ownership plumbing — orders carry + filter by userId

**Files:**
- Modify: `packages/domain/src/types.ts` (`OrderRepository.findById` signature — done in this task)
- Modify: `packages/infra-db/src/repositories/order-repository.ts`
- Modify: `apps/api/src/support/memory-order-repository.ts`
- Modify: `packages/infra-db/src/schema.ts` (add `users` unique partial indexes)

**Why:** `/orders/:id` currently has no ownership check — any caller can read any order. Phase 1's auth middleware will populate `ctx.userId`; this task lands the data plumbing (order carries userId, repos filter by it) so the route change in Task 7 is trivial.

- [ ] **Step 1: Write the failing test for the memory repository**

Create `apps/api/src/support/memory-order-repository.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { Order } from '@pouch/domain';

import { MemoryOrderRepository } from './memory-order-repository';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    providerId: 'bitrefill',
    product: {
      id: 'amazon-us',
      providerId: 'bitrefill',
      name: 'Amazon US',
      brand: 'Amazon',
      category: 'giftcard',
      denominations: [50],
    },
    faceValue: { value: 50, currency: 'USD' },
    payment: { amount: { value: 50, currency: 'USD' }, chainId: 42161, token: 'USDC' },
    status: 'payment_pending',
    idempotencyKey: 'idem-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('MemoryOrderRepository ownership', () => {
  it('returns the order when userId matches', async () => {
    const repo = new MemoryOrderRepository();
    await repo.save(buildOrder({ id: 'order-1', userId: 'user-a' }));

    await expect(repo.findById('order-1', 'user-a')).resolves.toMatchObject({ id: 'order-1' });
  });

  it('returns null when userId does not match', async () => {
    const repo = new MemoryOrderRepository();
    await repo.save(buildOrder({ id: 'order-1', userId: 'user-a' }));

    await expect(repo.findById('order-1', 'user-b')).resolves.toBeNull();
  });

  it('returns the order regardless of userId when no userId filter is given', async () => {
    const repo = new MemoryOrderRepository();
    await repo.save(buildOrder({ id: 'order-1', userId: 'user-a' }));

    await expect(repo.findById('order-1')).resolves.toMatchObject({ id: 'order-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — `findById` takes 1 arg; calling with 2 is a TS error, and the ownership logic doesn't exist.

- [ ] **Step 3: Widen the `OrderRepository` interface**

Modify `packages/domain/src/types.ts`. Replace the `OrderRepository` interface (~line 147–152):

```typescript
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string, userId?: UserId): Promise<Order | null>;
  findByProviderOrderId(providerId: string, providerOrderId: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus, updates?: Partial<Order>): Promise<void>;
}
```

- [ ] **Step 4: Update the memory repository**

Modify `apps/api/src/support/memory-order-repository.ts`. Replace the `findById` method (lines 10–12):

```typescript
  async findById(id: string, userId?: string): Promise<Order | null> {
    const order = this.orders.get(id) ?? null;

    if (!order) {
      return null;
    }

    if (userId && order.userId && order.userId !== userId) {
      return null;
    }

    return order;
  }
```

- [ ] **Step 5: Update the Drizzle repository**

Modify `packages/infra-db/src/repositories/order-repository.ts`. Two edits.

**Edit A** — `mapOrderToRow` must set `userId`. In the `mapOrderToRow` function, after the `id: order.id,` line, add:

```typescript
    ...(order.userId ? { userId: order.userId } : {}),
```

**Edit B** — `findById` must accept and filter by `userId`. Replace the `findById` method (lines 81–85). (`and` is already imported at the top of the file — used by `findByProviderOrderId`.)

```typescript
  async findById(id: string, userId?: Order['userId']): Promise<Order | null> {
    const [row] = userId
      ? await this.db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).limit(1)
      : await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);

    return row ? mapRowToOrder(row) : null;
  }
```

- [ ] **Step 6: Add unique partial indexes on `users`**

Modify `packages/infra-db/src/schema.ts`. Replace the `users` table definition (lines 3–10):

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  magicPublicKey: text('magic_public_key'),
  evmAddress: text('evm_address'),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  usersMagicPublicKeyIdx: uniqueIndex('users_magic_public_key_idx').on(table.magicPublicKey),
  usersEvmAddressIdx: uniqueIndex('users_evm_address_idx').on(table.evmAddress),
}));
```

> **Note:** these are plain `uniqueIndex`es on nullable columns. In Postgres, multiple NULLs are allowed in a unique index, so multiple users without a `magicPublicKey`/`evmAddress` (pre-auth) won't collide. Phase 1's auth upsert sets exactly one of these and relies on the index to dedupe. `email` is intentionally NOT unique (users may share emails across Magic accounts in edge cases; auth keys on `magicPublicKey`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @pouch/domain typecheck && pnpm --filter @pouch/infra-db typecheck && pnpm --filter api test`
Expected: PASS — memory repo ownership tests green; domain typechecks (interface change ripples to all implementors); infra-db typechecks.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/types.ts packages/infra-db/src/repositories/order-repository.ts packages/infra-db/src/schema.ts apps/api/src/support/memory-order-repository.ts apps/api/src/support/memory-order-repository.test.ts
git commit -m "feat(domain,infra-db): orders carry and filter by userId for ownership"
```

---

## Task 7: API layer — surface trace + ownership in routes/services

**Files:**
- Modify: `apps/api/src/services/agent-chat-service.ts`
- Modify: `apps/api/src/services/order-service.ts`
- Modify: `apps/api/src/routes/orders.ts`
- Modify: `apps/api/src/app.test.ts`

**Why:** The trace must reach the API response (for the Phase 3 frontend), and `/orders/:id` must enforce ownership by reading `userId` from the query (temporary — Phase 1's auth middleware will replace the query param with `ctx.userId`).

- [ ] **Step 1: Update the failing test first (TDD: red)**

Modify `apps/api/src/app.test.ts`. The existing `buildAgentApp` and `buildWebhookApp` constructs and the `DemoProvider`/test providers need `userId` on created orders and `trace` in assertions.

**Edit A** — In the top-level `DemoProvider` class (lines 14–69), the `createOrder` method's returned order needs a `userId`. Add `userId: request.userId,` right after `providerId: this.id,` inside the returned object of `createOrder` (~line 46). The returned object becomes:

```typescript
    return ok({
      id: 'order-demo-1',
      providerOrderId: 'provider-order-1',
      providerId: this.id,
      userId: request.userId,
      product: this.product,
      faceValue: request.amount,
      payment: {
        address: '0xpayment',
        amount: request.amount,
        chainId: 42161,
        token: 'USDC',
      },
      status: 'payment_pending',
      idempotencyKey: request.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
```

**Edit B** — In the first test ("returns a conversational cash-out response from POST /agent/chat", ~lines 202–233), add a `trace` assertion. After the existing `expect(body.reply).toContain('$50.00');` line, add:

```typescript
    expect(Array.isArray(body.trace)).toBe(true);
    expect(body.trace.length).toBeGreaterThan(0);
    expect(body.trace[0]).toMatchObject({ status: 'complete' });
```

**Edit C** — In the test "returns the created order from GET /orders/:id" (~lines 346–371), the request must include the same `userId` that the order was created with. The chat POST already sends `userId: 'demo-user'`. The GET request at line 360 must pass the same `userId` as a query param. Change:

```typescript
    const response = await app.request('/orders/order-demo-1');
```

to:

```typescript
    const response = await app.request('/orders/order-demo-1?userId=demo-user');
```

**Edit D** — In the "returns 404 when GET /orders/:id does not exist" test (~lines 401–410), since the order genuinely doesn't exist, ownership doesn't matter. Leave the request as-is, but to exercise the new path add a userId that mismatches the created order. Replace the test body:

```typescript
  it('returns 404 when GET /orders/:id does not exist or is not owned', async () => {
    const app = buildAgentApp();

    // Create an order owned by demo-user
    await app.request('/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Cash out $50 to Amazon', userId: 'demo-user' }),
    });

    // A different user gets 404 (ownership enforced, not a leak)
    const response = await app.request('/orders/order-demo-1?userId=other-user');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Order not found' });
  });
```

**Edit E** — In the webhook test's seed order (`buildWebhookApp`, ~lines 131–160), add `userId: 'demo-user',` after `providerOrderId: 'provider-order-verified',`. And in the "persists redemption details" test (~lines 373–399), the GET request must pass the matching userId:

```typescript
    const response = await app.request('/orders/invoice-verified?userId=demo-user');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api test`
Expected: FAIL — `body.trace` is undefined; `/orders/:id?userId=` is ignored (route doesn't read it); ownership 404 not enforced.

- [ ] **Step 3: Update `AgentChatService` to depend on the strategy + surface trace**

Modify `apps/api/src/services/agent-chat-service.ts`. Two edits.

**Edit A** — change the import + constructor type. Replace line 2:

```typescript
import type { CashOutExecutor, CashOutIntent, CashOutResult, DomainError, IntentParser, OrderRepository } from '@pouch/domain';
```

with:

```typescript
import type { CashOutExecutor, CashOutIntent, CashOutResult, DomainError, IntentParserStrategy, OrderRepository } from '@pouch/domain';
```

And change the constructor param type (line 27):

```typescript
    private readonly parser: IntentParser,
```

to:

```typescript
    private readonly parser: IntentParserStrategy,
```

**Edit B** — the existing return already spreads `...execution.value` (which now includes `trace`), so the `AgentChatResponse` interface must be widened. Replace the `AgentChatResponse` interface (lines 4–7):

```typescript
export interface AgentChatResponse extends CashOutResult {
  intent: CashOutIntent;
  reply: string;
  trace: CashOutResult['trace'];
}
```

(`CashOutResult` now has `trace`, so the explicit `trace` here is redundant but documents intent for readers. It is structurally identical to omitting it; keep it for clarity.)

- [ ] **Step 4: Update `OrderService` to accept userId**

Modify `apps/api/src/services/order-service.ts`. Read it first if you haven't. Replace the `OrderServiceLike` interface + `getOrder` signature so it accepts an optional `userId`:

```typescript
import type { Order, OrderRepository, UserId } from '@pouch/domain';

export interface OrderServiceLike {
  getOrder(orderId: string, userId?: UserId): Promise<Order | null>;
}

export class OrderService implements OrderServiceLike {
  constructor(private readonly orders: OrderRepository) {}

  async getOrder(orderId: string, userId?: UserId): Promise<Order | null> {
    return this.orders.findById(orderId, userId);
  }
}
```

(If the existing file has extra imports or a different shape, preserve them and only change the interface + method signature as shown.)

- [ ] **Step 5: Update the orders route to read userId from query**

Modify `apps/api/src/routes/orders.ts`. Replace the whole file:

```typescript
import { Hono } from 'hono';

import type { OrderServiceLike } from '../services/order-service';

export function createOrderRoutes(orderService: OrderServiceLike): Hono {
  const router = new Hono();

  router.get('/:id', async (context) => {
    const orderId = context.req.param('id');
    const userId = context.req.query('userId');

    const order = await orderService.getOrder(orderId, userId);

    if (!order) {
      context.status(404);
      return context.json({ error: 'Order not found' });
    }

    return context.json(order);
  });

  return router;
}
```

> **Note:** `userId` from query is the **temporary** mechanism. Phase 1 replaces this with `ctx.get('userId')` from the auth middleware. The route signature stays `getOrder(id, userId)` either way, so Phase 1 only changes where `userId` comes from.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — all 8 (now 9, with the renamed ownership test) API tests green, including `trace` in the chat response and ownership 404.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/agent-chat-service.ts apps/api/src/services/order-service.ts apps/api/src/routes/orders.ts apps/api/src/app.test.ts
git commit -m "feat(api): surface agent trace and enforce /orders ownership by userId"
```

---

## Task 8: Bootstrap wiring + demo service consistency

**Files:**
- Modify: `apps/api/src/bootstrap/create-demo-agent-service.ts`
- Modify: `apps/api/src/bootstrap/create-runtime-app-services.ts` (only if a type error appears — the `new IntentParser()` still works as `IntentParserStrategy`)
- Verify: `apps/api/src/bootstrap/create-runtime-app-services.test.ts`

**Why:** After Tasks 2–7, the bootstrap constructors must still typecheck. The runtime bootstrap passes `new IntentParser()` which is a valid `IntentParserStrategy`, so no logic change is expected — but verify. The demo provider in `create-demo-agent-service.ts` must set `userId` on created orders (it has its own `DemoProvider` class separate from the test's).

- [ ] **Step 1: Update the demo provider to set userId**

Modify `apps/api/src/bootstrap/create-demo-agent-service.ts`. In the `DemoProvider.createOrder` method (~lines 39–66), add `userId: request.userId,` right after `providerId: this.id,` in the returned object:

```typescript
    return ok({
      id: `demo-order-${request.idempotencyKey}`,
      providerOrderId: `provider-${request.idempotencyKey}`,
      providerId: this.id,
      userId: request.userId,
      product: { ... },
      ...
```

- [ ] **Step 2: Run the full verification gate**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: ALL GREEN.
- `typecheck` passes across all packages (the interface changes have rippled cleanly).
- `test` — all existing tests pass plus the new trace/ownership/config tests.
- `build` — all packages compile.

If `create-runtime-app-services.ts` shows a type error on `new IntentParser()` where `IntentParserStrategy` is now expected, it's because `AgentChatService` now wants the strategy interface — but `IntentParser implements IntentParserStrategy` (Task 3), so it should pass. If it does error, the fix is purely the import: ensure `IntentParser` is still imported (it is, line 1).

- [ ] **Step 3: Run the runtime-app-services test specifically**

Run: `pnpm --filter api test -- --run create-runtime-app-services`
Expected: PASS — the 3 bootstrap tests (demo fallback, production fail-fast, configured wiring) still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bootstrap/create-demo-agent-service.ts
git commit -m "chore(api): demo provider sets userId for ownership consistency"
```

---

## Task 9: Update HANDOFF.md to reflect Phase 0 completion

**Files:**
- Modify: `docs/HANDOFF.md`

**Why:** The next session must know Phase 0 is done and where to start (Phase 1 spike).

- [ ] **Step 1: Update the "What needs to be built" section**

Modify `docs/HANDOFF.md`. In the "What needs to be built (next phases)" section, mark Phase 0 deliverables done. Add a "Phase 0 — DONE" subsection at the top of that section (above "Phase 1"):

```markdown
### Phase 0 — Domain foundation (DONE)
- ✅ `TraceStep` + `TraceRecorder` in domain; `CashOutExecutor` emits trace; surfaced via `AgentChatResponse.trace`
- ✅ `IntentParserStrategy` interface (LLM parser injectable in Phase 2)
- ✅ Gap F fixed: `BitrefillAdapter.verifyWebhook(payload, headers)`
- ✅ Ownership plumbing: orders carry `userId`; repos + `/orders/:id` filter by it (query param for now; auth middleware in Phase 1)
- ✅ `LLM_PROVIDER`/`GEMINI_API_KEY`/`LLM_MODEL` in Zod config
- ✅ `users` unique partial indexes on `magic_public_key` + `evm_address`
```

And update the "First message to send to the agent" resume block to point at Phase 1:

```markdown
### ▶️ How to resume the next session

### First message to send to the agent:
\`\`\`
Continúa el proyecto Pouch. Lee docs/HANDOFF.md y
docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md,
luego escribe el plan detallado de Phase 1 (web3 spike + real Particle UA + auth)
con writing-plans.
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: mark Phase 0 complete, point next session at Phase 1"
```

---

## Self-review notes (run after writing, before execution)

**Spec coverage check (spec §9 agent trace):**
- `TraceStep` interface with `id/label/status/durationMs/badge/detail` — ✅ Task 1 (matches spec §9 shape verbatim).
- Executor emits structured trace steps — ✅ Task 2 (`start`/`complete`/`fail` at each phase).
- `AgentChatResponse` includes `trace: TraceStep[]` — ✅ Task 7.
- Frontend renders trace — **deferred to Phase 3** (the frontend doesn't exist yet; this is the documented split in the roadmap).

**Spec coverage check (spec §7 LLM layer):**
- `IntentParserStrategy` interface — ✅ Task 3 (the seam; Phase 2 implements `LlmIntentParser`).
- `LLM_*` config keys — ✅ Task 5.
- Gemini provider + function calling — **Phase 2** (documented; not in scope here).

**Spec coverage check (Gap F bug):** ✅ Task 4.

**Spec coverage check (Gap C ownership):** ✅ Tasks 6–7 (data plumbing + route; full auth in Phase 1).

**Spec coverage check (Gap D migrations):** Schema change in Task 6 (`users` indexes) means Phase 1 must run `pnpm db:generate` + `db:migrate` (or `db:migrate` = `drizzle-kit push`). Noted in the roadmap; not executed here because no DB is needed for these unit/integration tests.

**Placeholder scan:** none — every code step contains complete, runnable code.

**Type consistency check:**
- `TraceStep` is defined once (trace.ts), imported into types.ts, used in `CashOutResult.trace` and `AgentChatResponse.trace`. ✅
- `IntentParserStrategy.parse` returns `Result<CashOutIntent, DomainError>` — matches `IntentParser.parse`. ✅
- `OrderRepository.findById(id, userId?)` — matches memory + Drizzle + `OrderService.getOrder(id, userId?)` + route call. ✅
- `verifyWebhook(payload, headers)` — matches interface (2-arg), adapter (2-arg with default), route call (2-arg), test call (2-arg). ✅
- `Order.userId` / `OrderRequest.userId` — set by executor, read by repos, set by demo + test providers. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-pouch-phase0-domain-foundation.md`.
Master roadmap saved to `docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
