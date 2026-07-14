# AGENTS.md — Pouch

> **Read this FIRST.** This is the single source of truth for any agent (human or AI, local or remote) working on Pouch.
> Last updated: 2026-07-14. Project status: **Phase 1 — Web3 + auth (code done, 2 manual gates pending; runtime blocker FIXED); Phase 2 — LLM layer (merged); Phase 3 — Frontend (code complete, E2E verified); Phase 4 — Openfort + CI + demo hardening (code complete)**.

---

## What is Pouch?

**Pouch** is an AI cashout agent: a conversational interface where users speak in natural language and an AI agent converts their crypto into real-world value (gift cards, mobile top-ups, eSIM, bank transfers) — without the user ever seeing wallets, gas, chains, or signing popups.

**One-line pitch:** *"Talk to your money. It cashes out anywhere."*

**The demo (30s):**
> User: "Cash out $50 to Amazon"
> Agent: "You have $12 ETH on Base + $25 USDC on Arbitrum + $18 SOL. Consolidating via Universal Account... Comparing providers: Bitrefill $50.00, Reloadly $50.50. Best option: Bitrefill. Purchasing... ✅ Amazon gift card: [AMZN-XXXX]"

---

## Context: UXmaxx Hackathon

This project is being built for the **UXmaxx Hackathon** (Encode Club + Particle Network).
- **Deadline:** Mon, Jul 20, 2026, 1:59 PM GMT+2
- **Theme:** Chain abstraction / UX that makes crypto feel invisible
- **Stack requirement:** Particle Universal Accounts (EIP-7702 mode) is mandatory for the UA Track

### Bounties we target (4 sections, ~$4.1k-$5.1k potential — ZeroDev dropped 2026-07-14)

| # | Bounty | Prize | How Pouch covers it |
|---|--------|-------|---------------------|
| 1 | Universal Accounts Track | $1.5k-$2.5k | Cross-chain consolidation via UA + EIP-7702 |
| 2 | Arbitrum bounty | $2k | Settlement chain = Arbitrum One (config via env) |
| 3 | Magic Labs bonus | $500 | Embedded wallet + blind signatures (zero popups) |
| 4 | Openfort subtrack | $100 | Agent backend wallet + gas sponsorship (policy, NOT x402) |

**Key insight:** Bounties are judged INDEPENDENTLY. Research (2026-07-13) confirmed 23 active projects; **0 competitors** in the off-ramp niche. Openfort subtrack has only 1 competitor.

**⚠️ ZeroDev SRA — DROPPED (2026-07-14):** Researched pricing: free tier is testnet-only (10K credits/mo); production starts $69/mo (Growth) or ~$500/mo (SRA base). Particle UA is mainnet-only (testnet ended Sep 2025) → ZeroDev testnet **cannot route to** Particle mainnet. Architecturally broken on a free budget. Bounty ($500) soltado. `/deposit` page dropped with it.

**Cut from scope:** Reloadly 2nd provider (not a bounty), x402/EIP-3009 (confirmed bug in UA 7702), ZeroDev session keys (blind signatures cover the narrative), ZeroDev SRA (pricing + testnet/mainnet incompatibility, 2026-07-14), Bitrefill real purchase (mock fulfillment everywhere).

### Judging criteria we optimize for
- **UX excellence (40% UA Track / 30% Arbitrum):** Chat interface + blind signatures + invisible routing
- **UA/7702 use (30%):** Intrinsics to the flow — without 7702 we can't consolidate multi-chain balances
- **Adoption potential (20%):** Off-ramp is the #1 crypto friction; multi-provider = real scalability
- **Technical quality (10%):** Modular architecture, 5 real integrations, tested domain

---

## Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Monorepo | Turborepo + pnpm | 7 packages, incremental builds |
| Backend | Hono (Node.js) | Edge-ready, type-safe |
| Frontend | Next.js 15 (App Router) | SSR, Vercel deploy |
| ORM | Drizzle | Type-safe, migrations |
| Database | PostgreSQL (Supabase) | Managed, relational |
| Validation | Zod | Shared schemas frontend/backend |
| Logging | Pino | Structured logging |
| Testing | Vitest | Monorepo-friendly |
| Web3 | provider SDKs via adapters | Never call SDKs from domain layer |
| AI / LLM | Gemini (`@google/genai`) | Function calling + structured output; admin supplies own API key |

### SDK dependencies (verified versions)
- `magic-sdk` + `@magic-ext/evm` — embedded wallet, blind signatures, EIP-7702 sign
- `@particle-network/universal-account-sdk@^2.0.3` — Universal Account, EIP-7702 (npm-verified stable; NOT beta)
- `ethers@^6.16.0` — **v6 mandatory** (v5 lacks `authorizeSync` / `hashAuthorization` for 7702)
- `@openfort/openfort-node@^0.10.8` — agent backend wallet + gas sponsorship (policy + feeSponsorship `pay_for_user`). API is 0.10.x (`accounts.evm.backend.*`), NOT the older `players.*` namespace.
- ~~`@zerodev/smart-routing-address`~~ — DROPPED 2026-07-14 (free tier testnet-only × Particle mainnet-only = incompatible)
- `jose` — JWT verification (Magic DID → our JWT)
- `@google/genai` — Gemini SDK for LLM intent parsing + conversational responses

