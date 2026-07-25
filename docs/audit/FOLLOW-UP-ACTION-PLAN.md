# Follow-Up Action Plan — Pouch Audit Fixes

> Execution plan for the findings in [`2026-07-25-security-audit.md`](./2026-07-25-security-audit.md).
> **Deadline: Jul 30.** This file is the single source of truth for fix status.
> Update the Status column as fixes land.

---

## How to use this file (next session)

1. **Read [`2026-07-25-security-audit.md`](./2026-07-25-security-audit.md) first** — it has full context, file:line refs, and fixes.
2. Create a branch before touching `main`: `git switch -c audit-fixes`.
3. Work top-to-bottom in the table below (it is ordered by priority).
4. After each fix: run `pnpm typecheck && pnpm --filter @pouch/api test && pnpm --filter @pouch/domain test`.
5. Mark Status: `[ ]` pending → `[~]` in progress → `[x]` done.
6. Commit each logical fix separately with message format: `fix(security): C1 — webhook HMAC verification`.

---

## Workstream A — CRITICAL (block demo/production)

These must land before Jul 30. Each is independent enough to ship as its own commit.

| # | Fix | Files | Status | Effort |
|---|-----|-------|--------|--------|
| C1 | Bitrefill webhook HMAC verification with `crypto.timingSafeEqual` + `WEBHOOK_SECRET`; require in route before `service.handle` | `packages/infra-offramp/src/bitrefill/adapter.ts`, `apps/api/src/routes/webhooks/bitrefill.ts`, `apps/api/src/services/bitrefill-webhook-service.ts` | `[x]` | S |
| C2 | Never enable `allowDemoFallback` in production; `createRuntimeAppServices` fail-closed in prod | `apps/api/src/middleware/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/bootstrap/create-runtime-app-services.ts` | `[ ]` | M |
| C3 | Only mount `POST /auth/demo` when `mode === 'demo'` (or `!isProduction`) | `apps/api/src/app.ts` | `[ ]` | XS |
| C4 | Derive identity only from `context.get('userId')`; strip `userId` from body/query in `/agent/chat`, `/balance`, `/orders/:id`; enforce repo tenancy | `apps/api/src/routes/agent.ts`, `balance.ts`, `orders.ts`, `packages/infra-db/src/repositories/order-repository.ts` | `[ ]` | M |
| C5 | Remove `KNOWN_ADDRESSES`/`KNOWN_WALLETS` hardcoded whitelist; derive expected address from `SEED_PHRASE_*`; make `resolveSender` strict | `packages/infra-web3/src/private-key/private-key-provider.ts`, `apps/api/src/services/agent-chat-service.ts` | `[ ]` | M |
| C6 | Only fabricate demo receipt when `isDemo(userId)`; propagate real errors otherwise | `apps/api/src/services/agent-chat-service.ts` (send :576, swap :800, fund-gas :1006) | `[ ]` | S |

**Estimated total:** ~1 day. **Risk:** C5 may break the live demo if Wallet 3/4 addresses were the only thing making sends work — test demo flow end-to-end after C5.

---

## Workstream B — HIGH (live-demo risk + pre-production)

Pick the demo-relevant ones first (H2 slippage, H6 timeouts, M5 gas cap, L1 prices) if presenting live to judges.

| # | Fix | Files | Status | Demo-relevant? |
|---|-----|-------|--------|----------------|
| H2 | Real quote-based `amountOutMinimum` with 5% slippage | `private-key-provider.ts:734` | `[ ]` | YES |
| H6 | Timeouts/AbortController on all web3 external calls; `tx.wait()` timeout + CONFIRMATIONS | `private-key-provider.ts`, `openfort-provider.ts`, `particle/universal-account.ts` | `[ ]` | YES |
| H3 | `amount.value` validation (`Number.isFinite && > 0`) at top of `sendPayment` | `private-key-provider.ts:483, 531` | `[ ]` | YES |
| H1 | Destination whitelist + `isAddress` validation on `settlePayment`/`sendEth`; typed `OpenfortAccount` | `openfort-provider.ts:118-214` | `[ ]` | no |
| H4 | `redirect: 'manual'` or strip `Authorization` on cross-host redirect in `shared/http.ts` | `packages/shared/src/http.ts` | `[ ]` | no |
| H5 | Zod refinement: `https://` required for `BITREFILL_BASE_URL`, `RPC_URL_*`, etc. | `packages/shared/src/config.ts` | `[ ]` | no |
| H7 | Trust only LB-set hop for client IP; back rate limiter with Redis | `apps/api/src/app.ts:22-63` | `[ ]` | no |
| H8 | `createInvoice` → `retries: 0`; add Idempotency-Key header if supported | `packages/infra-offramp/src/bitrefill/client.ts` | `[ ]` | no |
| H9 | Global `app.onError`; strip `cause`/`detail` from non-debug responses | `apps/api/src/app.ts`, `routes/domain-errors.ts`, `routes/auth.ts` | `[ ]` | no |
| H10 | `mapArgs()` validator per tool for `send`/`swap`/`search`; bound + sign-check amounts | `packages/infra-ai/src/llm-intent-parser.ts`, `llm-tools.ts` | `[ ]` | no |

