# Development Plan — Pouch (10 days)

> Execution plan. Read AGENTS.md and ARCHITECTURE.md first.
- **Start:** Jul 11, 2026
- **Deadline:** Jul 20, 2026, 1:59 PM GMT+2

---

## Phase 0 — Foundation (D1) 🔧

**Goal:** Solid base that doesn't move. No features yet.

### Tasks
- [x] Initialize Turborepo + pnpm workspaces
- [x] Scaffold 7 packages: domain, infra-offramp, infra-web3, infra-db, shared, apps/api, apps/web
- [x] `shared/config.ts` with Zod validation (fail-fast)
- [x] `shared/logger.ts` (pino structured logging)
- [x] `shared/http.ts` (fetch with timeout, retry, backoff)
- [x] `shared/result.ts` (Result<T,E> type)
- [x] Docker-compose Postgres
- [x] Drizzle schema (users, orders, webhook_events, balance_snapshots)
- [ ] Initial migration
- [x] `.env.example` complete
- [ ] CI: lint + typecheck on commit
- [ ] Register accounts: Particle, Magic, Openfort, ZeroDev, Bitrefill, Reloadly
- [ ] Generate + validate all API keys (ping each)

### Milestone
Monorepo builds. `pnpm typecheck` passes. `pnpm test` runs (even if empty).

---

## Phase 1 — Domain + Bitrefill (D2-D3) 🧠

**Goal:** The heart of the product working with a real provider.

### D2: Domain layer
- [x] `domain/types.ts` — all interfaces (OffRampProvider, Intent, Order, Quote, etc.)
- [x] `domain/errors.ts` — typed errors
- [x] `domain/router.ts` — OffRampRouter with CheapestStrategy
- [x] `domain/executor.ts` — CashOutExecutor
- [x] Tests: MockProvider implementing OffRampProvider, test router + executor flows
- [x] `infra-offramp/bitrefill/client.ts` — HTTP client (fetch, retry, rate-limit aware)
- [x] `infra-offramp/bitrefill/mapper.ts` — BitrefillDTO → domain types
- [x] `infra-offramp/bitrefill/adapter.ts` — implements OffRampProvider

### D3: Bitrefill real validation
- [ ] `GET /ping` with real API key
- [ ] `POST /invoices` with `test-gift-card-code` → first real gift card code
- [x] `infra-offramp/bitrefill/webhooks.ts` — verification + idempotency
- [ ] Integration test against real API (sandbox/test products)
- [x] `infra-offramp/index.ts` — provider registry (dynamic, env-driven)

### Milestone
Test creates a real gift card via Bitrefill API. Router picks Bitrefill. Executor flow tested end-to-end with mocks for web3.

---

## Phase 2 — Auth + Web3 (D4) ⛓️

**Goal:** Real login + chain abstraction. Covers Magic ($500) + sets up UA Track.

### Tasks
- [ ] `infra-web3/magic/magic-wallet.ts` — login (email + Google), blind signatures
- [ ] `infra-web3/particle/universal-account.ts` — UA + EIP-7702 delegation
- [ ] `infra-web3/particle/eip7702.ts` — delegation helpers
- [ ] `infra-web3/chains.ts` — chain config from env (no hardcoding)
- [ ] `api/routes/auth.ts` — Magic login callback, issue JWT
- [x] `api/routes/balance.ts` — GET unified balance
- [ ] `api/middleware/auth.ts` — JWT verification

### Milestone
Login with Magic → see unified balance across chains in USD. EIP-7702 delegation works.

---

## Phase 3 — End-to-end core (D5-D6) 🚀

**Goal:** The winning demo. Covers UA Track ($2.5k) + Arbitrum ($2k).

### D5: Backend flow
- [x] `domain/intent-parser.ts` — NL → structured intent (regex/keyword first)
- [x] `api/routes/agent.ts` — POST /agent/chat
- [x] Connect: chat → intent → router → executor → Bitrefill → response
- [x] `api/routes/webhooks/bitrefill.ts` — idempotent webhook handler
- [ ] Cross-chain consolidation: executor triggers UA convert when needed

### D6: Frontend
- [ ] `web/components/chat/chat-window.tsx` — conversational UI
- [ ] `web/components/dashboard/balance-card.tsx` — unified balance display
- [ ] `web/components/dashboard/activity-feed.tsx` — cash-out history
- [ ] Wire frontend to API
- [x] Backend supports full flow: "cash out $50 to Amazon" → order + webhook delivery state
- [ ] Frontend supports full flow: "cash out $50 to Amazon" → gift card delivered

### Milestone
End-to-end conversational cash-out works. User types, agent consolidates + buys + delivers. Zero popups.

