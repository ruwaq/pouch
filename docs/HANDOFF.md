# Handoff — Current Snapshot

Last updated: 2026-07-13

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
pnpm typecheck
pnpm test
pnpm build
```

## Implemented backend surface

- `POST /agent/chat`
- `GET /balance`
- `GET /orders/:id`
- `POST /webhooks/bitrefill`

## What is real vs demo

### Real / production-shaped
- Monorepo + package boundaries (hexagonal, domain isolation)
- Domain router / executor / typed errors / intent parser (regex-based)
- Bitrefill adapter with quote pricing, canonical package_id, webhook verification, redemption fetch
- Drizzle-backed repositories (orders + webhook events)
- Runtime bootstrap with env-driven provider loading and fail-fast

### Demo / temporary
- `infra-web3` uses `WEB3_PROVIDER_MODE=demo` (Particle stub throws)
- No real Particle UA, Magic auth, JWT middleware, or real transfer execution
- Intent parser is regex-only (LLM layer designed but not implemented)
- Frontend is a static landing page, not a connected chat UI

---

## What needs to be built (next phases)

### Phase 0 — Domain foundation (DONE)
- ✅ `TraceStep` + `TraceRecorder` in domain; `CashOutExecutor` emits trace; surfaced via `AgentChatResponse.trace`
- ✅ `IntentParserStrategy` interface (LLM parser injectable in Phase 2)
- ✅ Gap F fixed: `BitrefillAdapter.verifyWebhook(payload, headers)`
- ✅ Ownership plumbing: orders carry `userId`; repos + `/orders/:id` filter by it (query param for now; auth middleware in Phase 1)
- ✅ `LLM_PROVIDER`/`GEMINI_API_KEY`/`LLM_MODEL` in Zod config
- ✅ `users` unique partial indexes on `magic_public_key` + `evm_address`

### Phase 1 — Web3 spike + auth (DONE — code complete, 2 manual gates pending)
- ✅ Raw-key UA spike script (`packages/infra-web3/spike/ua-spike.mts`) — validates Particle UA + 7702 end-to-end
- ✅ `ParticleAccountProvider` (read-only balance via `getPrimaryAssets`); `factory.ts` particle mode no longer throws
- ✅ Auth: `MagicAdminLike` → `AuthService` (DID validate → upsert → session JWT via jose)
- ✅ `createAuthMiddleware` (JWT cookie → ctx.userId/evmAddress; demo fallback for tests/dev)
- ✅ `/auth/callback` + `/auth/logout` routes
- ✅ `/balance` + `/orders/:id` read userId/evmAddress from auth context
- ✅ Transaction-planning endpoints (`POST /transactions/plan/consolidate`, `/plan/payment`) — frontend-driven signing seam
- ⏭️ **MANUAL GATE 1:** Run the spike (needs ~$1 USDC + Particle creds): `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike`
- ⏭️ **MANUAL GATE 2:** Run DB migration (needs live Postgres): `pnpm db:generate && pnpm db:migrate`
- ⏭️ Frontend-driven signing (Magic signs rootHash + 7702 auths in browser) — Phase 3

**Architecture decision (research-backed):** Magic signing is browser-only. The server plans UA transactions (`createConvertTransaction`/`createTransferTransaction`) and returns unsigned plans; the browser signs the `rootHash` + 7702 auths via Magic, then `sendTransaction`. See `TransactionPlanner`.

### Phase 1 — Web3 spike (de-risking, 2 days, real funds $5-10)
Validate Particle UA + Magic 7702 end-to-end before building on top.
- Magic login → EOA → EIP-7702 delegation on Base + Arbitrum
- `getPrimaryAssets()` → unified balance
- `createConvertTransaction()` → cross-chain consolidation
- Reference: `github.com/Particle-Network/ua-7702-magic-demo`

### Phase 2 — Auth + Web3 wiring
- `infra-web3/particle/universal-account.ts` — real AccountProvider
- `infra-web3/chains.ts` — chain config from env
- `api/middleware/auth.ts` — Magic DID → JWT (jose) → ctx.userId
- `api/routes/auth.ts` — login callback, issue JWT cookie

### Phase 3 — LLM layer + frontend
- `packages/infra-ai/` — LLMProvider interface + Gemini implementation
- LLM intent parser with regex fallback (demo always works)
- Frontend: chat + inline agent trace + receipt card + zero-popup counter

### Phase 4 — Bounties
- ZeroDev SRA deposit page (⚠️ check free tier / credits first)
- Openfort gas sponsorship (policy, not x402)

---

## Key files to continue from

### Design spec (read this first)
- `docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`

### Runtime composition
- `apps/api/src/bootstrap/create-runtime-app-services.ts`
- `apps/api/src/app.ts`

### Domain (pure, tested, DO NOT rebuild)
- `packages/domain/src/types.ts` — AccountProvider, OffRampProvider interfaces
- `packages/domain/src/executor.ts` — CashOutExecutor
- `packages/domain/src/router.ts` — OffRampRouter
- `packages/domain/src/intent-parser.ts` — regex IntentParser (LLM wraps this)

### Infra (partially implemented)
- `packages/infra-offramp/src/bitrefill/*` — complete adapter
- `packages/infra-db/src/repositories/*` — Drizzle repos
- `packages/infra-web3/src/factory.ts` — AccountProvider DI seam (particle case throws)

## Notes for the next session
- The design spec is the single source of truth for what to build.
- If moving from demo to real web3, do it through `createAccountProvider(config)` (the factory).
- The LLM layer goes in a new `packages/infra-ai/` — domain defines the interface, infra implements.
- Particle UA is mainnet-only. The spike uses real funds. DemoAccountProvider stays for tests.
- SDK version (DevRel-confirmed): `@particle-network/universal-account-sdk@^2.0.0-beta.3`
- ethers v6 mandatory (v5 lacks `authorizeSync` for 7702)

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
- ✅ Design spec complete and committed (`docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`)
- ✅ All docs synced with confirmed direction (AGENTS, README, ARCHITECTURE, HACKATHON_INTEL, PROVIDERS, HANDOFF, .env.example)
- ✅ Backend foundation: domain (router/executor/intent-parser), Bitrefill adapter, Drizzle repos, API routes
- ✅ Competitive research: 23 projects analyzed, off-ramp = 0 competitors

### What's next (the ONLY thing to do):
1. **Invoke `writing-plans` skill** to create the day-by-day implementation plan
2. The plan must sequence: web3 spike (2 days, real funds) → auth → LLM layer → frontend → bounties
3. Resolve the ZeroDev SRA pricing risk (ask for hackathon credits or pivot to Openfort)
4. After plan approval, start implementation

### Open decisions for the plan to resolve:
- ZeroDev SRA: try credits first, fallback to Particle deposit address or Openfort-only
- Bitrefill: mock fulfillment for dev, 1 real ~$1 purchase for final demo
- Hosting: Vercel (frontend) + Render/Vercel serverless (backend) + Supabase (DB), all $0

### Verification before starting implementation:
```bash
pnpm typecheck   # should pass
pnpm test        # should pass
pnpm build       # should pass
```