### External APIs
- **Bitrefill** (`api.bitrefill.com/v2`): Bearer token, self-service, test products available, USDC Arbitrum/Base native
- **Gemini** (`generativelanguage.googleapis.com`): 1,500 req/day free tier (`gemini-2.0-flash`), admin's own API key

---

## Architecture overview

```
pouch/
├── packages/
│   ├── domain/          # Pure business logic (NO SDKs, NO React, NO fetch)
│   ├── infra-offramp/   # Off-ramp provider adapters (Bitrefill)
│   ├── infra-web3/      # Blockchain adapters (Particle, Magic, Openfort, ZeroDev)
│   ├── infra-ai/        # LLM adapters (Gemini) — agent intelligence layer
│   ├── infra-db/        # Persistence (Drizzle ORM + Postgres)
│   └── shared/          # Cross-cutting (config, logger, http, result types)
├── apps/
│   ├── api/             # Backend (Hono)
│   └── web/             # Frontend (Next.js 15)
└── docker-compose.yml   # Local Postgres
```

### Architecture principles (NON-NEGOTIABLE)
1. **Domain isolation:** `packages/domain` imports NO SDKs. Pure logic, testable in milliseconds.
2. **Adapter pattern:** Each provider/SDK is interchangeable. Adding a provider = 1 new file.
3. **Config via env (Zod-validated):** Zero hardcoded chains, secrets, or URLs. Fail-fast on missing config.
4. **Idempotency:** Webhooks and orders deduplicate by ID. Survive retries.
5. **Error-first:** Typed errors (`Result<T,E>`), no loose exceptions.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design.

---

## Getting started (for any agent)

### Prerequisites
- Node.js v22+
- pnpm v10+
- Docker (for local Postgres) or a Supabase account

### Setup
```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in your keys
cp .env.example .env

# 3. Start local Postgres (or use Supabase URL)
docker compose up -d

# 4. Run database migrations
pnpm db:migrate

# 5. Start dev servers (API + web)
pnpm dev
```

### Required accounts / API keys
| Provider | Where to get keys | Purpose |
|----------|------------------|---------|
| Bitrefill | bitrefill.com → Account > Developers | Off-ramp: gift cards, top-ups |
| Reloadly | reloadly.com → Dashboard | Off-ramp: top-ups, eSIM |
| Magic | magic.link → Dashboard | Embedded wallet auth |
| Particle | dashboard.particle.network | Universal Account (EIP-7702) |
| Openfort | openfort.io → Dashboard | Agent wallet + gas sponsorship |
| ZeroDev | dashboard.zerodev.app | Smart Routing Address |
| Supabase | supabase.com | Postgres database |

---

## Commands reference

```bash
# Development
pnpm dev                    # Start all dev servers (turbo dev)
pnpm dev:web                # Start only frontend
pnpm dev:api                # Start only backend

# Quality gates
pnpm lint                   # ESLint across all packages
pnpm typecheck              # TypeScript across all packages
pnpm test                   # Vitest across all packages
pnpm test:domain            # Test only the domain package

# Database
pnpm db:generate            # Generate Drizzle migrations
pnpm db:migrate             # Run migrations
pnpm db:studio              # Open Drizzle Studio

# Build
pnpm build                  # Build all packages
```

---

## Branch & commit conventions

- **Branch:** `feat/<area>-<description>` (e.g., `feat/foundation`, `feat/bitrefill-adapter`)
- **Commits:** Conventional Commits format — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Never commit secrets, `.env` files, or private keys.

---

## Where things live (quick lookup for agents)

| I need to... | Go to... |
|--------------|----------|
| Add a new off-ramp provider | `packages/infra-offramp/src/<provider>/` — implement `OffRampProvider` interface from `domain/src/types.ts` |
| Change routing logic | `packages/domain/src/router.ts` |
| Change cash-out orchestration | `packages/domain/src/executor.ts` |
| Add an API endpoint | `apps/api/src/routes/` |
| Add a frontend page | `apps/web/src/app/` |
| Change env config | `packages/shared/src/config.ts` + `.env.example` |
| Change DB schema | `packages/infra-db/src/schema.ts` + run `pnpm db:generate` |
| Understand the full architecture | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| See hackathon research | [`docs/HACKATHON_INTEL.md`](./docs/HACKATHON_INTEL.md) |
| See API details for providers | [`docs/PROVIDERS.md`](./docs/PROVIDERS.md) |

---

## Current phase & status

