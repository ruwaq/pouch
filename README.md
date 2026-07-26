<div align="center">

# 🫛 Pouch

### Talk to your money. It cashes out anywhere.

**An AI agent with real wallet access that manages your crypto, executes on-chain transactions, and converts blockchain assets into real-world value — through a single conversation.**

</div>

<div align="center">

[**▶ Watch Demo Video**](https://youtu.be/RJGABnBTd9g) &nbsp;·&nbsp; [**🌐 Try Live App**](https://pouch-orpin.vercel.app) &nbsp;·&nbsp; [**📊 Presentation Deck**](https://canva.link/pouch) &nbsp;·&nbsp; [**💻 Source Code**](https://github.com/ruwaq/pouch)

</div>

<div align="center">

<a href="https://youtu.be/RJGABnBTd9g">
  <img src="https://img.youtube.com/vi/RJGABnBTd9g/maxresdefault.jpg" alt="Pouch Demo Video" width="720" />
</a>
*Click the image above or [watch on YouTube](https://youtu.be/RJGABnBTd9g)*

</div>

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js_15-000?style=flat&logo=next.js&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?style=flat&logo=hono&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_3.6_Flash-4285F4?style=flat&logo=google&logoColor=white)
![Arbitrum](https://img.shields.io/badge/Arbitrum-28A0F0?style=flat&logo=arbitrum&logoColor=white)
![Particle](https://img.shields.io/badge/Particle_EIP--7702-6750F2?style=flat)
![Openfort](https://img.shields.io/badge/Openfort_Gasless-FF6B35?style=flat)
![Magic](https://img.shields.io/badge/Magic_Wallet-6851FF?style=flat)
![TypeScript](https://img.shields.io/badge/TypeScript_5.8-3178C6?style=flat&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-888)

</div>

---

## The Thesis: AI Is the New Blockchain Interface

We are entering a **new era where AI and blockchain converge**. For the past decade, the wallet has been the primary interface for crypto — and it's broken. Wallets force humans to understand chains, gas tokens, slippage, bridges, and provider APIs. Every transaction requires manual verification, signing popups, and context-switching between apps. Users click "confirm" on interfaces they don't understand.

**We believe AI agents are the correct interface layer for blockchain**, and Pouch is proof of this thesis.

### Why AI as the Blockchain Mediator

**1. Safer execution through programmatic verification.**
Humans skim popups and click confirm. An AI agent runs *deterministic security checks, spending policies, and risk scoring* before every on-chain action. Pouch evaluates amount limits, category allowlists, confirmation thresholds, and provider verification — all programmatically — before any transaction is signed. The result is a risk score (0-100) with a clear ALLOW / WARN / BLOCK verdict.

**2. Full wallet management by the agent.**
AI agents can hold, send, receive, swap, and consolidate crypto assets autonomously. Pouch doesn't just *tell* you what to do — it **operates** the wallet. It reads multi-chain balances via Particle UA (EIP-7702), consolidates funds across Arbitrum, Base, and Polygon, funds gas through Openfort sponsorship, swaps tokens on Uniswap V3, and settles payments to providers — all without the user ever touching a wallet interface.

**3. Zero user-facing complexity.**
Gas sponsorship, cross-chain consolidation, and transaction signing happen server-side through agent wallets. The user never sees a wallet popup, a chain selector, or a gas cost. The AI handles the entire pipeline from natural language intent to real-world delivery — a gift card code, a mobile top-up, a travel eSIM.

**4. Composable intelligence across protocols.**
A single conversation turn orchestrates 5+ protocols: Gemini parses intent → SecurityChecker scores risk → OffRampRouter finds cheapest provider → Particle UA consolidates cross-chain → Openfort sponsors gas → Bitrefill delivers the product. The agent is the glue between protocols that would otherwise require the user to navigate 5 different dApps.

### The Core Insight

> **The wallet shouldn't be an app the user operates. The wallet should be a capability the AI manages.**
>
> Blockchain is the settlement layer. AI is the interface. The user just talks.

---

## What Pouch Does

Pouch is a **conversational AI agent** that manages a multi-chain crypto wallet and executes real transactions on behalf of the user. The user types natural language — the agent handles everything on-chain.

### Core Capabilities

| Capability | What the user says | What the agent does |
|---|---|---|
| **🎁 Cash Out** | *"Cash out $50 to Amazon"* | Reads unified balance → security check → routes to cheapest provider → creates order → funds agent wallet cross-chain → pays gaslessly → delivers gift card code |
| **💰 Check Balance** | *"Show my balance"* | Queries unified balance across Arbitrum, Base, Polygon via Particle UA (EIP-7702) — shows per-asset, per-chain, per-wallet breakdown |
| **💸 Send** | *"Send 5 ARB to Wallet 3"* | Validates balances → checks gas availability → auto-funds gas via Openfort → executes real on-chain transfer with receipt |
| **🔄 Swap** | *"Swap 1 ARB for ETH"* | Validates swap direction → approves Uniswap V3 router → executes `exactInputSingle` → unwraps WETH → delivers ETH for gas |
| **⛽ Fund Gas** | *"Fund gas"* | Openfort agent wallet sends ETH to user's wallet at zero cost (policy-sponsored gas) |
| **🔍 Search** | *"Show me gift cards under $50"* | Queries Bitrefill catalog (8,000+ brands), returns filtered products with pricing |
| **📚 Help** | *"What is chain abstraction?"* | Educational replies about EIP-7702, gas sponsorship, security policies, supported chains |

### Supported Products

Via the **Bitrefill** adapter (8,000+ brands):

- **🎁 Gift cards** — Amazon, Uber, Steam, Apple, Google Play, Airbnb, Netflix, Spotify, and thousands more
- **📱 Mobile top-ups** — Carrier top-ups in 160+ countries
- **🌍 eSIMs** — Travel data plans for 190+ countries
- **💳 Bill payments** — Utility and service payments

---

## 🔍 How Pouch Works

### The Full Pipeline: "Cash out $50 to Amazon"

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  1. INTENT PARSING                                                  │
│     Gemini 3.6 Flash function calling → structured CashOutIntent   │
│     { action: "cash_out", category: "giftcard",                    │
│       brand: "Amazon", amount: 50 }                                │
│     Fallback: bilingual regex parser (EN+ES) — works offline       │
│                                                                     │
│  2. SECURITY CHECK                                                  │
│     SecurityChecker runs 4 deterministic checks:                   │
│     • Amount limit — BLOCK if >$500, WARN if >$200                │
│     • Category allowlist — giftcard ✓                              │
│     • Confirmation threshold — requires approval above $100        │
│     • Provider verification — Bitrefill ✓                          │
│     → Verdict: ALLOW | WARN | BLOCK (risk score 0-100)            │
│                                                                     │
│  3. ROUTING                                                         │
│     OffRampRouter filters providers by category                    │
│     → Promise.allSettled: search + quote on each provider          │
│     → CheapestStrategy picks lowest paymentAmount                  │
│     → Winner: Bitrefill ($50.00 USDC on Arbitrum)                 │
│                                                                     │
│  4. ORDER CREATION                                                  │
│     BitrefillAdapter.createInvoice() → Bitrefill API               │
│     → Payment method: USDC on Arbitrum (chain 42161)               │
│     → Webhook URL for asynchronous delivery confirmation            │
│     → Order persisted to PostgreSQL (or in-memory for demo)        │
│                                                                     │
│  5. CROSS-CHAIN CONSOLIDATION (if needed)                           │
│     If balance is fragmented across Arbitrum/Base/Polygon:         │
│     Particle UA (EIP-7702) bundles cross-chain transfers           │
│     into a single smart account operation — user sees one balance  │
│                                                                     │
│  6. PAYMENT EXECUTION (two paths)                                   │
│     ┌──────────────────────────────────────────────────────┐      │
│     │ PATH A — Agent Wallet (gasless via Openfort)         │      │
│     │  User UA → funds Openfort agent wallet →             │      │
│     │  Agent settles ERC-20 to Bitrefill gaslessly         │      │
│     │  via fee sponsorship policy → NO popup, NO gas       │      │
│     ├──────────────────────────────────────────────────────┤      │
│     │ PATH B — Direct UA Payment                           │      │
│     │  User UA pays Bitrefill payment address directly     │      │
│     │  via Particle smart account with blind signatures    │      │
│     └──────────────────────────────────────────────────────┘      │
│                                                                     │
│  7. DELIVERY                                                        │
│     Bitrefill webhook → HMAC-SHA256 verified (timing-safe) →      │
│     order status updated → redemption code delivered inline         │
│     → User receives: AMZN-XXXX-XXXX-XXXX                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The Agent Trace

Every execution step is rendered as a transparent inline trace. The user sees exactly what the agent is doing — not as opaque wallet popups, but as a readable timeline with educational context:

```
User:  "Cash out $50 to Amazon"

🤖 Pouch:
  ● Reading unified balance       ✓  [3 assets, $55 total — Arbitrum, Base, Polygon]
  ● Security check                ✓  [ALLOW — risk 15/100 — giftcard approved]
  ● Finding best provider         ✓  [cheapest: Bitrefill — $50.00 USDC]
  ● Creating order                ✓  [order #BR-8291 — webhook registered]
  ● Funding agent wallet          ✓  [UA 7702 — cross-chain consolidation]
  ● Paid via Openfort gasless     ✓  [NO POPUP — gas sponsored by policy]
  ✅ Amazon gift card delivered:  AMZN-XXXX-XXXX-XXXX
```

---

## 🖥️ The Interface

### Two-Panel Dashboard

Pouch renders a **split-screen experience** — conversation on the left, live system state on the right.

**Left panel — Chat:**
- Natural language input with smart suggestion buttons
- Agent responses with inline trace timeline (every step visible)
- **Confirmation cards** for actions requiring approval (cash-out, send, swap, fund gas)
  - Shows security verdict, amount, balance snapshot, plan summary
  - Confirm / Cancel buttons that feed back into the chat
- **Receipt cards** with redemption codes, tx hashes, block explorer links, and educational footers
- **Balance pill** showing unified multi-chain balance with per-asset dropdown (click to expand)
- **Zero Popup badge** — counts how many transactions were executed without a single signing popup

**Right panel — Live Dashboard:**
- **Demo Flow** — Interactive 6-step guided demo that auto-executes and auto-confirms
- **Wallet Panel** — Real-time balance grouped by wallet with explorer links (polls every 15s)
- **Live Trace** — Real-time agent execution trace with tech badges (NO POPUP, UA 7702, SHIELD)
- **Bounty Panel** — Expandable tech stack cards with "Try it" buttons per protocol
- **Chain Panel** — Educational info about supported chains and EIP-7702

### Using the App

**1. Open the app** → [pouch-orpin.vercel.app](https://pouch-orpin.vercel.app)

**2. Demo mode** → With `DEMO_MODE=true` and a funded `PRIVATE_KEY` set, Pouch runs entirely on real Arbitrum funds. No signup needed; the agent acts on the funded wallet's behalf.

**3. Type anything natural:**
   - *"Cash out $25 to Amazon"* — see the full agent trace
   - *"Show my balance"* — real on-chain balances across your Arbitrum wallets via RPC
   - *"Swap 1 ARB for ETH"* — real Uniswap V3 swap on Arbitrum
   - *"Send 5 ARB to Wallet 3"* — real on-chain transfer between your wallets
   - *"Fund gas"* — real Openfort gas sponsorship ($0 to you)
   - *"What is chain abstraction?"* — educational response about EIP-7702

**4. Or use the Demo Flow panel** → 6 independent steps. Click any one (balance → chain abstraction → fund gas → swap → send → cash out), verify the real transaction on Arbiscan, then click the next at your own pace.

> **Every number, balance, and transaction is real on Arbitrum.** The only demo is the final gift-card payment itself (no real gift-card provider integrated yet). Set a funded `PRIVATE_KEY` in `.env` — the app fails loud without it.

---

## 🏗️ Architecture

### Hexagonal Architecture (Ports & Adapters)

The domain layer is **pure** — zero external dependencies, no SDKs, no React, no fetch. Every external service is a swappable adapter behind a port interface. Change the LLM, the wallet provider, the offramp, or the database — without touching a single line of domain logic.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  apps/web (Next.js 15)                apps/api (Hono)               │
│  React 19 · Tailwind v4               Edge-ready · ESM              │
│  Chat · Dashboard · Receipts          Auth · Chat · Balance · Hooks │
│                                                                      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                ┌────────────▼────────────┐
                │                         │
                │    @pouch/domain        │  ← PURE LOGIC · ZERO DEPS
                │                         │
                │  CashOutExecutor        │  Orchestrates the full pipeline
                │  OffRampRouter          │  CheapestStrategy provider routing
                │  IntentParser           │  Bilingual regex (EN+ES), 9 intents
                │  SecurityChecker        │  Policy-based risk scoring (0-100)
                │  TraceRecorder          │  Step-by-step execution trace
                │  ReplyStrategy          │  Response generation port
                │                         │
                └────────────┬────────────┘
                             │
          ┌──────────────┬───┴───┬──────────────┐
          ▼              ▼       ▼              ▼
    @pouch/         @pouch/   @pouch/       @pouch/
    infra-ai        infra-    infra-        infra-
                    offramp   web3          db
    ──────────      ────────  ──────────    ──────────
    Gemini 3.6      Bitrefill Particle UA   Drizzle
    Flash           (quotes,  (EIP-7702)    ORM +
    (function       orders,   Magic         PostgreSQL
     calling +       webhooks)(embedded     (5 tables)
     regex                    wallet)
    fallback)                 Openfort
                              (agent
                               gasless
                               wallet)
```

### Port Interfaces

Every infrastructure adapter implements these domain interfaces:

```typescript
interface OffRampProvider {          // Implemented by: Bitrefill
  searchProducts(query, options): Product[]
  getQuote(product, amount): Quote
  createOrder(request): Order
  verifyWebhook(body, headers): WebhookEvent
}

interface AccountProvider {          // Implemented by: Particle UA / PrivateKey / Demo
  getUnifiedBalance(userId): Balance
  consolidate(userId, chainId, token): TxResult
  sendPayment(params): SendReceipt
  swap(params): SwapResult
}

interface AgentWalletPort {          // Implemented by: Openfort
  getAddress(): string
  settlePayment(to, token, amount): TxResult  // gasless ERC-20
  sendEth(to, amount): TxResult               // gas sponsorship
}

interface OrderRepository {          // Implemented by: Drizzle/Postgres or in-memory
  save(order): void
  findById(id, userId?): Order
  updateStatus(id, status, updates?): void
}

interface SecurityPolicyPort {       // Implemented by: agentRules table
  getPolicy(userId): SpendingPolicy
}
```

---

## 🛠️ Tech Stack & Protocols

### AI Layer

| Component | Technology | How Pouch Uses It |
|-----------|-----------|-------------------|
| **LLM** | **Gemini 3.6 Flash** | Intent parsing via function calling. 7 tool declarations (`cash_out`, `check_balance`, `search_products`, `help`, `send`, `swap`, `off_topic`). Temperature 0.7, 15s timeout, exponential backoff on 429/503. Skips `thought: true` parts from thinking models. Multi-turn conversation history. |
| **Intent Parser** | Gemini + **regex fallback** | LLM parses natural language into `CashOutIntent`. Bilingual regex cascade handles 9 intent types (help, off-topic, swap, fund-gas, send, unsupported-action, balance, search, cash-out). **Works fully offline** without any API key. |
| **Reply Strategy** | Gemini text + **template fallback** | Scenario-specific LLM replies with conversation history. 14 deterministic templates as fallback (greeting, balance, search, confirmation, success, error, help, send, swap, fund-gas, etc.). |
| **System Prompt** | Custom bilingual personality | Warm, concise, encouraging. Full educational knowledge base: chain abstraction, EIP-7702, gas sponsorship, security policies, supported chains/products. |

### Blockchain Layer

| Component | Technology | How Pouch Uses It |
|-----------|-----------|-------------------|
| **Universal Accounts** | **Particle Network** (EIP-7702) | Cross-chain balance consolidation. ONE balance across Arbitrum, Base, Polygon. EIP-7702 delegates an EOA to a smart account — no bridge UI, no chain switching. `ua.getPrimaryAssets()` for unified balance; `consolidate()` for cross-chain bundling. |
| **Embedded Wallet** | **Magic Labs** (blind signatures) | Passwordless wallet via email. Zero signing popups — blind signatures mean every transaction is signed invisibly. No MetaMask, no browser extension. |
| **Agent Wallet** | **Openfort** (policy sponsorship) | Backend wallet that pays providers for the user. Fee sponsorship policies cover gas. `settlePayment()` sends ERC-20 gaslessly; `sendEth()` sponsors user gas. User never holds gas tokens. |
| **DEX** | **Uniswap V3** (Arbitrum) | ARB → WETH via `exactInputSingle` (0.3% pool, 5% slippage, 30-min deadline). WETH → ETH unwrap. Router: `0xE592427A...`. |
| **Chains** | **Arbitrum One** (42161) · **Base** (8453) | Primary settlement on Arbitrum. Base ready. Tokens: USDC, ARB, USDT, ETH, WETH. |

### Application Layer

| Component | Technology | Details |
|-----------|-----------|---------|
| **Monorepo** | **Turborepo** + pnpm 10 | 8 packages, parallel builds, shared configs |
| **Frontend** | **Next.js 15** (App Router, React 19, Tailwind v4) | Two-panel dashboard, confirmation cards, receipt cards, trace timeline |
| **Backend** | **Hono** (Node.js, edge-ready, ESM) | Rate limiting (30 req/60s), JWT auth with demo fallback, 6 route groups |
| **Database** | **PostgreSQL** + **Drizzle ORM** | 5 tables (users, orders, balanceSnapshots, webhookEvents, agentRules). Hybrid repos for demo mode. |
| **Testing** | **Vitest** | 208+ tests across all packages |
| **Deployment** | **Vercel** | Next.js framework, auto-deploy |

### Security

| Mechanism | Implementation |
|-----------|---------------|
| **Spending policies** | Per-user: warn ($200), block ($500), category allowlists, confirmation thresholds |
| **Risk scoring** | 0-100 score, 4 checks: amount limit, category, confirmation, provider verification |
| **Verdicts** | ALLOW / WARN / BLOCK — shown in confirmation cards with color-coded badges |
| **Webhook auth** | HMAC-SHA256 with timing-safe comparison |
| **Wallet whitelist** | Sends restricted to known/imported wallets only — external addresses blocked |
| **Gas cap** | Max 50 gwei to prevent MEV exploitation |
| **Rate limiting** | 30 req/60s per IP, in-memory with stale entry cleanup |
| **JWT auth** | HS256, 24h expiry, httpOnly cookies, refuses insecure defaults in production |
| **Audit** | 6 CRITICAL findings fixed (C1-C6). 10 HIGH + 13 MEDIUM/LOW tracked |

---

## 📁 Project Structure

```
pouch/
├── apps/
│   ├── web/                          # Next.js 15 frontend
│   │   └── src/
│   │       ├── app/                  # App Router (page.tsx, layout.tsx)
│   │       ├── components/
│   │       │   ├── chat/             # ChatView, AgentTurn, 8 card types
│   │       │   │   ├── ConfirmationCard.tsx     # Cash-out approval
│   │       │   │   ├── SendConfirmationCard.tsx # Transfer approval
│   │       │   │   ├── SwapConfirmationCard.tsx # Swap approval
│   │       │   │   ├── FundGasConfirmationCard.tsx # Gas funding
│   │       │   │   ├── SendReceiptCard.tsx      # Transfer receipt
│   │       │   │   ├── SwapReceiptCard.tsx      # Swap receipt
│   │       │   │   ├── FundGasReceiptCard.tsx   # Gas funding receipt
│   │       │   │   ├── TraceTimeline.tsx        # Execution trace
│   │       │   │   ├── BalancePill.tsx          # Unified balance
│   │       │   │   └── SecurityBadge.tsx        # Risk level badge
│   │       │   ├── dashboard/        # Live dashboard panels
│   │       │   │   ├── DashboardLayout.tsx      # Two-panel layout
│   │       │   │   ├── DemoFlow.tsx             # 6-step guided demo
│   │       │   │   ├── WalletPanel.tsx          # Real-time balances
│   │       │   │   ├── LiveTracePanel.tsx       # Agent trace viz
│   │       │   │   ├── BountyPanel.tsx          # Tech stack cards
│   │       │   │   └── ChainPanel.tsx           # Chain education
│   │       │   └── landing/          # Landing page + Magic login
│   │       └── lib/                  # API client, explorer, Magic SDK
│   │
│   └── api/                          # Hono backend
│       └── src/
│           ├── routes/               # agent, auth, balance, orders, webhooks
│           ├── services/
│           │   └── agent-chat-service.ts  # 1254 lines — the brain
│           ├── middleware/            # JWT auth + demo fallback
│           ├── bootstrap/            # DI container + hybrid repos
│           └── support/              # In-memory repos for demo
│
├── packages/
│   ├── domain/                       # PURE domain — ZERO deps
│   │   └── src/
│   │       ├── types.ts              # All entities + port interfaces
│   │       ├── executor.ts           # CashOutExecutor (orchestrator)
│   │       ├── router.ts             # OffRampRouter (CheapestStrategy)
│   │       ├── intent-parser.ts      # Regex parser (bilingual)
│   │       ├── security.ts           # SecurityChecker (risk scoring)
│   │       ├── trace.ts              # TraceRecorder (step timeline)
│   │       └── errors.ts             # Domain error union
│   │
│   ├── infra-ai/                     # Gemini LLM adapter
│   │   └── src/
│   │       ├── gemini-provider.ts    # REST client (retry, timeout, think-skip)
│   │       ├── llm-intent-parser.ts  # Function calling → CashOutIntent
│   │       ├── llm-reply-strategy.ts # Scenario replies + templates
│   │       ├── llm-tools.ts          # 7 tool declarations
│   │       ├── system-prompt.ts      # Bilingual personality + knowledge
│   │       └── factory.ts            # Composition root
│   │
│   ├── infra-offramp/                # Bitrefill adapter
│   │   └── src/bitrefill/
│   │       ├── adapter.ts            # OffRampProvider impl
│   │       ├── client.ts             # HTTP client (Bearer auth)
│   │       ├── mapper.ts             # DTO → domain mapping
│   │       └── types.ts              # Bitrefill API DTOs
│   │
│   ├── infra-web3/                   # Blockchain infra
│   │   └── src/
│   │       ├── particle/             # Particle UA (EIP-7702)
│   │       ├── private-key/          # ethers.js (real on-chain)
│   │       ├── openfort/             # Agent wallet (gasless)
│   │       ├── demo-account-provider.ts
│   │       └── factory.ts            # Mode: demo/particle/private-key
│   │
│   ├── infra-db/                     # PostgreSQL + Drizzle
│   │   └── src/
│   │       ├── schema.ts             # 5 tables
│   │       └── repositories/         # Order, User, Webhook repos
│   │
│   └── shared/                       # Config, logging, HTTP helpers
│
├── turbo.json
├── vercel.json
└── package.json                      # pnpm 10, TS 5.8, Vitest 3
```

---

## 🚀 Quick Start

### Run in Demo Mode (real Arbitrum funds, no signup)

```bash
git clone https://github.com/ruwaq/pouch.git
cd pouch
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000) — Pouch starts in **demo mode** automatically.

**Try these commands in the chat:**

| Command | What happens |
|---------|-------------|
| *"Cash out $25 to Amazon"* | Full agent trace: balance → security → routing → order → payment → delivery |
| *"Show my balance"* | Real unified balance across your Arbitrum wallets (via RPC) |
| *"Swap 1 ARB for ETH"* | Real Uniswap V3 swap on Arbitrum with confirmation card |
| *"Send 5 ARB to Wallet 3"* | Real on-chain transfer with receipt + Arbiscan link |
| *"Fund gas"* | Real Openfort gas sponsorship ($0 to you) |
| *"What is chain abstraction?"* | Educational response about EIP-7702 and Particle UA |
| *"Show me gift cards under $50"* | Product catalog from Bitrefill |

**Or click any of the 6 independent steps** in the Demo Flow panel — each runs on its own and verifies on Arbiscan.

### Run with Real On-Chain Execution

```bash
cp .env.example .env
docker compose up -d        # start PostgreSQL
pnpm db:migrate             # run Drizzle migrations
pnpm dev
```

### Environment Variables

| Variable | Provider | Enables |
|----------|----------|---------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) | LLM intent parsing (regex fallback works without it) |
| `BITREFILL_API_KEY` | [Bitrefill](https://bitrefill.com) | Real gift card orders (8,000+ brands) |
| `MAGIC_PUBLISHABLE_KEY` + `MAGIC_SECRET_KEY` | [Magic Labs](https://magic.link) | Embedded wallet with blind signatures |
| `PARTICLE_PROJECT_ID` + `PARTICLE_CLIENT_KEY` + `PARTICLE_APP_ID` | [Particle Network](https://particle.network) | Universal Account cross-chain balance |
| `OPENFORT_SECRET_KEY` + `OPENFORT_WALLET_SECRET` + `OPENFORT_FEE_SPONSORSHIP_ID` | [Openfort](https://openfort.xyz) | Gasless agent-wallet settlement |
| `PRIVATE_KEY` | Any EVM wallet | Real on-chain execution (balances, swaps, transfers) |
| `DATABASE_URL` | Supabase or any Postgres | Order persistence (in-memory fallback in demo) |
| `JWT_SECRET` | — | Session auth (must not be default in production) |

### Commands

```bash
pnpm dev          # API (:3001) + web (:3000) dev servers
pnpm build        # production build (all 8 packages)
pnpm typecheck    # TypeScript across monorepo (8/8 passing)
pnpm test         # 208+ Vitest suites
pnpm lint         # ESLint across all packages
pnpm db:migrate   # run Drizzle ORM migrations
```

---

## 🔗 Links

| Resource | URL |
|----------|-----|
| **Live Demo** | [pouch-orpin.vercel.app](https://pouch-orpin.vercel.app) |
| **Demo Video** | [youtu.be/RJGABnBTd9g](https://youtu.be/RJGABnBTd9g) |
| **Presentation Deck** | [canva.link/pouch](https://canva.link/pouch) |
| **Source Code** | [github.com/ruwaq/pouch](https://github.com/ruwaq/pouch) |

---

<div align="center">

### Built for the OKX Hackathon 2026

**AI is the wallet. Conversation is the interface. Blockchain is the settlement layer.**

[▶ Watch Demo](https://youtu.be/RJGABnBTd9g) &nbsp;·&nbsp; [🌐 Try App](https://pouch-orpin.vercel.app) &nbsp;·&nbsp; [📊 Deck](https://canva.link/pouch)

</div>
