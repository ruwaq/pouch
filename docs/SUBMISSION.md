# Pouch — Bounty Submission Mapping

> For UXmaxx Hackathon (Encode Club × Particle) and OKX AI Genesis Hackathon judges. This doc maps each bounty's criteria to where it's satisfied in the codebase and demo.

---

## 1. Universal Accounts Track ($1.5k–2.5k)

**Requirement:** Use Particle Universal Accounts (EIP-7702 mode) for chain abstraction.

| Criterion | Where |
|-----------|-------|
| UA integration | `packages/infra-web3/src/particle/universal-account.ts` — `ParticleAccountProvider` uses `@particle-network/universal-account-sdk@^2.0.3` with `useEIP7702: true` |
| EIP-7702 mode | `smartAccountOptions: { name: 'UNIVERSAL', version: UNIVERSAL_ACCOUNT_VERSION, useEIP7702: true }` |
| Cross-chain consolidation | `CashOutExecutor` consolidation step: `account.consolidate(userId, chainId, token)` → trace step `Consolidating via Universal Account [UA 7702]` |
| Unified balance | `GET /balance` → `ParticleAccountProvider.getUnifiedBalance()` → `ua.getPrimaryAssets()` |
| UX (40%) | Chat interface, blind signatures, trace shows the consolidation transparently |
| Demo artifact | Trace step `Funding agent wallet [UA 7702]` — visible in the chat UI |

---

## 2. Arbitrum ($2k)

**Requirement:** Build on Arbitrum.

| Criterion | Where |
|-----------|-------|
| Settlement chain = Arbitrum One | `SETTLEMENT_CHAIN_ID=42161` in `.env.example` + Zod config (`packages/shared/src/config.ts`) |
| Real Arbitrum tx (when configured) | Agent wallet settlement: `OpenfortAgentWallet.settlePayment({ chainId: 42161, ... })` — gasless ERC-20 transfer on Arbitrum |
| Openfort + Arbitrum | Openfort policy configured for Arbitrum (42161) + Base (8453); feeSponsorship `pay_for_user` |

---

## 3. Magic Labs ($500)

**Requirement:** Embedded wallet + blind signatures (zero popups).

| Criterion | Where |
|-----------|-------|
| Magic embedded wallet | `apps/web/src/lib/magic-client.ts` — `magic-sdk` + `@magic-ext/evm`, lazy singleton |
| Blind signature login | `loginWithEmail()` → Magic DID token → `/auth/callback` → server validates via `@magic-sdk/admin` → JWT cookie |
| Zero popups | The trace emphasizes `[NO POPUP]` badges; the header shows "N signatures · zero popups" counter (`ChatView.tsx` `ZeroPopupBadge`) |
| EIP-7702 signing | Magic signs the UA `rootHash` + 7702 auths in the browser (Phase 1 transaction planner seam: `apps/api/src/services/transaction-planner.ts`) |
| UX differentiator | User never sees a wallet, gas, chain, or signing popup — just a chat |

---

## 4. Openfort ($100)

**Requirement:** Agent backend wallet + gas sponsorship.

| Criterion | Where |
|-----------|-------|
| Agent backend wallet | `packages/infra-web3/src/openfort/openfort-provider.ts` — `OpenfortAgentWallet` implements `AgentWalletPort` |
| SDK | `@openfort/openfort-node@^0.10.8` — `accounts.evm.backend.create()` + `accounts.evm.backend.sendTransaction()` |
| Gas sponsorship | `sendTransaction({ ..., policy: feeSponsorshipId })` — policy + feeSponsorship (`pay_for_user`) linked in Openfort dashboard |
| EIP-7702 delegation | Automatic on first tx per chain (Openfort "Calibur" implementation) |
| Deferred ESM import | `createRealOpenfortClientFactory()` returns a lazy factory; the SDK `import()` runs on first `getAddress()`/`settlePayment()` call (same pattern as Particle fix) — demo mode never constructs the wallet |
| Domain port | `packages/domain/src/types.ts` `AgentWalletPort` — pure, no SDK |
| Two-step settlement trace | `CashOutExecutor`: `Funding agent wallet [UA 7702]` → `Paid via Openfort gasless [NO POPUP]` |
| Config fail-fast | `packages/infra-web3/src/factory.ts` `createAgentWallet()` — throws in production if OPENFORT_SECRET_KEY is set but WALLET_SECRET or FEE_SPONSORSHIP_ID is missing |
| Tests | `packages/infra-web3/__tests__/openfort-provider.test.ts` (7 tests, mocked SDK), `openfort-mapper.test.ts` (4), `agent-wallet-factory.test.ts` (5), `apps/api/src/bootstrap/create-runtime-app-services-agent-wallet.test.ts` (3), `packages/domain/__tests__/executor.test.ts` (3 new) |