**Phase 0 + Phase 1 + Phase 2 + Phase 3 (Frontend) code complete. 2 manual gates pending (user-run). Runtime blocker FIXED. E2E demo flow verified against live API.**
- [x] Git repo initialized
- [x] Documentation created (AGENTS.md, ARCHITECTURE.md, HACKATHON_INTEL.md, PROVIDERS.md)
- [x] Turborepo monorepo + 8 packages scaffolded (incl. `@pouch/infra-ai`)
- [x] shared/config.ts (Zod validation, incl. LLM_* + MAGIC_SECRET_KEY)
- [x] Drizzle schema + initial migration generated (`packages/infra-db/drizzle/`)
- [x] API routes: `/agent/chat`, `/balance`, `/orders/:id`, `/webhooks/bitrefill`, `/auth/*`, `/transactions/plan/*`
- [x] Bitrefill adapter (quote/package/webhook hardening, Gap F fixed)
- [x] Drizzle repositories (orders + webhook events + users)
- [x] Runtime bootstrap (configured mode + demo fallback)
- [x] **Phase 0** — domain foundation: TraceStep/TraceRecorder, CashOutExecutor emits trace, IntentParserStrategy, ownership plumbing, Gap F fix
- [x] **Phase 1** — web3: real ParticleAccountProvider (read-only balance), full auth (Magic DID → JWT), transaction planner (frontend-driven signing seam), raw-key spike script
- [x] **Phase 2** — LLM layer: `@pouch/infra-ai` (provider-agnostic `LLMProvider` + `GeminiProvider` via `@google/genai` function-calling), `LlmIntentParser` (regex fallback on any failure), `ReplyStrategy` port + `LlmReplyStrategy`, factory, wired into runtime; `IntentParserStrategy` made async
- [x] **Design spec** — [`docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`](./docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md)
- [x] **Competitive research** — 23 projects analyzed, off-ramp = 0 competitors (blue ocean)
- [ ] **MANUAL GATE 1:** Run the UA spike (`pnpm --filter @pouch/infra-web3 spike`, ~$1 real USDC)
- [ ] **MANUAL GATE 2:** Apply DB migration (`pnpm db:migrate`, needs Postgres)
- [x] **Runtime blocker FIXED (2026-07-14):** `pnpm dev:api` now boots. Real root cause was NOT a missing SDK export — `UNIVERSAL_ACCOUNT_VERSION` *is* exported by `@particle-network/universal-account-sdk@2.0.3`. The issue was deferred ESM module loading under pnpm + tsx: `universal-account.ts` imported the SDK at module top-level and the package barrel re-exported it, so any `import from '@pouch/infra-web3'` linked the Particle SDK at startup and its ESM named-export resolution failed. Fix: SDK import moved inside `ParticleAccountProvider.getInstance()` (now async); demo mode never resolves the SDK. Verified: typecheck/test/build all 8/8. See HANDOFF.md.
- [x] **Frontend (Phase 3, 2026-07-14):** Next.js 15 App Router chat UI — Tailwind v4 + design tokens, same-origin `/api` proxy, typed API client (`apiGet`/`apiPost` + `ApiError`), Magic client wrapper (lazy singleton, `EVMExtension`), SessionProvider (Magic login → `/auth/callback` → cookie), ChatProvider (`/agent/chat`), Landing + Magic login modal, ChatView (header + BalancePill + zero-popup counter + demo banner), MessageList (user/agent bubbles + auto-scroll + empty-state suggestions), AgentTurn + TraceTimeline (NO POPUP badge emphasis) + ReceiptCard (polls `/orders/:id`), Button/Spinner/ErrorMessage primitives. E2E verified: `POST /api/agent/chat` returns full `AgentChatResponse` (trace with NO POPUP + reply). 104 tests total (+12 web). See `docs/superpowers/plans/2026-07-14-pouch-phase3-frontend.md`.
- [x] **Phase 4 (2026-07-14):** Openfort gas sponsorship — `AgentWalletPort` (domain) + `OpenfortAgentWallet` (infra-web3, deferred ESM via lazy `clientFactory`) + `NoopAgentWallet` + `createAgentWallet` factory (prod fail-fast, synchronous). `CashOutExecutor` two-step settlement trace (`Funding agent wallet [UA 7702]` → `Paid via Openfort gasless [NO POPUP]`). Runtime wiring (sync, no boot change). CI lint+build step (eslint flat config). Frontend hardening (error bubbles, balance skeleton, mobile responsive). README + SUBMISSION.md. See `docs/superpowers/plans/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md`.
- [x] CI lint step (`.github/workflows/ci.yml` runs typecheck + lint + test + build; eslint flat config added)

See [`docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md`](./docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md) for the phase index.
See [`docs/HANDOFF.md`](./docs/HANDOFF.md) for the current snapshot and next steps.

---

## Important constraints

1. **Mainnet only for Particle UA and ZeroDev SRA.** No testnet. Test with small real funds ($5-10 USDC).
2. **Magic blind signatures = zero popups.** This is our UX differentiator. Never break this.
3. **Never hardcode secrets, chain IDs, or contract addresses.** Everything via env config.
4. **Domain layer stays pure.** If you need to import an SDK, it goes in `infra-*`, not `domain/`.
5. **All webhooks must be idempotent.** Deduplicate by event ID.
6. **English-only UI** (judges are international). Comments and docs can be bilingual.
