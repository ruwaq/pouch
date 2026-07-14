# Handoff — Current Snapshot

Last updated: 2026-07-14 (Phase 4 spec written, scope locked)

## Strategic direction — CONFIRMED

**Pouch = conversational off-ramp agent.** AI agent that converts crypto to real-world value (gift cards, top-ups, eSIM) via natural language. Cross-chain consolidation via Particle UA + EIP-7702.

Full design spec: [`docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`](./superpowers/specs/2026-07-13-pouch-offramp-agent-design.md)

### Why this direction (research-backed)
- **0 competitors** in off-ramp niche among 23 active UXmaxx projects (blue ocean)
- **0 historical hackathon winners** in crypto-to-gift-card or AI-agent-off-ramp
- **Differentiator vs incumbents:** chain abstraction on the INPUT (Bitrefill/Coinbase/x402 are all single-chain USDC)

### Bounties targeted ($4.1k-$5.1k potential — ZeroDev dropped 2026-07-14)
- UA Track ($1.5-2.5k) — cross-chain consolidation via UA 7702
- Arbitrum ($2k) — settlement chain = Arbitrum One (already wired)
- Magic Labs ($500) — blind signatures, zero popups
- Openfort ($100) — gas sponsorship via agent backend wallet (Phase 4, spec written)

### Cut from scope
- Reloadly (not a bounty, eats 1.5 days)
- x402 / EIP-3009 (confirmed bug: reverts in UA 7702)
- ZeroDev session keys (complexity; blind signatures cover the narrative)
- Web comercial / landing (minimalist: shows functionality, not marketing)

---

## Verified state

The workspace currently passes:
```bash
pnpm dev:api     # ✅ boots: "Pouch API listening on http://localhost:3001" (runtime blocker fixed 2026-07-14)
pnpm dev:web     # ✅ Next.js 15 on :3000, proxies /api/* → :3001 (Phase 3)
pnpm typecheck   # 8/8 packages
pnpm test        # 104 tests passing (56 baseline + 36 Phase 2 + 12 web Phase 3)
pnpm build       # 8/8 packages
```

### Phase 3 E2E demo flow — VERIFIED (2026-07-14)

With both `pnpm dev:api` + `pnpm dev:web` running (no Magic key needed):
- `GET /api/health` → `{"ok":true,"service":"api","mode":"demo"}` (via the Next proxy)
- `GET /api/balance?userId=demo-user` → `{"total":150,"assets":[...]}`
- `POST /api/agent/chat` `{"message":"Cash out $25 to Amazon"}` → full `AgentChatResponse`: 4-step trace (`Reading balance` → `Finding best provider [cheapest]` → `Creating order` → `Signing payment [NO POPUP]`) + conversational reply + parsed intent.
- The web app (`localhost:3000`) renders the chat UI in demo mode (no Magic key → ChatView directly); BalancePill shows `$150.00 · 1 asset`; suggestion chips + demo banner present; sending a message renders the user bubble + agent bubble (reply + trace timeline + receipt card).

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
- Frontend (Phase 3): Magic login modal + chat UI + agent trace timeline + receipt card + balance pill + zero-popup counter. Works in demo mode without a Magic key (verified E2E). Real Magic auth + UA 7702 signing = Phase 4 (gated on Manual Gate 1).
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

> ✅ **Runtime blocker RESOLVED (2026-07-14).** The earlier diagnosis was wrong: the SDK *does* export `UNIVERSAL_ACCOUNT_VERSION` (verified in `.d.ts`, `.cjs`, and `.mjs` of `@particle-network/universal-account-sdk@2.0.3`; `import` works from `packages/infra-web3`). The real root cause was **deferred ESM module loading under pnpm + tsx**: `universal-account.ts` imported the SDK at module top-level, and `packages/infra-web3/src/index.ts` re-exported it via a barrel (`export * from './particle/universal-account'`). So any `import from '@pouch/infra-web3'` in `apps/api` linked the Particle SDK at startup, and its ESM named-export resolution failed in that context — throwing `does not provide an export named 'UNIVERSAL_ACCOUNT_VERSION'` regardless of `WEB3_PROVIDER_MODE`. **Fix:** the SDK import was moved *inside* `ParticleAccountProvider.getInstance()` (now async) and replaced the module-level `UniversalAccount` typing with a local `UniversalAccountLike`. Demo mode never resolves the SDK; particle mode loads it lazily on first use. Verified: `pnpm dev:api` now boots (`Pouch API listening on http://localhost:3001`), `pnpm typecheck`/`test`/`build` all pass 8/8.

