# Handoff — Current Snapshot

Last updated: 2026-07-14

## Strategic direction — CONFIRMED

**Pouch = conversational off-ramp agent.** AI agent that converts crypto to real-world value (gift cards, top-ups, eSIM) via natural language. Cross-chain consolidation via Particle UA + EIP-7702.

Full design spec: [`docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`](./superpowers/specs/2026-07-13-pouch-offramp-agent-design.md)

### Why this direction (research-backed)
- **0 competitors** in off-ramp niche among 23 active UXmaxx projects (blue ocean)
- **0 historical hackathon winners** in crypto-to-gift-card or AI-agent-off-ramp
- **Differentiator vs incumbents:** chain abstraction on the INPUT (Bitrefill/Coinbase/x402 are all single-chain USDC)

### Bounties targeted ($4.6k-$5.6k potential)
- UA Track ($1.5-2.5k) — cross-chain consolidation via UA 7702
- Arbitrum ($2k) — settlement chain = Arbitrum One (already wired)
- Magic Labs ($500) — blind signatures, zero popups
- ZeroDev SRA ($500) — ⚠️ pricing risk (no free tier, need hackathon credits)
- Openfort ($100) — gas sponsorship (policy, NOT x402)

### Cut from scope
- Reloadly (not a bounty, eats 1.5 days)
- x402 / EIP-3009 (confirmed bug: reverts in UA 7702)
- ZeroDev session keys (complexity; blind signatures cover the narrative)
- Web comercial / landing (minimalist: shows functionality, not marketing)

---

## Verified state

The workspace currently passes:
```bash
pnpm typecheck   # 8/8 packages (added @pouch/infra-ai)
pnpm test        # 90 tests passing (56 baseline + 34 Phase 2)
pnpm build       # 8/8 packages
```

## Implemented API surface

- `POST /agent/chat` — conversational cash-out (returns trace)
- `GET /balance` — unified balance (auth context or demo fallback)
- `GET /orders/:id` — order detail (ownership-filtered by userId)
- `POST /webhooks/bitrefill` — idempotent webhook (Gap F fixed: 2-arg verifyWebhook)
- `POST /auth/callback` — Magic DID → JWT cookie (Phase 1)
- `POST /auth/logout` — clear session cookie (Phase 1)
- `POST /transactions/plan/consolidate` — plan UA consolidation, return unsigned rootHash (Phase 1)
- `POST /transactions/plan/payment` — plan UA payment, return unsigned rootHash (Phase 1)

## What is real vs demo

### Real / production-shaped
- Monorepo + package boundaries (hexagonal, domain isolation)
- Domain: router / executor (emits trace steps) / typed errors / IntentParser + IntentParserStrategy
- Bitrefill adapter with quote pricing, canonical package_id, webhook verification, redemption fetch
- Drizzle-backed repositories (orders + webhook events + users)
- Runtime bootstrap with env-driven provider loading and fail-fast
- `ParticleAccountProvider` — real read-only balance via UA SDK `getPrimaryAssets()` (Phase 1)
- Auth: `@magic-sdk/admin` DID verification → `jose` JWT cookie (Phase 1)
- Transaction planner: `TransactionPlanner` plans UA txs, returns unsigned plans for browser signing (Phase 1)
- Initial Drizzle migration generated (`packages/infra-db/drizzle/0000_*.sql`)

### Demo / temporary (until manual gates run)
- `infra-web3` defaults to `WEB3_PROVIDER_MODE=demo` — `DemoAccountProvider` simulates balances/payments
- Auth middleware has `allowDemoFallback: true` in demo mode (no cookie → `demo-user`); production enforces 401
- Intent parser uses Gemini function-calling (Phase 2) when `LLM_PROVIDER=gemini`+`GEMINI_API_KEY` set, else regex — and falls back to regex on ANY LLM failure (demo never breaks). Reply is conversational (LLM) or template, same fallback rule.
- Frontend is a static landing page, not a connected chat UI (Phase 3)
- The spike script (`packages/infra-web3/spike/ua-spike.mts`) is written but NOT yet run against real funds

---

## Phase status

