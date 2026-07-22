# 🫛 Pouch

> **Talk to your money. It cashes out anywhere.**

Pouch is an AI-powered cashout agent that converts your crypto into real-world value — gift cards, mobile top-ups, eSIMs, and more — through a simple chat interface. No wallets, no gas, no chains. Just talk.

---

## ✨ Features

- **Conversational interface** — natural language to crypto cash-out. Gemini LLM with regex fallback (works with or without an API key).
- **Cross-chain consolidation** — funds across Arbitrum, Base, and Polygon unified via Particle Universal Accounts (EIP-7702). The user never sees chains or bridges.
- **Invisible UX** — Magic embedded wallet with blind signatures. Zero signing popups. Zero gas visible.
- **Agent wallet gasless settlement** — Openfort backend wallet pays providers gaslessly via policy + fee sponsorship.
- **Agent trace transparency** — every step visible inline: balance → route → order → fund agent → gasless pay → deliver.
- **Real off-ramp integration** — Bitrefill adapter with 8,000+ brands, quote pricing, and webhook verification.
- **Modular provider system** — add a new off-ramp provider in one file. Zero changes to domain logic, router, or frontend.

---

## 🎬 Demo

```
User:  "Cash out $50 to Amazon"

🤖 Pouch:
  ● Reading unified balance       ✓  [3 assets, $55 total]
  ● Finding best provider         ✓  [cheapest: Bitrefill]
  ● Creating order with Bitrefill ✓
  ● Funding agent wallet          ✓  [UA 7702 cross-chain]
  ● Paid via Openfort gasless     ✓  [NO POPUP — gas sponsored]
  ✅ Amazon gift card: [AMZN-XXXX-XXXX]
```

**Zero popups. Zero gas. Zero "which chain?".** The user talks. Pouch does the rest.

---

## 🏗️ Architecture

Hexagonal (ports & adapters). Domain logic is pure — no SDKs, no React, no fetch. Every external service is an interchangeable adapter.

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

📖 Full design: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

---

## 🚀 Quick start

### Prerequisites
- Node.js 22+
- pnpm 10+
- Docker (for local Postgres, optional)

### Setup
```bash
pnpm install
cp .env.example .env       # fill in your API keys
docker compose up -d        # start Postgres (optional)
pnpm db:migrate             # run migrations (optional)
pnpm dev                    # start API (:3001) + web (:3000)
```

### Demo mode (no keys needed)
Without any env keys, Pouch runs in **demo mode**: simulated balances, simulated payments, regex intent parser. Open `http://localhost:3000` and type "Cash out $25 to Amazon". The full agent trace renders.

### Env checklist

| Variable | Provider | Required for |
|----------|----------|--------------|
| `BITREFILL_API_KEY` | Bitrefill | Real gift card quotes + orders |
| `MAGIC_PUBLISHABLE_KEY` + `MAGIC_SECRET_KEY` | Magic Labs | Real wallet auth (blind signatures) |
| `PARTICLE_PROJECT_ID` + `PARTICLE_CLIENT_KEY` + `PARTICLE_APP_ID` | Particle | Real UA balance + consolidation |
| `OPENFORT_SECRET_KEY` + `OPENFORT_WALLET_SECRET` + `OPENFORT_FEE_SPONSORSHIP_ID` | Openfort | Gasless agent-wallet settlement |
| `GEMINI_API_KEY` | Google | LLM conversational replies (regex fallback works without it) |
| `DATABASE_URL` | Supabase/Postgres | Order persistence (in-memory fallback in demo) |
| `JWT_SECRET` + `WEBHOOK_SECRET` | — | Auth + webhook verification |

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
| Frontend | Next.js 15 (App Router, Tailwind v4) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| Web3 | Particle UA (EIP-7702) + Magic (blind signatures) + Openfort (gas sponsorship) |
| AI / LLM | Gemini (`@google/genai`) — function calling, structured output |

---

## 📚 Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — Full technical design
- [`docs/PROVIDERS.md`](./docs/PROVIDERS.md) — API reference for all integrations

---

## 📄 License

MIT