### Phase 3 — Frontend (DONE — code complete 2026-07-14, E2E verified in demo mode)
- ✅ Tailwind v4 + design tokens (globals.css); same-origin `/api` proxy (next.config rewrites)
- ✅ Typed API client (`apiGet`/`apiPost` + `ApiError`, `credentials: 'include'`)
- ✅ Magic client wrapper (lazy singleton, `EVMExtension`, blind-signature login)
- ✅ SessionProvider (Magic → `/auth/callback` → httpOnly cookie; demo fallback when no Magic key)
- ✅ ChatProvider (`/agent/chat`), Landing + Magic login modal, session-gated page shell
- ✅ ChatView (header + BalancePill + zero-popup counter + demo banner), MessageList (user/agent bubbles + auto-scroll + empty-state suggestions), ChatInput (Enter to send), AgentTurn + TraceTimeline (NO POPUP emphasis) + ReceiptCard (polls `/orders/:id`)
- ⏭️ Real Magic auth needs `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` set (demo mode works without it)
- ⏭️ UA 7702 browser signing (`sign7702Authorization` + `/transactions/plan/*` → `sendTransaction`) — Phase 4, gated on Manual Gate 1 (the UA spike). A `ua-signer.ts` seam is sketched in the plan (Task 14) but not wired.

### Phase 4 — Bounties + polish (SPEC WRITTEN, plan + implementation NEXT)
- ✅ **Spec written (2026-07-14):** [`docs/superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md`](./superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md)
- ❌ **ZeroDev SRA DROPPED (2026-07-14):** Researched pricing — free tier is testnet-only; production $69–500/mo. Particle UA is mainnet-only → ZeroDev testnet cannot route to it. Architecturally broken on a free budget, not just expensive. Bounty ($500) soltado. `/deposit` page dropped with it (it only existed to host SRA). `ZERODEV_PROJECT_ID` stays in config but factory ignores it.
- ❌ **Bitrefill real purchase DROPPED:** Mock fulfillment for dev AND demo. Zero cost.
- ⬜ **Openfort gas sponsorship — TO BUILD:** Agent backend wallet (Opción A, confirmed). Openfort creates its OWN EOA + EIP-7702 Calibur delegation; gas-sponsored via policy + feeSponsorship (`pay_for_user`). CANNOT sponsor an external smart account (Particle UA) — confirmed from SDK 0.10.8. So: UA = user's account (consolidation), Openfort wallet = agent's gasless signer (settlement payment to Bitrefill). Two-step trace: `Funding agent wallet [UA 7702]` → `Paid via Openfort gasless [NO POPUP]`.
- ⬜ **CI lint step** (`.github/workflows/ci.yml`) — pending since Phase 0.
- ⬜ **Demo hardening** (error/empty/mobile states in frontend) + **submission prep** (README, bounty mapping doc).

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
docs/superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md (Phase 4 spec,
approved 2026-07-14). Luego usa el skill writing-plans para escribir el plan de
implementación detallado de Phase 4 (Openfort agent wallet + CI lint + demo hardening).
El scope YA ESTÁ DECIDIDO — no relevar decisiones. Ejecutar directo.
```

### What's done (don't redo):
- ✅ Design spec + competitive research + all docs
- ✅ Phase 0: domain foundation (trace, parser strategy, ownership, Gap F, config)
- ✅ Phase 1: web3 spike script + real Particle provider + full auth + transaction planner
- ✅ Phase 2: LLM layer (infra-ai + Gemini function-calling + regex fallback)
- ✅ Phase 3: Frontend (chat UI + agent trace + Magic login + receipt), E2E verified in demo mode
- ✅ Initial Drizzle migration generated
- ✅ **Phase 4 spec written** — scope locked, decisions confirmed (see below)

### Phase 4 decisions (LOCKED 2026-07-14 — do not revisit):
- **Openfort:** BUILD. Agent backend wallet (Opción A). `AgentWalletPort` in domain (optional), `OpenfortAgentWallet` in infra-web3. SDK `@openfort/openfort-node@^0.10.8`, deferred ESM import (same pattern as Particle fix).
- **ZeroDev SRA:** DROPPED. Free tier testnet-only × Particle mainnet-only = incompatible. No code. `ZERODEV_PROJECT_ID` ignored.
- **`/deposit` page:** DROPPED (only existed for ZeroDev).
- **Bitrefill real purchase:** DROPPED. Mock fulfillment everywhere.
- **CI lint + demo hardening + README:** IN SCOPE.

### Manual gates still pending (user-run, not agent):
1. **Spike (Phase 1):** `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike` (~$1 USDC, validates UA + 7702)
2. **DB migration (Phase 1):** `pnpm db:migrate` (needs live Postgres)
3. **Openfort dashboard setup (Phase 4):** Create project → enable backend wallets (get `WALLET_SECRET`) → policy (Base+Arbitrum, `sponsorEvmTransaction`) → feeSponsorship (`pay_for_user`) → 3 IDs in `.env`. Documented step-by-step in the Phase 4 spec §5.

### Bounties targeted after Phase 4 ($4.1k–5.1k):
- UA Track ($1.5–2.5k) — Phase 1
- Arbitrum ($2k) — settlement chain config
- Magic Labs ($500) — Phase 3
- Openfort ($100) — Phase 4

### Verification before starting implementation:
```bash
pnpm typecheck   # should pass (8/8 packages)
pnpm test        # should pass (104 tests)
pnpm build       # should pass (8/8 packages)
```
