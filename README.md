# 🫛 Pouch

> **Talk to your money. It cashes out anywhere.**

Pouch is an AI cashout agent for crypto. Users speak in natural language and an AI agent converts their crypto into real-world value — gift cards, mobile top-ups, eSIM — without ever seeing wallets, gas, chains, or signing popups.

Built for the **UXmaxx Hackathon** (Encode Club × Particle Network).

---

## 🎬 The demo

```
User:  "Cash out $50 to Amazon"

🤖 Pouch (agent trace visible inline):
  ● Parsed intent     0.2s ✓  [cash_out, giftcard, Amazon, $50]
  ● Found balances    0.1s ✓  [$12 ETH Base + $25 USDC Arb + $18 SOL]
  ● Consolidated      2.3s ✓  [UA 7702 cross-chain]
  ● Routed            0.4s ✓  [Bitrefill cheapest]
  ● Signed (7702)     1.1s ✓  [NO POPUP — blind signature]
  ● Delivered         0.3s ✓
  ✅ Amazon gift card: [AMZN-XXXX-XXXX]
```

**Zero popups. Zero gas visible. Zero "which chain?".** The user just talks. The agent does the rest — and shows its work.

---

## ✨ Features

- **Conversational interface** — natural language → crypto cash-out. Powered by Gemini LLM with regex fallback (always works, with or without API key).
- **Cross-chain consolidation** — funds across Arbitrum, Base, Polygon, Solana unified into one balance via Particle Universal Accounts (EIP-7702). Pay with ANY token on ANY chain.
- **Agent trace transparency** — every step visible inline (parse → route → consolidate → sign → deliver). The "show your work" pattern applied to money.
- **Invisible UX** — Magic embedded wallet with blind signatures; user never sees a wallet, gas, chain, or signing popup. Counter shows "popups avoided: 0".
- **Real off-ramp** — actual gift cards, mobile top-ups, eSIM delivered via Bitrefill (8,000+ brands).

---

## Current Status

Implemented and verified in the repo today:

- `POST /agent/chat` — parses cash-out intents and runs the domain executor
- `GET /balance` — returns unified balance from the configured `AccountProvider`
- `GET /orders/:id` — returns persisted order state and redemption data
- `POST /webhooks/bitrefill` — idempotent webhook processing with order status updates
- `infra-offramp/bitrefill` — real provider adapter with pricing, package IDs, and canonical webhook verification
- `infra-db` — Drizzle order repository + webhook event store
- `infra-web3` — account provider factory with a safe `demo` mode and explicit fail-fast for unfinished `particle` mode

Current runtime modes:

- `configured` — loads env config, DB, providers, and webhook wiring
- `demo` — safe fallback for local development when config is incomplete

Important limitation right now:

- `Particle` / `Magic` auth and real chain abstraction are not implemented yet. Web3 currently runs in `WEB3_PROVIDER_MODE=demo` unless a real provider is added.

---

## 🏗️ Architecture

Hexagonal (ports & adapters). The domain logic is pure — no SDKs, no React, no fetch. Every external service is an interchangeable adapter.

```
┌─────────────────────────────────────┐
│  apps/web (Next.js)  apps/api (Hono)│
└──────────────────┬──────────────────┘
                   │
      ┌────────────▼────────────┐
      │   packages/domain       │  ← pure logic, zero deps
      └────────────┬────────────┘
                   │
   ┌───────────────┼───────────────┐
   ▼               ▼               ▼
infra-offramp   infra-web3      infra-db
(Bitrefill,     (Particle,      (Drizzle,
 Reloadly)      Magic, ZD,       Postgres)
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
cp .env.example .env       # fill in your API keys
docker compose up -d        # start Postgres
pnpm db:migrate
pnpm dev
```

### Required API keys
See [`.env.example`](./.env.example) for the full list. Core providers:
- **Bitrefill** — off-ramp (gift cards, top-ups) → bitrefill.com/account/developers
- **Magic** — embedded wallet → magic.link/dashboard
- **Particle** — Universal Accounts → dashboard.particle.network

---

## 📋 Commands

```bash
pnpm dev          # start all dev servers
pnpm typecheck    # TypeScript across all packages
pnpm test         # Vitest across all packages
pnpm lint         # ESLint across all packages
pnpm db:migrate   # run Drizzle migrations
pnpm build        # build all packages
```

---

## 🛠️ Tech stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Backend | Hono |
| Frontend | Next.js 15 (App Router) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| Web3 | Particle UA + Magic + ZeroDev SRA + Openfort (via adapters) |
| AI / LLM | Gemini (`@google/genai`) — function calling, structured output |

---

## 📚 Documentation

- [`AGENTS.md`](./AGENTS.md) — Start here (for agents and contributors)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Full technical design
- [`docs/PROVIDERS.md`](./docs/PROVIDERS.md) — API reference for all integrations
- [`docs/HACKATHON_INTEL.md`](./docs/HACKATHON_INTEL.md) — Competitive analysis
- [`docs/DEVELOPMENT_PLAN.md`](./docs/DEVELOPMENT_PLAN.md) — 10-day execution plan
- [`docs/HANDOFF.md`](./docs/HANDOFF.md) — Current implementation snapshot and the next recommended continuation point

---

## 📄 License

Private — built for UXmaxx Hackathon. All rights reserved.