---

## Workstream C — MEDIUM / LOW (polish before any real deploy)

| # | Fix | Files | Status |
|---|-----|-------|--------|
| M1 | Lock down `/health` (split liveness/readiness); don't echo `geminiConfigured` | `apps/api/src/app.ts` | `[ ]` |
| M2 | Fail-fast on invalid seed phrase in non-demo/prod | `private-key-provider.ts:194-205` | `[ ]` |
| M3 | Stop logging any portion of private keys; route through `LoggerPort` | `private-key-provider.ts:208-212` | `[ ]` |
| M4 | Match USDC by address, not symbol literal | `particle/ua-assets-mapper.ts:38-42` | `[ ]` |
| M5 | Per-chain gas cap; USD fee check on L2s | `private-key-provider.ts:105` | `[ ]` |
| M6 | Wrap untrusted prompt inputs in `<untrusted>` delimiters | `infra-ai/llm-reply-strategy.ts` | `[ ]` |
| M7 | Send/swap token-amount type (separate from USD) | `domain/intent-parser.ts`, `domain/security.ts` | `[ ]` |
| M8 | Repo-level tenancy enforcement; error on userId mismatch | `domain/executor.ts:118-120`, `infra-db/.../order-repository.ts` | `[ ]` |
| M9 | Move pending confirmations/history to shared store (or stateless token) | `agent-chat-service.ts:50-55` | `[ ]` |
| M10 | Gate `hybridAgentWallet` 0x…dEaD shortcut on `isDemo(from)` | `bootstrap/create-runtime-app-services.ts:313-318` | `[ ]` |
| M11 | Sanitize offramp error messages | `infra-offramp/adapter.ts` | `[ ]` |
| L1 | Pull prices from oracle with cache | `private-key-provider.ts:45-49` | `[ ]` |
| L2 | Remove hardcoded fake Wallet 3/4 balances | `private-key-provider.ts:333-336` | `[ ]` |
| L3 | Align cookie `maxAge` (24h) with JWT `exp` | `apps/api/src/app.ts:152` | `[ ]` |
| L4 | Validate markdown link URLs in `AgentTurn` | `apps/web/src/components/chat/AgentTurn.tsx` | `[ ]` |
| L5 | `SecurityChecker` fail-closed | `domain/security.ts:81-98` | `[ ]` |
| L6 | Gemini fetch timeout via AbortController | `infra-ai/gemini-provider.ts:131-138` | `[ ]` |
| L8 | Always require strong `JWT_SECRET` outside localhost; use `loadConfig()` | `apps/api/src/app.ts:72-80` | `[ ]` |

---

## Verification checklist (per fix)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` (or at least affected package tests) passes
- [ ] If touching auth/web3: add a regression test for the attack vector
- [ ] If touching demo flow: manually run "Cash out $25 to Amazon" in demo mode at `localhost:3000`
- [ ] Commit message follows `fix(security): <ID> — <summary>` convention
- [ ] Update Status column in this file

---

## Out of scope for this audit (don't touch during fixes)

- The hexagonal architecture and ports/adapters design (working well).
- The `Result`/`DomainError` typing pattern.
- The regex intent-parser fallback system.
- Drizzle ORM query patterns (already parameterized).
- The Next.js proxy (`apps/web/src/app/api/[...path]/route.ts`) — correctly same-origin passthrough, no leak.