---

## Phase 4 — Guaranteed bounties (D7) 🏆

**Goal:** Lock in the 3 "almost guaranteed" bounties.

### Tasks
- [ ] `infra-web3/zerodev/sra.ts` — `createSmartRoutingAddress()` (ZeroDev $500)
- [ ] `web/app/deposit/page.tsx` — SRA address + QR code
- [ ] `infra-web3/openfort/agent-wallet.ts` — backend wallet + Calibur + gas sponsorship (Openfort $100)
- [ ] `infra-offramp/reloadly/` — second adapter (client + adapter + mapper)
- [ ] Router now compares Bitrefill vs Reloadly (smart routing demo)

### Milestone
5 bounties covered with real features. ZeroDev SRA generates a deposit address. Openfort agent wallet transacts gasless. Router picks between 2 providers.

---

## Phase 5 — Production + polish (D8-D9) ✨

### D8: Hardening
- [ ] `infra-web3/zerodev/session-keys.ts` — automate txs without signing each time
- [ ] `api/middleware/rate-limit.ts`
- [ ] Error handling robust in all routes
- [ ] Structured logging in every critical flow
- [ ] Observability: request IDs, timing logs

### D9: Frontend polish + testing
- [ ] Onboarding flow: 3 steps (login → see balance → first cash-out)
- [ ] Loading / empty / error states for all components
- [ ] Responsive design (mobile-first)
- [ ] Micro-animations
- [ ] E2E test of critical flow with real funds ($5-10 USDC)
- [ ] Deploy: Vercel (web) + Supabase (db) + backend

### Milestone
Production deploy live. Demo works on public URL. Tested with real funds.

---

## Phase 6 — Submit (D10) 📤

### Tasks
- [ ] Presentation deck (problem, solution, demo, tech, scalability, bounties)
- [ ] Video demo 2-3 min (rehearsed)
- [ ] README professional (architecture diagram, setup, env vars)
- [ ] Repo public
- [ ] Submit on Encode platform before deadline
- [ ] **DO NOT touch tech stack today** — only presentation

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Particle UA mainnet issues | Medium | High | Test early (D4), small funds, fallback to simple transfer |
| Magic 7702 sign method | Low | High | Validated by Davide. Ref: ua-7702-magic-demo |
| 3+ stack integration complexity | High | Medium | MVP core first (Magic+UA+Bitrefill). Others are stretch. |
| Reloadly is fiat (not crypto) | Medium | Low | Agent does swap internally; narrative: "abstracts the rails" |
| Webhooks in local dev | Medium | Low | Polling fallback (every 5s) |
| Scope creep | High | High | Stretch goals are optional. If broken, fall back to MVP core. |
| Demo crash on judging day | Medium | Critical | Test E2E with real funds D9. Record video backup. |

---

## MVP guarantee vs stretch

### 🟢 MVP CORE (guaranteed by D6) — ~$5,000 potential
- Magic login + Particle UA (7702) + Arbitrum settlement
- Bitrefill integration (test products for demo)
- Chat conversational + intent parser
- Cross-chain consolidation
- **Covers:** UA Track ($1.5k-$2.5k) + Arbitrum ($2k) + Magic ($500)

### 🟡 STRETCH 1 (D7) — +$100
- Openfort agent wallet + gas sponsorship

### 🔵 STRETCH 2 (D7) — +$500
- ZeroDev SRA + session keys

### 🟣 STRETCH 3 (D8, differentiation)
- Reloadly second provider (smart routing narrative)

**If stretches break, MVP core is still very competitive.**

---

## Team roles

| Role | Phase 0-1 | Phase 2-3 | Phase 4-6 |
|------|-----------|-----------|-----------|
| **A — Frontend/UX** | Web app structure | Chat UI, balance card | Polish, video, deck |
| **B — Backend/Agent** | Domain + Bitrefill adapter | API routes, executor | Reloadly, webhooks, testing |
| **C — Integrations** | SDK setup + config | Particle UA, Magic | ZeroDev SRA, Openfort |

*Supported by AI agents (Claude/Cursor/Codex) for scaffolding and boilerplate.*

---

## Daily checkpoints

End of each day:
1. Does `pnpm typecheck` pass?
2. Does `pnpm test` pass?
3. Is the day's milestone met?
4. Commit to git (Conventional Commits)
5. Update this file (check off tasks)

---

## Current snapshot

As of the latest handoff, the backend already exposes:

- `POST /agent/chat`
- `GET /balance`
- `GET /orders/:id`
- `POST /webhooks/bitrefill`

See [`docs/HANDOFF.md`](./HANDOFF.md) for the exact continuation point.
