# Audit CRITICAL Fixes (C1–C6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 6 CRITICAL security findings from `docs/audit/2026-07-25-security-audit.md` before the Jul 30 deadline, on a dedicated branch, without breaking the demo flow (which runs as `userId='demo-user'`).

**Architecture:** Each CRITICAL is an independent commit. Fixes are scoped so the demo continues to work: the demo path is gated by `isDemo(userId)` (already a pattern in `create-runtime-app-services.ts:137,162`), not by destination address or `DEMO_MODE` alone. All identity is derived from `context.get('userId')` set by the JWT middleware, never from request bodies/queries.

**Tech Stack:** TypeScript, Hono (HTTP), jose (JWT), zod (config), ethers v6 (web3), vitest (tests), pnpm + turbo (monorepo).

**Scope rule (from user):** Only the code. The presentation/video is out of scope. Apply all 6 CRÍTICOS as specified; do not preserve demo-only behaviors that the audit flags as unsafe.

**Pre-flight (one-time, before Task 1):**
- [ ] Branch from `main`: `git switch -c audit-fixes`
- [ ] Confirm clean baseline: `pnpm install && pnpm typecheck && pnpm test`
- [ ] If baseline is red, stop and report — do not fix unrelated pre-existing failures here.

**Per-fix workflow (every task):**
1. Write the failing/regression test first.
2. Verify it fails for the right reason.
3. Implement the fix.
4. Verify the test passes + run affected package tests + `pnpm typecheck`.
5. Commit with `fix(security): Cn — <summary>`.
6. Update the Status cell in `docs/audit/FOLLOW-UP-ACTION-PLAN.md` to `[x]`.

---

## File map

| Fix | Create | Modify | Test |
|-----|--------|--------|------|
| C1 | — | `packages/infra-offramp/src/bitrefill/adapter.ts` (verifyWebhook), `apps/api/src/routes/webhooks/bitrefill.ts` (enforce) | `packages/infra-offramp/src/bitrefill/adapter.test.ts` (new) |
| C2 | — | `apps/api/src/app.ts` (compute `allowDemoFallback` with production guard) | `apps/api/src/app.test.ts` |
| C3 | — | `apps/api/src/app.ts` (gate `/auth/demo` mount on `!isProduction`) | `apps/api/src/app.test.ts` |
| C4 | — | `apps/api/src/routes/agent.ts`, `apps/api/src/routes/balance.ts`, `apps/api/src/routes/orders.ts` | new `apps/api/src/routes/*.test.ts` |
| C5 | — | `packages/infra-web3/src/private-key/private-key-provider.ts` (remove KNOWN_ADDRESSES both spots, fail-fast catch, strict resolveSender), `apps/api/src/services/agent-chat-service.ts` (remove KNOWN_WALLETS map) | `packages/infra-web3/src/private-key/private-key-provider.test.ts` (extend or new) |
| C6 | — | `apps/api/src/services/agent-chat-service.ts` (gate 3 demo-fallback branches on `isDemo(userId)`) | `apps/api/src/services/agent-chat-service.test.ts` (new) |

---

## Task 1: C1 — Bitrefill webhook HMAC verification

**Files:**
- Modify: `packages/infra-offramp/src/bitrefill/adapter.ts:154-183` (`verifyWebhook`)
- Modify: `apps/api/src/routes/webhooks/bitrefill.ts:8-33` (route)
- Test: `packages/infra-offramp/src/bitrefill/adapter.test.ts` (new)

**Context:** `verifyWebhook` currently names its param `_headers` and ignores it. The route is in the auth skip-list (`auth.ts:28`). `WEBHOOK_SECRET` is declared in `shared/config.ts:63` but unused. Bitrefill signs webhooks with HMAC-SHA256 over the raw request body, sent in a `X-Webhook-Signature` header (lowercase header name after Node normalization). We must verify with `crypto.timingSafeEqual` on equal-length digests and reject 401 (not 400) when missing/mismatched.