### Phase 0 — Domain foundation (DONE)
- ✅ `TraceStep` + `TraceRecorder` in domain; `CashOutExecutor` emits trace; surfaced via `AgentChatResponse.trace`
- ✅ `IntentParserStrategy` interface (LLM parser injectable in Phase 2)
- ✅ Gap F fixed: `BitrefillAdapter.verifyWebhook(payload, headers)`
- ✅ Ownership plumbing: orders carry `userId`; repos + `/orders/:id` filter by it
- ✅ `LLM_PROVIDER`/`GEMINI_API_KEY`/`LLM_MODEL` in Zod config
- ✅ `users` unique indexes on `magic_public_key` + `evm_address`

### Phase 1 — Web3 spike + auth (DONE — code complete, 2 manual gates pending)
- ✅ Raw-key UA spike script (`packages/infra-web3/spike/ua-spike.mts`) — validates Particle UA + 7702 end-to-end
- ✅ `ParticleAccountProvider` (read-only balance via `getPrimaryAssets`); `factory.ts` particle mode no longer throws
- ✅ Auth: `MagicAdminLike` → `AuthService` (DID validate → upsert → session JWT via jose)
- ✅ `createAuthMiddleware` (JWT cookie → ctx.userId/evmAddress; demo fallback for tests/dev)
- ✅ `/auth/callback` + `/auth/logout` + `/transactions/plan/*` routes
- ⏭️ **MANUAL GATE 1:** Run the spike (needs ~$1 USDC + Particle creds): `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike`
- ⏭️ **MANUAL GATE 2:** Apply DB migration (needs live Postgres): `pnpm db:migrate`
- ⏭️ Frontend-driven signing (Magic signs rootHash + 7702 auths in browser) — Phase 3

**Architecture decision (research-backed, 2026-07-13):** Magic signing is browser-only. The server plans UA transactions (`createConvertTransaction`/`createTransferTransaction`) and returns unsigned plans; the browser signs the `rootHash` + 7702 auths via Magic, then `sendTransaction`. The server-side `AccountProvider.consolidate`/`sendPayment` return typed errors in real Particle mode (they cannot sign); `DemoAccountProvider` simulates them for tests/dev.

**Particle UA testnet:** Unavailable. The incentivized testnet ended Sep 2025; UA V2 (launched Jul 2026) is mainnet-only. The spike uses ~$1 real USDC. SDK version: `@particle-network/universal-account-sdk@^2.0.3` (NOT beta — verified).

### Phase 2 — LLM layer (DONE — code complete; real API key optional)
- ✅ `packages/infra-ai/` — provider-agnostic `LLMProvider` port + `GeminiProvider` adapter (`@google/genai` function-calling)
- ✅ `LlmIntentParser` (implements `IntentParserStrategy`) with regex fallback on ANY failure (provider error / non-cash_out function / plain text / bad args)
- ✅ `ReplyStrategy` port (domain) + `LlmReplyStrategy` (conversational reply, deterministic template fallback)
- ✅ Factory (`createLlmProvider` / `createIntentParser` / `createReplyStrategy` / `createAgentLlm`) — SDK imported ONLY in `factory.ts`, gated behind `LLM_PROVIDER`+`GEMINI_API_KEY`
- ✅ Wired into `createRuntimeAppServices` (LLM when configured, regex + template otherwise); demo path untouched
- ✅ `IntentParserStrategy.parse` made async (required to host the async LLM call)
- ✅ `@google/genai@1.52.0` resolved; verified `gemini-2.0-flash` model wiring
- ⏭️ Admin supplies real `GEMINI_API_KEY` at demo time (regex always works without it — demo never breaks because of the LLM)
- ⏭️ Verified via unit + integration tests (32 in infra-ai + 2 runtime-wiring in api); **live-server smoke is blocked by a Phase 1 runtime issue** (see ⚠️ below), unrelated to Phase 2

> ⚠️ **Phase 1 runtime blocker (NOT Phase 2):** `packages/infra-web3/src/factory.ts:5` statically imports `ParticleAccountProvider`, whose module imports `UNIVERSAL_ACCOUNT_VERSION` from `@particle-network/universal-account-sdk` — an export the installed SDK version does not provide. This throws at module-load time regardless of `WEB3_PROVIDER_MODE`, so `pnpm dev:api` can't boot. typecheck passes (Phase 1 `paths` override) but runtime ESM resolution fails. **Phase 2 did not touch `infra-web3`** (confirmed: 0 files changed there). Fix options when resuming Phase 1: (a) lazy-import `ParticleAccountProvider` inside the `case 'particle'` branch so demo mode never loads it; (b) drop the unused `UNIVERSAL_ACCOUNT_VERSION` import; (c) pin an SDK version that exports it. The Phase 2 LLM flow itself is verified end-to-end via `app.test.ts` (mocked services, no web3).

