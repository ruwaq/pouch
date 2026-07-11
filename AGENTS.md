# AGENTS.md — Pouch

> **Read this FIRST.** This is the single source of truth for any agent (human or AI, local or remote) working on Pouch.
> Last updated: 2026-07-10. Project status: **Phase 0 — Foundation (in progress)**.

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

### Bounties we target (5 sections, ~$5,600 potential)

| # | Bounty | Prize | How Pouch covers it |
|---|--------|-------|---------------------|
| 1 | Universal Accounts Track | $1.5k-$2.5k | Cross-chain consolidation via UA + EIP-7702 |
| 2 | Arbitrum bounty | $2k | Settlement chain = Arbitrum One (config via env) |
| 3 | Magic Labs bonus | $500 | Embedded wallet + blind signatures (zero popups) |
| 4 | ZeroDev SRA subtrack | $500 | `createSmartRoutingAddress()` for cross-chain deposits |
| 5 | Openfort subtrack | $100 | Agent backend wallet + gas sponsorship |

**Key insight:** Bounties are judged INDEPENDENTLY (not against the main track pool). We can win several simultaneously. The 3 "almost guaranteed" ones (ZeroDev SRA, Openfort, Magic) have near-zero competition based on GitHub research.

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
| Web3 | viem + provider SDKs via adapters | Never call SDKs from domain layer |

### SDK dependencies (verified versions)
- `magic-sdk` + `@magic-ext/evm` — embedded wallet, blind signatures, EIP-7702 sign
- `@particle-network/universal-account-sdk@beta` — Universal Account, EIP-7702 (`useEIP7702:true`, `V2`)
- `@openfort/openfort-node@0.10.8` — agent wallet + gas sponsorship + Calibur
- `@zerodev/smart-routing-address@0.2.5` — Smart Routing Address (SRA)
- `@zerodev/permissions@5.6.3` — session keys (Kernel v3)

### External APIs
- **Bitrefill** (`api.bitrefill.com/v2`): Bearer token, self-service, test products available, USDC Arbitrum/Base native
- **Reloadly** (`docs.reloadly.com`): OAuth client_credentials, sandbox self-service, mobile top-up + eSIM + gift cards

---

## Architecture overview

```
pouch/
├── packages/
│   ├── domain/          # Pure business logic (NO SDKs, NO React, NO fetch)
│   ├── infra-offramp/   # Off-ramp provider adapters (Bitrefill, Reloadly, ...)
│   ├── infra-web3/      # Blockchain adapters (Particle, Magic, Openfort, ZeroDev)
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

**Phase 3 backend + infra foundation (in progress)**
- [x] Git repo initialized
- [x] Documentation created (AGENTS.md, ARCHITECTURE.md, HACKATHON_INTEL.md, PROVIDERS.md)
- [x] Turborepo monorepo + 7 packages scaffolded
- [x] shared/config.ts (Zod validation)
- [x] Drizzle schema implemented (migration still pending)
- [x] API routes implemented: `/agent/chat`, `/balance`, `/orders/:id`, `/webhooks/bitrefill`
- [x] Bitrefill adapter implemented with quote/package/webhook hardening
- [x] Drizzle repositories implemented for orders + webhook events
- [x] Runtime bootstrap supports configured mode and safe demo fallback
- [ ] Real Particle/Magic auth and chain abstraction
- [ ] Frontend chat/balance/order UI
- [ ] CI lint step

See [`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md) for the full 10-day plan.
See [`docs/HANDOFF.md`](./docs/HANDOFF.md) for the next recommended continuation point.

---

## Important constraints

1. **Mainnet only for Particle UA and ZeroDev SRA.** No testnet. Test with small real funds ($5-10 USDC).
2. **Magic blind signatures = zero popups.** This is our UX differentiator. Never break this.
3. **Never hardcode secrets, chain IDs, or contract addresses.** Everything via env config.
4. **Domain layer stays pure.** If you need to import an SDK, it goes in `infra-*`, not `domain/`.
5. **All webhooks must be idempotent.** Deduplicate by event ID.
6. **English-only UI** (judges are international). Comments and docs can be bilingual.