**Verified facts about this codebase (do not re-check, just use):**
- Adapter constructor is `new BitrefillAdapter(client, mapper, options)` where `options: BitrefillAdapterOptions` (defined at `adapter.ts:32-40`).
- `BitrefillAdapterOptions` has: `includeTestProducts?`, `paymentMethod`, `webhookUrl?`, `refundAddress?`, `receiptEmail?`, `sendEmail?`, `senderName?` — no `apiKey`/`baseUrl`/`webhookSecret`.
- The adapter is constructed at `packages/infra-offramp/src/index.ts:28` inside `buildOffRampProviders(config)` — that is where `config.WEBHOOK_SECRET` must be wired in.
- An existing test file `packages/infra-offramp/__tests__/bitrefill-adapter.test.ts` already calls `adapter.verifyWebhook(...)` at line 274 — extend it, do not create a duplicate.
- `OffRampProvider.verifyWebhook` interface lives at `packages/domain/src/types.ts:125` with signature `(payload: unknown, headers: Record<string, string>)`. Changing it affects: this adapter, the demo provider stub in `create-runtime-app-services.ts:125`, and `BitrefillWebhookService.handle` (`bitrefill-webhook-service.ts:20`).
- The only other `verifyWebhook` callers are `bitrefill-webhook-service.ts:20` and the existing test — both pass a parsed object today and must switch to the raw body string.

- [ ] **Step 1.1: Write the failing tests**

Extend the existing `packages/infra-offramp/__tests__/bitrefill-adapter.test.ts`. Add a new `describe` block (do not modify the existing test at line 274 yet — update it in Step 1.5 after the signature changes):

```ts
import { createHmac } from 'node:crypto';
// (existing imports stay)

const SECRET = 'x'.repeat(32);

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('BitrefillAdapter.verifyWebhook signature (C1)', () => {
  function build() {
    // Mirror the inline pattern already used throughout this test file:
    //   const adapter = new BitrefillAdapter(client, new BitrefillMapper(), { ... });
    // Build a minimal client stub with getInvoice/getOrder that return enough
    // for the re-fetch path, and add webhookSecret: SECRET to the options.
    const client = {
      getInvoice: async () => ({ data: { id: 'inv_123', orders: [] } }),
      getOrder: async () => ({ data: { id: 'o1' } }),
    } as never;
    return new BitrefillAdapter(client, new BitrefillMapper(), {
      paymentMethod: 'bitcoin',
      webhookSecret: SECRET,
    });
  }

  const PAYLOAD = JSON.stringify({ data: { id: 'inv_123' } });

  it('rejects when signature header is missing', async () => {
    const adapter = build();
    const result = await adapter.verifyWebhook(PAYLOAD, {});
    expect(result.ok).toBe(false);
  });

  it('rejects when signature does not match', async () => {
    const adapter = build();
    const result = await adapter.verifyWebhook(PAYLOAD, { 'x-webhook-signature': 'deadbeef' });
    expect(result.ok).toBe(false);
  });

  it('accepts when signature matches the body', async () => {
    const adapter = build();
    const result = await adapter.verifyWebhook(PAYLOAD, { 'x-webhook-signature': sign(PAYLOAD, SECRET) });
    expect(result.ok).toBe(true);
  });

  it('accepts case-insensitive header lookup', async () => {
    const adapter = build();
    const result = await adapter.verifyWebhook(PAYLOAD, { 'X-Webhook-Signature': sign(PAYLOAD, SECRET) });
    expect(result.ok).toBe(true);
  });
});
```

