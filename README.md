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