### Openfort dashboard setup (manual gate, documented for reproducibility)
1. Create a project at openfort.io → Dashboard.
2. Enable backend wallets → get `WALLET_SECRET`.
3. Create a **policy** (chains: Base 8453 + Arbitrum 42161, rules: `sponsorEvmTransaction`).
4. Create a **feeSponsorship** (strategy: `pay_for_user`, linked to the policy above).
5. Put the 3 IDs in `.env`: `OPENFORT_SECRET_KEY`, `OPENFORT_WALLET_SECRET`, `OPENFORT_FEE_SPONSORSHIP_ID`.
6. Optional smoke: one real gasless tx (free tier = 2,000 ops/mo).

---

## What is NOT claimed

- **ZeroDev SRA** ($500): Dropped. Free tier is testnet-only; Particle UA is mainnet-only → architecturally incompatible on a free budget. No code shipped for ZeroDev.
- **Bitrefill real purchase**: Mock fulfillment for dev and demo (zero cost, zero demo risk). The adapter is real (quotes, webhook verification, redemption fetch) but no live purchase is executed.
- **Production deployment**: Deployed on Vercel in demo mode. Real on-chain settlement requires env vars (see `.env.example` Vercel section).

---

## OKX AI Genesis — Agent-to-Agent Track

Pouch is an **Agent-to-Agent (A2A) off-ramp system** where 5 specialized agents collaborate to convert natural language into real-world value.

### A2A Architecture

| Agent | Role | Technology |
|-------|------|-----------|
| **Intent Parser Agent** | NL → structured cash-out intent | Gemini 3.5 Flash (`@google/genai` function-calling) + regex fallback |
| **Balance Agent** | Read unified balance across chains | Particle Universal Accounts (EIP-7702) |
| **Routing Agent** | Compare providers, find best route | Pure domain logic (`packages/domain/src/router.ts`) |
| **Settlement Agent** | Pay provider gaslessly | Openfort backend wallet + fee sponsorship (`pay_for_user`) |
| **Delivery Agent** | Purchase + deliver redemption code | Bitrefill API v2 (8,000+ brands) |

### A2A flow trace (visible in demo)

```
● Reading unified balance       ✓  [3 assets, $55 total]
● Finding best provider         ✓  [cheapest: Bitrefill]
● Creating order with Bitrefill ✓
● Funding agent wallet          ✓  [UA 7702 cross-chain]
● Paid via Openfort gasless     ✓  [NO POPUP — gas sponsored]
✅ Amazon gift card: [AMZN-XXXX-XXXX]
```

### Criteria mapping

| Criterion | Where satisfied |
|-----------|----------------|
| **Agent-to-Agent orchestration** | `packages/domain/src/executor.ts` — `CashOutExecutor` coordinates 5 agents in sequence, each with typed ports. Trace steps visible in chat UI. |
| **AI/LLM integration** | `packages/infra-ai/src/` — Gemini 3.5 Flash with function calling for intent parsing + conversational replies. Regex fallback ensures reliability without API key. |
| **Chain abstraction** | Particle UA (EIP-7702) — funds consolidated from Arbitrum, Base, Polygon into a single unified balance. User never sees chains, gas tokens, or bridging. |
| **Gasless UX** | Openfort fee sponsorship (`pay_for_user`) + Magic blind signatures — zero signing popups. Header shows "N signatures · zero popups" counter. |
| **Real off-ramp** | Bitrefill adapter (`packages/infra-offramp/src/bitrefill/`) — real quotes, webhook verification, redemption fetch. |
| **Modular + extensible** | Hexagonal architecture. Adding a new provider = 1 file. Domain layer is pure (no SDKs, no React, no fetch). |
| **Live demo** | [pouch-orpin.vercel.app](https://pouch-orpin.vercel.app) — conversational agent with Gemini AI, multi-turn confirmation, full agent trace. |

### Key files for evaluators

| What | Where |
|------|-------|
| Agent orchestration | `packages/domain/src/executor.ts` |
| Intent parsing (LLM) | `packages/infra-ai/src/llm-intent-parser.ts` |
| Gemini provider | `packages/infra-ai/src/gemini-provider.ts` |
| Balance agent (Particle UA) | `packages/infra-web3/src/particle/universal-account.ts` |
| Settlement agent (Openfort) | `packages/infra-web3/src/openfort/openfort-provider.ts` |
| Delivery agent (Bitrefill) | `packages/infra-offramp/src/bitrefill/bitrefill-adapter.ts` |
| Chat endpoint | `apps/api/src/routes/agent/chat.ts` |
| Chat UI (Next.js) | `apps/web/src/app/page.tsx` |
| Env config (Zod) | `packages/shared/src/config.ts` |
| Architecture docs | `docs/ARCHITECTURE.md` |
