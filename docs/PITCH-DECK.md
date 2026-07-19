# Pouch — Pitch Deck

> **Talk to your money. It cashes out anywhere.**
> UXmaxx Hackathon 2026 | [pouch-orpin.vercel.app](https://pouch-orpin.vercel.app)

---

## Slide 1: The Problem

### Crypto off-ramping is broken

```
User wants: "I have crypto. I want an Amazon gift card."

What they get:
  ❌ Which chain? (Arbitrum? Base? Polygon?)
  ❌ Which wallet? (MetaMask? Phantom? Rabby?)
  ❌ Bridge first? (7-day wait, $15 gas)
  ❌ Sign this popup... and this one... and this one
  ❌ "Transaction failed: insufficient gas"
  ❌ Find an exchange → KYC → wait 3 days → withdraw
```

**Crypto has $3T in value locked. Cashing out is still a nightmare.**

---

## Slide 2: The Solution

### Pouch — AI Cashout Agent

```
User: "Cash out $50 to Amazon"

Pouch (30 seconds, zero friction):
  📊 Balance: $55 across Arbitrum + Base
  🔄 Consolidating via Universal Account [EIP-7702]
  🔍 Best provider: Bitrefill $50.00
  💰 Paid via Openfort gasless [NO POPUP]
  🛡️ Security: ✅ SAFE
  🎁 Amazon gift card: AMZN-XXXX-XXXX
```

**The user just talks. The agent does everything. No wallets. No gas. No chains.**

---

## Slide 3: How It Works

### 5 AI Agents Working Together

```
┌──────────────────────────────────────────────────┐
│  User: "Cash out $50 to Amazon"                   │
└────────────────────┬─────────────────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │  🤖 Intent Parser (Gemini AI)   │  ← NL → structured intent
    │  "cash_out: $50, Amazon"        │     Regex fallback always works
    └────────────────┬────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │  💰 Balance Agent (Particle UA) │  ← Cross-chain unified balance
    │  $45 USDC Arb + $30 USDC Base   │     EIP-7702, no user action
    └────────────────┬────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │  🔍 Routing Agent (Domain)      │  ← Compare providers
    │  Bitrefill: $50.00              │     Extensible: +1 provider = 1 file
    └────────────────┬────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │  💸 Settlement Agent (Openfort)  │  ← Gasless payment
    │  Backend wallet + feeSponsorship │     [NO POPUP] zero user signatures
    └────────────────┬────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │  🎁 Delivery Agent (Bitrefill)   │  ← Purchase + redeem
    │  Amazon gift card: AMZN-XXXX     │     8,000+ brands, idempotent
    └──────────────────────────────────┘
```

---

## Slide 4: The Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Chain Abstraction** | Particle UA (EIP-7702) | Cross-chain consolidation, one balance |
| **Embedded Wallet** | Magic Labs | Blind signatures, zero popups |
| **Gas Sponsorship** | Openfort | Agent wallet pays, user never sees gas |
| **AI / LLM** | Gemini 3.5 Flash | Natural language → structured intent |
| **Settlement** | Arbitrum One | Fast, cheap, reliable |
| **Off-ramp** | Bitrefill API v2 | 8,000+ brands, gift cards + top-ups |
| **Frontend** | Next.js 15 + Tailwind v4 | Chat UI, agent trace, responsive |
| **Backend** | Hono + Turborepo | 7 packages, edge-ready |
| **Security** | AgentShield-inspired Firewall | 4 risk levels, pre-execution checks |

---

## Slide 5: What Makes Pouch Different

### Blue Ocean — 0 competitors in off-ramp niche

Research: 23 hackathon projects analyzed. **Zero** doing crypto → real-world value.

| Feature | Pouch | Competitors |
|---------|-------|-------------|
| Natural language interface | ✅ | ❌ |
| Cross-chain consolidation | ✅ EIP-7702 | ❌ |
| Zero popups / blind signatures | ✅ Magic | ❌ |
| Gasless settlement | ✅ Openfort | ❌ |
| Real off-ramp (gift cards) | ✅ Bitrefill | ❌ |
| Multi-turn confirmation | ✅ | ❌ |
| Security firewall | ✅ 4 levels | ❌ |
| AI conversational agent | ✅ Gemini | ❌ |

---

## Slide 6: The Demo

### What judges see in 30 seconds

```
1. Open pouch-orpin.vercel.app
2. Login with Magic (email → zero seed phrase)
3. Type: "Cash out $25 to Amazon"

Agent responds:
  ● Reading unified balance       ✓  [$45 USDC Arb, $30 USDC Base, $25 ETH]
  ● Consolidating via UA          ✓  [EIP-7702 cross-chain]
  ● Finding best provider         ✓  [Bitrefill $25.00]
  ● Security check                ✓  [🟢 SAFE — under $100]
  ● Funding agent wallet          ✓  [UA 7702]
  ● Paid via Openfort gasless     ✓  [NO POPUP]
  ✅ Amazon gift card: [AMZN-XXXX-XXXX]

Zero popups. Zero gas visible. Zero "which chain?".
```

---

## Slide 7: Bounties Targeted

| Track | Prize | Status |
|-------|-------|--------|
| 🏆 **Universal Accounts Track** | $1,500 - $2,500 | EIP-7702 consolidation |
| 🏆 **General Track → Openfort** | $100 | Gas sponsorship |
| 💰 **Arbitrum Bounty** | $2,000 | Settlement on Arbitrum One |
| 💰 **Magic Labs Bonus** | $500 | Embedded wallet + blind signatures |

**Total potential: $4,100 - $5,100**

---

## Slide 8: Why Pouch Wins

### UA Track criteria (40% UX, 30% UA/7702, 20% adoption, 10% tech)

| Criterion | How Pouch delivers |
|-----------|-------------------|
| **UX Excellence (40%)** | Chat interface, zero popups, invisible chains, natural language |
| **UA + EIP-7702 (30%)** | Intrinsic to the flow — without 7702, multi-chain consolidation is impossible |
| **Adoption Potential (20%)** | Off-ramp is crypto's #1 friction. 8,000+ brands. Extensible to any provider. |
| **Technical Quality (10%)** | 148 tests, 7 packages, hexagonal architecture, Zod validation, CI/CD |

### Arbitrum criteria (30% UX, 30% creativity, 20% adoption, 20% execution)

Pouch runs on Arbitrum as the **invisible settlement layer**. The user never knows — they just talk.

---

## Slide 9: Architecture

```
apps/
  web/  (Next.js 15)     ← Chat UI + Magic auth + Agent Trace
  api/  (Hono)           ← POST /agent/chat, /balance, /orders

packages/
  domain/      ← Pure logic: CashOutExecutor, OffRampRouter, SecurityChecker
  infra-ai/    ← Gemini provider, intent parser, reply strategy
  infra-web3/  ← Particle UA, Magic, Openfort adapters
  infra-offramp/ ← Bitrefill adapter
  infra-db/    ← Drizzle ORM + PostgreSQL
  shared/      ← Config (Zod), logger, HTTP, Result types

148 tests · 7 packages · Zero SDKs in domain layer
```

---

## Slide 10: Live Demo + Links

| Resource | URL |
|----------|-----|
| 🎬 **Live Demo** | [pouch-orpin.vercel.app](https://pouch-orpin.vercel.app) |
| 💻 **GitHub** | [github.com/ruwaq/pouch](https://github.com/ruwaq/pouch) |
| 📖 **Architecture** | [docs/ARCHITECTURE.md](https://github.com/ruwaq/pouch/blob/main/docs/ARCHITECTURE.md) |
| 📋 **Bounty Mapping** | [docs/SUBMISSION.md](https://github.com/ruwaq/pouch/blob/main/docs/SUBMISSION.md) |

---

## Thank You

### Pouch — Talk to your money. It cashes out anywhere.

Built for UXmaxx Hackathon 2026 by Ande