(Import `BitrefillMapper` from `'./mapper'` at the top of the test file if not already imported.)

  it('rejects when signature header is missing', async () => {
    const adapter = build();
    const result = await adapter.verifyWebhook(PAYLOAD, {});
    expect(result.ok).toBe(false);
  });

  it('rejects when signature does not match', async () => {
    const adapter = build();
    const result = await adapter.verifyWebhook(PAYLOAD, { 'x-webhook-signature': 'deadbeef' });
    expect(result.ok).toBe(false);
  });

  it('accepts when signature matches the body', async () => {
    const adapter = build();
    const sig = sign(PAYLOAD, SECRET);
    const result = await adapter.verifyWebhook(PAYLOAD, { 'x-webhook-signature': sig });
    expect(result.ok).toBe(true);
  });

  it('accepts case-insensitive header lookup', async () => {
    const adapter = build();
    const sig = sign(PAYLOAD, SECRET);
    const result = await adapter.verifyWebhook(PAYLOAD, { 'X-Webhook-Signature': sig });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `pnpm --filter @pouch/infra-offramp test`
Expected: the new tests fail to compile (the adapter options don't accept `webhookSecret` yet, and the constructor signature is `(client, mapper, options)`, not `(client, options)`). The "accepts when signature matches" test also fails functionally once it compiles. This is the correct failure.

- [ ] **Step 1.3: Add `webhookSecret` to `BitrefillAdapterOptions`**

In `packages/infra-offramp/src/bitrefill/adapter.ts`, add the field to the existing options interface (it is at lines 32-40):

```ts
export interface BitrefillAdapterOptions {
  includeTestProducts?: boolean;
  paymentMethod: string;
  webhookUrl?: string;
  refundAddress?: string;
  receiptEmail?: string;
  sendEmail?: boolean;
  senderName?: string;
  webhookSecret: string; // NEW — required, used to verify incoming webhooks
}
```

Then wire it in at `packages/infra-offramp/src/index.ts:28` inside `buildOffRampProviders`. Read that function to see how `config` is used and add `webhookSecret: config.WEBHOOK_SECRET` to the options object passed to `new BitrefillAdapter(...)`. The `config` here is the validated `Config` from `@pouch/shared`, which already has `WEBHOOK_SECRET: z.string().min(32)` (`shared/config.ts:63`).

Update any other constructor call sites found by `grep -rn "new BitrefillAdapter" packages/ apps/` to pass `webhookSecret`. Any test helpers that build an adapter must pass a fixture secret.

- [ ] **Step 1.4: Implement HMAC verification in `verifyWebhook`**

Replace `verifyWebhook` so it (a) computes HMAC over the **raw body string**, (b) compares with `timingSafeEqual`, (c) only proceeds to re-fetch if valid.

Change the signature so the first arg is the raw body (string), since HMAC must be over exact bytes — not a parsed object. Update the route (Step 1.5) to pass the raw string.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

async verifyWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<Result<WebhookEvent, DomainError>> {
  // Signature gate.
  const provided = this.readHeader(headers, 'x-webhook-signature');
  if (!provided) {
    return err({ type: 'UNKNOWN', message: 'Missing webhook signature.' });
  }
  const expected = createHmac('sha256', this.options.webhookSecret).update(rawBody).digest('hex');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return err({ type: 'UNKNOWN', message: 'Invalid webhook signature.' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return err({ type: 'UNKNOWN', message: 'Bitrefill webhook body is not valid JSON.' });
  }

  const invoice = payload && typeof payload === 'object' && 'data' in (payload as object)
    ? (payload as { data: unknown }).data
    : payload;

  if (!invoice || typeof invoice !== 'object' || !('id' in invoice) || typeof (invoice as { id: unknown }).id !== 'string') {
    return err({ type: 'UNKNOWN', message: 'Bitrefill webhook payload is missing an invoice id.' });
  }

  try {
    const canonicalInvoice = await this.client.getInvoice((invoice as { id: string }).id);
    const canonicalOrderId = canonicalInvoice.data.orders?.[0]?.id;
    const canonicalOrder = canonicalOrderId ? await this.client.getOrder(canonicalOrderId) : null;
    return ok(this.mapper.toWebhookEvent(canonicalInvoice.data, canonicalOrder?.data));
  } catch (error) {
    return err({
      type: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'Bitrefill webhook verification failed.',
    });
  }
}

private readHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === lower);
  return hit?.[1];
}
```

Note: the public `OffRampProvider.verifyWebhook` interface (in `@pouch/domain`) currently types the first param as `unknown`/`payload`. Update that interface to `(rawBody: string, headers: Record<string, string>)` and fix any other implementor (the demo provider in `create-runtime-app-services.ts:125` throws "does not implement webhooks" — update its stub signature to match, body stays `throw new Error(...)`).

- [ ] **Step 1.5: Pass the raw body from the route**

In `apps/api/src/routes/webhooks/bitrefill.ts`, replace the JSON parse with reading the raw text:

```ts
router.post('/', async (context) => {
  const rawBody = await context.req.text();
  const headers: Record<string, string> = {};
  context.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const result = await service.handle(rawBody, headers);

  if (!result.ok) {
    context.status(401); // was 400 — signature failures are Unauthorized
    return context.json({ error: 'Invalid Bitrefill webhook.', type: result.error.type });
  }
  return context.json(result.value, 200);
});
```

Then update `BitrefillWebhookService.handle` in `apps/api/src/services/bitrefill-webhook-service.ts:20` to forward the raw string instead of the parsed object:

```ts
async handle(rawBody: string, headers: Record<string, string>): Promise<Result<BitrefillWebhookResponse, DomainError>> {
  const event = await this.provider.verifyWebhook(rawBody, headers);
  // ... rest unchanged ...
}
```

Finally, update the existing test at `packages/infra-offramp/__tests__/bitrefill-adapter.test.ts:274` so it passes a raw JSON string (signed with the same secret) plus valid headers instead of the old `(object, {})` call. If that test was asserting the "happy path without signature", it now becomes a signature-rejection test or it must include a valid signature.

- [ ] **Step 1.6: Run the full affected test suite**

Run: `pnpm --filter @pouch/infra-offramp test && pnpm --filter @pouch/api test && pnpm typecheck`
Expected: all green. The `buildOffRampProviders` test (if any) and the existing adapter test must both pass with the new signature.

- [ ] **Step 1.7: Commit**

```bash
git add -A
git commit -m "fix(security): C1 — verify Bitrefill webhook HMAC signature

verifyWebhook now requires a raw body + headers, computes HMAC-SHA256
with WEBHOOK_SECRET, and uses timingSafeEqual before re-fetching the
invoice. Route passes raw body and returns 401 on signature failure.
Demo provider stub updated to match the new interface."
```

- [ ] **Step 1.8: Mark C1 done in `docs/audit/FOLLOW-UP-ACTION-PLAN.md`** (set the Status cell to `[x]`).

---

## Task 2: C2 — Never enable demo auth fallback in production

**Files:**
- Modify: `apps/api/src/app.ts:67-86` (compute `allowDemoFallback`)
- Test: `apps/api/src/app.test.ts`

**Context:** `allowDemoFallback: isDemo` makes any boot-error fallback open the whole API. The fix: in production, `allowDemoFallback` is **always false**, regardless of `mode`. This means if prod boot falls back to demo runtime, requests get 401 instead of being silently authenticated as `demo-user` — fail-closed.

- [ ] **Step 2.1: Add a regression test**

In `apps/api/src/app.test.ts`, add a test (mirror the existing test style) that builds the app with `NODE_ENV='production'` and asserts a cookieless request to `/balance` returns 401 even when the runtime is in demo mode. Since `createApp` reads `process.env` directly, the test must stub `process.env.NODE_ENV` and restore it in `afterEach`/`finally`.

```ts
import { afterEach, beforeEach } from 'vitest';

describe('app demo fallback (C2)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDemoMode = process.env.DEMO_MODE;
  const originalJwt = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DEMO_MODE = originalDemoMode;
    process.env.JWT_SECRET = originalJwt;
  });

  it('returns 401 in production even when DEMO_MODE=true forces demo runtime', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'true';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const app = createApp();

    const res = await app.request('/balance');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2.2: Run to verify failure**

Run: `pnpm --filter @pouch/api test`
Expected: the new test fails (currently returns 200 because `allowDemoFallback: isDemo` is true when runtime is demo).

- [ ] **Step 2.3: Gate `allowDemoFallback` on non-production**

In `apps/api/src/app.ts`, change line ~85:

```ts
app.use('*', createAuthMiddleware({
  jwtSecret: effectiveSecret,
  publicPaths: new Set(['/', '/health']),
  allowDemoFallback: isDemo && !isProduction, // C2: never in production
}));
```

- [ ] **Step 2.4: Verify test passes + full suite**

Run: `pnpm --filter @pouch/api test && pnpm typecheck`
Expected: green. Check that existing demo-mode tests (which set `NODE_ENV='development'` or unset it) still pass.

- [ ] **Step 2.5: Commit**

```bash
git add -A
git commit -m "fix(security): C2 — disable demo auth fallback in production

allowDemoFallback is now gated on !isProduction. Even if a boot error
drops the runtime into demo mode in prod, requests are 401 instead of
being silently authenticated as demo-user."
```

- [ ] **Step 2.6: Mark C2 done in the action plan.**

---

## Task 3: C3 — Only mount `/auth/demo` outside production

**Files:**
- Modify: `apps/api/src/app.ts:139-156`
- Test: `apps/api/src/app.test.ts`

**Context:** `/auth/demo` issues a real 24h JWT unconditionally. Gate the mount on `!isProduction` so prod can never mint demo tokens.

- [ ] **Step 3.1: Add a regression test**

```ts
describe('app /auth/demo mount (C3)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwt = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwt;
  });

  it('does not mount /auth/demo in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const app = createApp();

    const res = await app.request('/auth/demo', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('mounts /auth/demo in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'a'.repeat(32);
    const app = createApp();

    const res = await app.request('/auth/demo', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3.2: Run to verify failure**

Run: `pnpm --filter @pouch/api test`
Expected: the production case fails (currently 200).

- [ ] **Step 3.3: Gate the route mount**

In `apps/api/src/app.ts`, wrap the `app.post('/auth/demo', ...)` block:

```ts
if (!isProduction) {
  app.post('/auth/demo', async (context) => {
    // ... existing body unchanged ...
  });
}
```

- [ ] **Step 3.4: Verify + commit**

Run: `pnpm --filter @pouch/api test && pnpm typecheck`
Expected: green.

```bash
git add -A
git commit -m "fix(security): C3 — mount /auth/demo only outside production

Prod can no longer mint demo-user JWTs. Development/demo deployments
keep the route for judge access."
```

- [ ] **Step 3.5: Mark C3 done.**

---

## Task 4: C4 — Derive identity from auth context, not request body/query

**Files:**
- Modify: `apps/api/src/routes/agent.ts:31` (drop `userId` from body)
- Modify: `apps/api/src/routes/balance.ts:13-14` (drop `?userId=`)
- Modify: `apps/api/src/routes/orders.ts:12` (drop `?userId=`)
- Test: new `apps/api/src/routes/agent.test.ts`, extend balance/orders tests if present

**Context:** All three routes ignore the authenticated principal from `context.get('userId')`. The fix: identity always comes from the JWT middleware. `userId` falls back to `'demo-user'` only when the middleware explicitly set it (i.e., demo mode) — never from the body. For `/orders/:id`, tenancy must be enforced: pass the authenticated `userId` and the repo must scope by it.

- [ ] **Step 4.1: Write failing tests for the IDOR vectors**

Create `apps/api/src/routes/agent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AgentChatServiceLike } from '../services/agent-chat-service';

function buildApp(captured: { userId?: string } = {}): Hono {
  const fakeService: AgentChatServiceLike = {
    async handleMessage(message, userId) {
      captured.userId = userId;
      return { ok: true, value: { reply: `echo:${message}`, intent: { action: 'chat' }, trace: [], phase: 'reply', llmReply: false } } as never;
    },
  };
  const { createAgentRoutes } = await import('./agent');
  return createAgentRoutes(fakeService);
}

describe('POST /agent/chat identity (C4)', () => {
  it('uses userId from the auth context, ignoring body.userId', async () => {
    const captured: { userId?: string } = {};
    const app = buildApp(captured);
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi', userId: 'victim-user' }),
    });
    // The route is mounted under createApp with the middleware; here we simulate
    // the middleware having set userId by passing it through a parent Hono app:
    expect(res.status).toBe(200);
    expect(captured.userId).not.toBe('victim-user');
  });
});
```

Since the route reads `context.get('userId')`, the test must wrap the router in a parent Hono app that sets `ctx.set('userId', 'real-user')` via a tiny middleware. Adjust the test to do that:

```ts
function buildAppWithUser(userId: string | undefined, captured: { userId?: string }) {
  const fakeService: AgentChatServiceLike = {
    async handleMessage(_m, uid) { captured.userId = uid; return { ok: true, value: { reply: 'ok', intent: { action: 'chat' }, trace: [], phase: 'reply', llmReply: false } } as never; },
  };
  const parent = new Hono();
  if (userId !== undefined) parent.use('*', async (c, next) => { c.set('userId', userId); await next(); });
  parent.route('/agent', createAgentRoutes(fakeService));
  return parent;
}