### Phase 3 — Frontend
- Magic login + embedded wallet + `sign7702Authorization` (browser signing)
- Chat + inline agent trace + receipt card + zero-popup counter
- Uses `/transactions/plan/*` to get unsigned plans, signs via Magic, calls `sendTransaction`

### Phase 4 — Bounties
- ZeroDev SRA deposit page (⚠️ check free tier / credits first)
- Openfort gas sponsorship (policy, not x402)

---

## Key files to continue from

### Plans & specs (read first)
- `docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md` — design spec
- `docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md` — phase index
- `docs/superpowers/plans/2026-07-13-pouch-phase0-domain-foundation.md` — Phase 0 (done)
- `docs/superpowers/plans/2026-07-13-pouch-phase1-web3-spike-and-auth.md` — Phase 1 (done)

### Runtime composition
- `apps/api/src/bootstrap/create-runtime-app-services.ts`
- `apps/api/src/app.ts`

### Domain (pure, tested, DO NOT rebuild)
- `packages/domain/src/types.ts` — AccountProvider, OffRampProvider, TraceStep, IntentParserStrategy
- `packages/domain/src/executor.ts` — CashOutExecutor (emits trace)
- `packages/domain/src/trace.ts` — TraceStep + TraceRecorder
- `packages/domain/src/intent-parser.ts` — regex IntentParser (implements IntentParserStrategy)

### Infra (real implementations)
- `packages/infra-web3/src/particle/universal-account.ts` — ParticleAccountProvider (read-only balance)
- `packages/infra-web3/src/particle/ua-assets-mapper.ts` — UA → domain Balance mapper
- `packages/infra-web3/src/factory.ts` — AccountProvider DI (demo + particle modes)
- `packages/infra-web3/spike/ua-spike.mts` — raw-key spike script (MANUAL GATE: run with funds)
- `packages/infra-offramp/src/bitrefill/*` — complete adapter
- `packages/infra-db/src/repositories/*` — Drizzle repos (orders + webhook events + users)

### API (Hono)
- `apps/api/src/middleware/auth.ts` — JWT cookie → ctx (demo fallback)
- `apps/api/src/services/auth-service.ts` — DID → JWT
- `apps/api/src/services/transaction-planner.ts` — UA tx planning (frontend signing seam)
- `apps/api/src/routes/` — all route definitions

## Notes for the next session
- The design spec + roadmap are the source of truth for what to build.
- The LLM layer goes in a new `packages/infra-ai/` — domain defines `IntentParserStrategy`, infra implements it.
- Particle UA is mainnet-only. The spike uses real funds (~$1). DemoAccountProvider stays for tests.
- SDK versions (npm-verified 2026-07-13): `@particle-network/universal-account-sdk@^2.0.3`, `ethers@^6.17.0`, `@magic-sdk/admin@^2.8.2`, `jose@^6.2.3`
- The SDK's `package.json` has a broken `exports` field (no `types` condition). Worked around via `paths` overrides in `infra-web3/tsconfig.json` + `api/tsconfig.json`.

---

## ▶️ How to resume the next session

### First message to send to the agent:
```
Continúa el proyecto Pouch. Lee docs/HANDOFF.md y
docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md,
luego escribe el plan detallado de Phase 2 (LLM layer: infra-ai + Gemini function-calling)
con writing-plans. Phase 2 can run in parallel with the manual gates of Phase 1.
```

### What's done (don't redo):
- ✅ Design spec + competitive research + all docs
- ✅ Phase 0: domain foundation (trace, parser strategy, ownership, Gap F, config)
- ✅ Phase 1: web3 spike script + real Particle provider + full auth + transaction planner
- ✅ Initial Drizzle migration generated

### Manual gates still pending (user-run, not agent):
1. **Spike:** `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike` (~$1 USDC, validates UA + 7702)
2. **DB migration:** `pnpm db:migrate` (needs live Postgres)

### Open decisions (resolve when reached):
- ZeroDev SRA: try credits first, fallback to Particle deposit address or Openfort-only (Phase 4)
- Bitrefill: mock fulfillment for dev, 1 real ~$1 purchase for final demo

### Verification before starting implementation:
```bash
pnpm typecheck   # should pass (7/7)
pnpm test        # should pass (56 tests)
pnpm build       # should pass (7/7)
```