it('uses authenticated userId, ignores body.userId', async () => {
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

it('falls back to demo-user when no authenticated principal (demo mode)', async () => {
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
```

Add analogous tests for `/balance` and `/orders/:id` (assert `?userId=victim` is ignored, authenticated id wins).

- [ ] **Step 4.2: Run to verify failures**

Run: `pnpm --filter @pouch/api test`
Expected: the IDOR tests fail because today `body.userId` / `?userId` override.

- [ ] **Step 4.3: Fix `/agent/chat`**

In `apps/api/src/routes/agent.ts`, replace line 31:

```ts
// Identity from the JWT middleware (set to 'demo-user' in demo mode). Body is never trusted.
const userId = context.get('userId') ?? 'demo-user';
```

Also tighten the body type so `userId` is rejected at the validation layer (optional but recommended):

```ts
const payload = body as { message?: unknown };
```
And drop the `userId?: unknown` field. If clients send it, it is simply ignored.

- [ ] **Step 4.4: Fix `/balance`**

In `apps/api/src/routes/balance.ts`, replace lines 12-14:

```ts
const evmAddress = context.get('evmAddress');
const userId = evmAddress ?? context.get('userId') ?? 'demo-user';
// ?userId= is intentionally ignored — identity comes from the auth context only.
```

- [ ] **Step 4.5: Fix `/orders/:id`**

In `apps/api/src/routes/orders.ts`, replace line 12:

```ts
const userId = context.get('userId');
if (!userId) {
  context.status(401);
  return context.json({ error: 'Unauthorized' });
}
const order = await orderService.getOrder(orderId, userId);
```

This makes tenancy mandatory: if the repo's `findById(id, userId)` returns null for a mismatched owner, the route 404s. (M8 in the action plan will harden the repo layer further; for now the route-level guard closes the IDOR.)

- [ ] **Step 4.6: Verify + commit**

Run: `pnpm --filter @pouch/api test && pnpm typecheck`
Expected: green.

```bash
git add -A
git commit -m "fix(security): C4 — derive identity from auth context (close IDOR)

/agent/chat, /balance, /orders/:id no longer trust userId from the
body or query. Identity comes from the JWT middleware. /orders/:id
requires an authenticated userId and enforces tenancy at the route."
```

- [ ] **Step 4.7: Mark C4 done.**

---

## Task 5: C5 — Remove hardcoded wallet-address bypass + fail-fast on bad seed

**Files:**
- Modify: `packages/infra-web3/src/private-key/private-key-provider.ts:333-342, 422-426, 586-601, 202-204` (remove bypass, strict resolveSender, fail-fast catch)
- Modify: `apps/api/src/services/agent-chat-service.ts:558-565` (remove `KNOWN_WALLETS` map)
- Test: `packages/infra-web3/src/private-key/private-key-provider.test.ts`

**Context (verified against the real `.env`):** `SEED_PHRASE_1` and `SEED_PHRASE_2` are present; `SEED_PHRASE_3` is absent. The hardcoded addresses `0x4c7e.../0x4DC6...` do **not** derive from any seed in the env — they were an escape hatch (commits `9ded248`, `28c983d`). Removing them makes the `SECURITY_BLOCKED` whitelist gate fire correctly for those addresses. The two seed-derived wallets and the `PRIVATE_KEY`/`SECOND_PRIVATE_KEY` wallets remain valid send targets. Demo sends between derived wallets keep working.

**Decision (from user):** Remove bypass AND make the silent `catch {}` on seed derivation fail-fast in non-demo/prod.

- [ ] **Step 5.1: Write failing tests**

Create/extend `packages/infra-web3/src/private-key/private-key-provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PrivateKeyAccountProvider } from './private-key-provider';

const VICTIM_ADDR = '0x4c7eB03cb8c77A27a55c691D74Ee27C1A57bd619'; // previously bypassed

describe('PrivateKeyAccountProvider security (C5)', () => {
  it('blocks sendPayment to a non-derived address', async () => {
    const config = {
      PRIVATE_KEY: '0x' + '11'.repeat(32),
      SETTLEMENT_CHAIN_ID: 42161,
      SUPPORTED_CHAINS: [42161],
    } as never;
    const provider = new PrivateKeyAccountProvider(config);
    const result = await provider.sendPayment({
      from: 'any-user',
      to: VICTIM_ADDR,
      amount: { value: 1, currency: 'USD' },
      chainId: 42161,
      token: 'ARB',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('SECURITY_BLOCKED');
  });

  it('throws on an invalid seed phrase in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const config = {
        SEED_PHRASE_1: 'not a valid mnemonic at all',
        SETTLEMENT_CHAIN_ID: 42161,
        SUPPORTED_CHAINS: [42161],
      } as never;
      expect(() => new PrivateKeyAccountProvider(config)).toThrow();
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('resolveSender returns undefined when no wallet matches', () => {
    const config = {
      PRIVATE_KEY: '0x' + '22'.repeat(32),
      SETTLEMENT_CHAIN_ID: 42161,
      SUPPORTED_CHAINS: [42161],
    } as never;
    const provider = new PrivateKeyAccountProvider(config);
    // resolveSender is private — exercise it via sendPayment with a derived
    // address but a non-matching userId so we observe the SECURITY_BLOCKED path.
    // (This documents the contract: unknown userId → no wallet → blocked.)
    expect((provider as unknown as { resolveSender: (u: string) => unknown }).resolveSender('nobody')).toBeUndefined();
  });
});
```

- [ ] **Step 5.2: Run to verify failure**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: the "blocks sendPayment" test fails today (the bypass lets it through); the "throws on invalid seed" test fails (catch swallows); the resolveSender test fails (returns first wallet).

- [ ] **Step 5.3: Remove `KNOWN_WALLET_ADDRESSES` from the balance path**

In `private-key-provider.ts:338-375`, delete the entire `KNOWN_WALLET_ADDRESSES` block and the loop that checks ARB on those addresses. Keep the rest of `getUnifiedBalance` intact. The hardcoded fake Wallet 3/4 `knownAssets` (lines 333-336, 377-385) are L2 in the audit — leave them for now (out of C5 scope) unless removing them is trivial; the plan keeps C5 narrowly scoped to the bypass.

- [ ] **Step 5.4: Remove `KNOWN_ADDRESSES` from `sendPayment`**

In `private-key-provider.ts:417-435`, replace the whole block with:

```ts
// ── Security gate: only allow transfers to imported wallets ──
const toWallet = this.wallets.find(
  (w) => w.address.toLowerCase() === to.toLowerCase(),
);
if (!toWallet) {
  return err({
    type: 'SECURITY_BLOCKED',
    check: 'wallet-whitelist',
    detail: `Address ${to.slice(0, 10)}... is not an imported wallet. Transfers are only allowed between your own wallets.`,
    riskScore: 100,
  });
}
const toLabel = toWallet.label;
```

This deletes the `KNOWN_ADDRESSES` map, the `knownToWallet` fallback, and the `?? knownToWallet` in `toLabel`. **Then** search the rest of `sendPayment` for residual references to `knownToWallet` — there is a `console.log` around line 511 that interpolates `toWallet?.label ?? knownToWallet ?? to.slice(0,10)`. Simplify that to `toWallet.label` (it is now guaranteed non-null past the guard).
  });
}
```

Delete the `KNOWN_ADDRESSES` map and the `knownToWallet` fallback entirely.

- [ ] **Step 5.5: Make `resolveSender` strict**

In `private-key-provider.ts:586-601`, remove the "first wallet with a private key" fallback:

```ts
private resolveSender(userId: string): WalletConfig | undefined {
  const byAddress = this.wallets.find((w) => w.address.toLowerCase() === userId.toLowerCase());
  if (byAddress) return byAddress;
  const byLabel = this.wallets.find((w) => w.label.toLowerCase() === userId.toLowerCase());
  return byLabel; // undefined if no match — caller's SECURITY_BLOCKED branch fires
}
```

Audit the caller of `resolveSender` in `sendPayment` to confirm the `!fromWallet` SECURITY_BLOCKED branch exists and handles `undefined`. If the caller currently does `resolveSender(...)!` (non-null assertion), change it to a guarded branch that returns a SECURITY_BLOCKED error.

- [ ] **Step 5.6: Make seed-derivation failure fail-fast in production**

In `private-key-provider.ts:191-206`, replace the silent catch:

```ts
for (let i = 1; i <= 3; i++) {
  const seed = raw[`SEED_PHRASE_${i}`]?.trim();
  if (!seed) continue;
  try {
    const { address, privateKey } = deriveFromSeed(seed);
    this.wallets.push({ label: `Wallet ${this.wallets.length + 1}`, address, privateKey });
  } catch (error) {
    if (this.isProduction) {
      throw new Error(
        `SEED_PHRASE_${i} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Non-production: log and skip (keeps local dev resilient).
    console.warn(`⚠️ SEED_PHRASE_${i} invalid — skipping. Set NODE_ENV=production to fail-fast.`);
  }
}
```

Add an `isProduction` field set in the constructor from `config.NODE_ENV === 'production'` (the config already passes `NODE_ENV` through in `create-runtime-app-services.ts:228`).

- [ ] **Step 5.7: Remove `KNOWN_WALLETS` map in agent-chat-service**

In `apps/api/src/services/agent-chat-service.ts:558-565`, delete the `KNOWN_WALLETS` map and the two fallback lines (`if (!toAddress) toAddress = ...`). If `toAddress`/`fromAddress` end up empty, that is the intended behavior — the provider's whitelist gate handles it and the send returns SECURITY_BLOCKED (which C6 will then propagate correctly instead of faking a receipt).

- [ ] **Step 5.8: Verify + commit**

Run: `pnpm --filter @pouch/infra-web3 test && pnpm --filter @pouch/api test && pnpm typecheck`
Expected: green. Note: if the existing `agent-chat-service` tests asserted the KNOWN_WALLETS fallback, update them to assert SECURITY_BLOCKED instead.

```bash
git add -A
git commit -m "fix(security): C5 — remove hardcoded wallet bypass + fail-fast seeds

Drops KNOWN_ADDRESSES / KNOWN_WALLETS / KNOWN_WALLET_ADDRESSES so the
SECURITY_BLOCKED whitelist gate is authoritative. resolveSender no
longer falls back to 'first wallet with a key'. Invalid SEED_PHRASE_*
now throws in production (was silently swallowed). Demo sends between
derived wallets still work."
```

- [ ] **Step 5.9: Mark C5 done.**

---

## Task 6: C6 — Gate fake-receipt fallback on `isDemo(userId)`

**Files:**
- Modify: `apps/api/src/services/agent-chat-service.ts:576-617` (send), `:800-839` (swap), `:1006-1020+` (fund-gas)
- Test: `apps/api/src/services/agent-chat-service.test.ts` (new)

**Context:** Three demo-fallback branches fabricate a "delivered" receipt on **any** real failure, for any user. The fix: only fabricate when the caller is the demo user. Reuse the existing `isDemo` predicate shape (`userId === 'demo-user' || userId === '0xdemo'`). On real failure for a real user, propagate the error.

- [ ] **Step 6.1: Write failing tests**

Create `apps/api/src/services/agent-chat-service.test.ts`. Build the service with a fake executor/provider that returns an error, then assert:
- For `userId='demo-user'`: response is the mock receipt (`status: 'delivered'`).
- For `userId='real-user'`: response is the propagated error.

```ts
import { describe, expect, it } from 'vitest';
// Build the AgentChatService with fakes that force the send path to fail.
// (Use the same constructor shape as create-runtime-app-services.ts.)

describe('AgentChatService fake-receipt gate (C6)', () => {
  it('fabricates a delivered receipt for demo-user on send failure', async () => {
    // ... construct service with a sendPayment that returns err(UNKNOWN) ...
    const result = await service.handleMessage('send 1 ARB to Wallet 2', 'demo-user');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('delivered');
  });

  it('propagates the error for a real user on send failure', async () => {
    const result = await service.handleMessage('send 1 ARB to Wallet 2', 'real-user');
    expect(result.ok).toBe(false);
  });

  // Repeat for swap and fund-gas paths.
});
```

Because `AgentChatService` has a large constructor, prefer reusing any existing test helper in the repo (check `apps/api/__tests__/` and `apps/api/src/bootstrap/*.test.ts` for a builder). If none exists, construct with minimal fakes mirroring the interface.

- [ ] **Step 6.2: Run to verify failure**

Run: `pnpm --filter @pouch/api test`
Expected: the "real user" test fails (currently returns a fake delivered receipt).

- [ ] **Step 6.3: Add `isDemo` helper + gate all three branches**

At the top of `apps/api/src/services/agent-chat-service.ts` (near the other module-level helpers, after `touchEntry`):

```ts
function isDemo(userId: string): boolean {
  return userId === 'demo-user' || userId === '0xdemo';
}
```

Then, in each of the three `if (!isOk(result))` blocks (send ~576, swap ~800, fund-gas ~1006), wrap the entire fabrication block:

```ts
if (!isOk(result)) {
  if (!isDemo(userId)) {
    // Real user, real failure — propagate the error.
    return result;
  }
  // Demo fallback: simulate success with mock tx
  const mockTxHash = `0xsend-${Date.now().toString(16)}`;
  // ... rest of existing fabrication unchanged ...
}
```

Do this for all three branches (send/swap/fund-gas). Keep the fabrication code itself identical — only add the early `return result` for non-demo users.

- [ ] **Step 6.4: Verify + commit**

Run: `pnpm --filter @pouch/api test && pnpm typecheck`
Expected: green.

```bash
git add -A
git commit -m "fix(security): C6 — gate fake receipts on isDemo(userId)

send/swap/fund-gas fallbacks now only fabricate a delivered receipt
for the demo user. Real users get the propagated error instead of a
fake success with a 404 Arbiscan link."
```

- [ ] **Step 6.5: Mark C6 done.**

---

## Task 7: Final verification + docs sync

- [ ] **Step 7.1: Full repo verification**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 7.2: Manual smoke check (if a local server is available)**

Run the API locally per the README and verify:
- `POST /auth/demo` still works in dev → returns 200.
- `GET /balance` with the demo cookie → 200 with balances.
- `POST /agent/chat` with `{ message: 'send 0.001 ARB to Wallet 2' }` and the demo cookie → delivers a mock receipt (demo path intact).
- `POST /webhooks/bitrefill` with no signature → 401.

If no local server is feasible (no DB/keys), skip and note it in the commit body.

- [ ] **Step 7.3: Update `docs/audit/FOLLOW-UP-ACTION-PLAN.md`**

Confirm all six C-rows show `[x]`. Add a one-line note under Workstream A: *"All CRITICAL fixes landed on branch `audit-fixes` on 2026-07-25."*

- [ ] **Step 7.4: Commit docs**

```bash
git add docs/audit/FOLLOW-UP-ACTION-PLAN.md
git commit -m "docs(audit): mark C1–C6 complete"
```

- [ ] **Step 7.5: Report**

Summarize for the user: branch name, list of commits, what was verified, and the remaining HIGH/MEDIUM/LOW items (Workstreams B and C) that are out of scope for this session. Do not merge to `main` unless explicitly asked.

---

## Out of scope (do not touch in this plan)

- HIGH, MEDIUM, LOW findings (Workstreams B and C) — separate sessions.
- The `knownAssets` hardcoded fake balances (L2) — narrow C5 to the bypass only.
- Repo-level tenancy hardening beyond the route guard (M8) — the route guard closes the IDOR; deeper repo changes are M8's job.
- Any change to the demo presentation/video.
