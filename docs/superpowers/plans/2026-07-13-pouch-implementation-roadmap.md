# Pouch — Implementation Roadmap (phase index)

**Created:** 2026-07-13
**Deadline:** Mon, Jul 20, 2026, 13:59 GMT+2 (7 days)
**Spec:** [`docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`](../specs/2026-07-13-pouch-offramp-agent-design.md)

> This document is the **index**. Each phase has (or will have) its own detailed plan in this
> directory. Phases are sequenced by risk and dependency — the highest-risk, highest-bounty
> component (Particle UA + Magic 7702) is de-risked first.

---

## How to read this roadmap

- Each phase = **one plan document** = independently executable, independently testable software.
- Phases are ordered so that each unblocks the next, and so the riskiest thing is validated first.
- A phase is only written in full detail when it is **ready to execute** (its predecessors done or de-risked). Earlier phases below are detailed now; later ones are stubbed and will be expanded when reached.
- The detailed, ready-to-execute plan for the current phase lives at the link in its row.

---

## Phase summary

| Phase | Name | Status | Plan document | Blocks |
|-------|------|--------|---------------|--------|
| **0** | Domain foundation (trace, parser strategy, ownership, bug fixes, config/schema prep) | 🟡 Plan ready | [`2026-07-13-pouch-phase0-domain-foundation.md`](./2026-07-13-pouch-phase0-domain-foundation.md) | Phases 1, 2, 3 |
| **1** | Web3 spike + real Particle UA provider + auth (DID→JWT) — **real funds $5–10** | ⚪ Stubbed | _(written when Phase 0 done)_ | Phase 3 (needs real balances), bounties |
| **2** | LLM layer (`infra-ai` + Gemini function-calling, regex fallback) | ⚪ Stubbed | _(written when Phase 0 done; can run parallel to 1)_ | Phase 3 (conversational reply) |
| **3** | Frontend (chat + inline agent trace + receipt + Magic login) | ⚪ Stubbed | _(written when Phases 1 & 2 done)_ | Demo, bounties |
| **4** | Bounties polish (ZeroDev SRA deposit page, Openfort gas sponsorship) | ⚪ Stubbed | _(written last)_ | Submission |

---

## Phase 0 — Domain foundation (START HERE)

**Goal:** Land the internal seams that every later phase depends on, without touching any SDK or spending any real funds. Fully testable with the existing Vitest setup. Zero external dependencies.

**Deliverables:**
1. `TraceStep` + `TraceRecorder` types in `domain`, and `CashOutExecutor` emits a structured trace per cash-out (spec §9).
2. `AgentChatResponse` surfaces `trace: TraceStep[]` to the API.
3. `IntentParserStrategy` interface so the LLM parser (Phase 2) is injectable; `IntentParser` (regex) implements it; `AgentChatService` depends on the interface, not the concrete class.
4. **Bug fix Gap F:** `BitrefillAdapter.verifyWebhook` accepts the 2-arg `(payload, headers)` signature from `OffRampProvider` (currently 1-arg — a live mismatch the existing test doesn't catch).
5. **Ownership plumbing:** `Order` carries `userId`, repositories set + filter by it, `/orders/:id` reads `userId` from query (temporary, until auth middleware lands in Phase 1).
6. `LLM_PROVIDER` / `GEMINI_API_KEY` / `LLM_MODEL` added to the Zod `ConfigSchema` (currently in `.env.example` but silently stripped by Zod).
7. `users` table gets unique indexes on `magic_public_key` + `evm_address` (partial, nulls excluded) so auth upsert (Phase 1) is race-safe.

**Verification gate:** `pnpm typecheck && pnpm test && pnpm build` all green; the 8 existing API test cases still pass.

**Plan:** [`2026-07-13-pouch-phase0-domain-foundation.md`](./2026-07-13-pouch-phase0-domain-foundation.md)

---

## Phase 1 — Web3 spike + real Particle UA provider + auth

**Goal:** De-risk the single highest-risk component (Particle UA + Magic EIP-7702) with real funds, then wire real identity.

**Why spike-first:** Particle UA is **mainnet-only** (confirmed by Particle DevRel). No testnet fallback. The 2-day spike validates Magic login → EIP-7702 delegation → `getPrimaryAssets()` → `createConvertTransaction` → payment, using ~$5–10 real USDC, before the full flow is built on top. Reference repo: `github.com/Particle-Network/ua-7702-magic-demo`.

**Deliverables (anticipated — to be detailed when written):**
- Spike scripts under `packages/infra-web3/spike/` (not shipped) proving each success criterion.
- `packages/infra-web3/src/particle/universal-account.ts` — real `AccountProvider` over the UA SDK (headless Node mode).
- `packages/infra-web3/src/chains.ts` — chain config from env (no hardcoding).
- `packages/infra-web3/src/factory.ts` — `particle` case no longer throws; switches on `WEB3_PROVIDER_MODE`.
- `apps/api/src/middleware/auth.ts` — Magic DID (verify server-side) → issue our JWT (jose) → httpOnly cookie.
- `apps/api/src/routes/auth.ts` — `POST /auth/callback`, `POST /auth/logout`.
- `/orders/:id` switches from query-param `userId` to `ctx.userId` from the auth middleware; ownership enforced.
- SDK deps installed: `magic-sdk`, `@magic-ext/evm`, `ethers@^6.16.0`, `@particle-network/universal-account-sdk@^2.0.0-beta.3`, `jose`.

**Spike success criteria (from spec §5):** Magic login → EOA signs 7702 auth; EOA delegates to UA on Base + Arbitrum; `getPrimaryAssets()` returns aggregated balance; one `createConvertTransaction` succeeds; payment from UA to an address succeeds.

**Fallback (if spike blocks after 2 days):** Keep spike artifacts; ship balance-read-real + simulated-transaction narration. Still covers Magic ($500) + Arbitrum ($2k). Loses UA Track ($1.5–2.5k).

**Blocks:** Phase 3 (frontend needs real balances to demo), all bounties.

**Verification gate:** spike criteria pass manually; auth flow tested with mocked DID verification; `pnpm test` green.

---

## Phase 2 — LLM layer (`infra-ai` + Gemini)

**Goal:** Upgrade Pouch from a regex "agent with a chat skin" to a genuine agent that understands free-form natural language, with regex as the always-works fallback.

**Note:** Can run **in parallel with Phase 1** — it only depends on Phase 0's `IntentParserStrategy` interface, not on real web3.

**Deliverables (anticipated):**
- New package `packages/infra-ai/` + `@pouch/infra-ai` tsconfig alias.
- `llm-provider.ts` (`LLMProvider` interface), `gemini-provider.ts` (`@google/genai` function calling), `llm-intent-parser.ts` (implements `IntentParserStrategy`, delegates to `LLMProvider`), `index.ts` (factory).
- `bootstrap/create-runtime-app-services.ts` constructs the LLM parser when `LLM_PROVIDER` set, else regex.
- Function-calling contract from spec §7: `cash_out`, `check_balance`, `search_products`, `off_topic`.
- System prompt (spec §7) defining Pouch's role.
- Fallback chain: Gemini → regex on any failure. Demo never breaks because of the LLM.

**Verification gate:** unit tests with mocked `LLMProvider` (no real API calls); fallback-to-regex on simulated failure; `pnpm test` green.

---

## Phase 3 — Frontend (chat + agent trace + receipt + Magic login)

**Goal:** The transparent technical showcase — chat UI with inline agent trace, receipt card, "popups avoided" counter, Magic login.

**Deliverables (anticipated):**
- Tailwind + shadcn/ui + Vercel AI SDK 6 + Motion installed.
- `apps/web/src/app/login/page.tsx` (Magic embedded wallet), `page.tsx` (chat — main demo), `deposit/page.tsx` (Phase 4).
- Components: `chat-window`, `message-bubble`, `agent-trace` (renders `TraceStep[]` from Phase 0), `step-row`, `receipt-card`, `balance-card`, `popups-counter`.
- `@pouch/infra-web3` added as a workspace dep for shared types.
- Synchronous-with-stagger-animation trace rendering (MVP per spec §8).

**Blocks:** demo, bounties.

---

## Phase 4 — Bounties polish

**Goal:** Land the two near-guaranteed bounties and resolve the ZeroDev pricing risk.

**Open decision (must resolve when this phase starts):**
> **ZeroDev SRA has no documented free tier (~$500/mo).** Options: (a) request hackathon credits in their Discord; (b) if denied, pivot the deposit feature to Particle's deposit address or drop it. Openfort (2,000 free ops/mo) is the safe alternative for gas sponsorship regardless.

**Deliverables (anticipated):**
- ZeroDev SRA: `packages/infra-web3/src/zerodev/sra.ts` + `/deposit` page with QR — **if** credits/credits-equivalent secured.
- Openfort: `packages/infra-web3/src/openfort/agent-wallet.ts` — agent backend wallet + gas sponsorship via policy (NOT x402 — confirmed buggy in UA 7702).
- One real ~$1 Bitrefill purchase for the final demo (dev uses mock fulfillment).

**Verification gate:** E2E dry run with real funds; video backup recorded.

---

## Cross-cutting decisions (resolved by this roadmap)

| Decision | Resolution |
|----------|-----------|
| Plan structure | Phase-by-phase, modular, each independently executable (user direction: "profesional, escalable y modular"). |
| Sequencing | Phase 0 (foundation, no deps) → Phase 1 spike (de-risk, real funds) → Phase 2 LLM (parallel to 1) → Phase 3 frontend → Phase 4 bounties. |
| ZeroDev pricing risk | Decide at Phase 4 start: credits → SRA, else pivot to Particle deposit address / Openfort-only. |
| Bitrefill fulfillment | Mock in dev; 1 real ~$1 purchase for final demo only. |
| Error-path trace surfacing | Success-path trace lands in Phase 0; error-path trace enrichment deferred to Phase 3 (when the frontend makes it visible). |

---

## What "done" looks like (submission criteria, from spec §12)

1. Login with Magic → embedded wallet.
2. Onboarding: EOA delegates to UA via EIP-7702 on Base + Arbitrum (one-time, zero popup).
3. Unified balance across chains visible.
4. Cash-out: "cash out $X to [brand]" → agent consolidates cross-chain → buys gift card → delivers code.
5. Every step visible in the inline agent trace with durations + badges.
6. "0 popups" counter across the whole flow; signing step shows `NO POPUP` badge.
7. `/deposit` page shows ZeroDev SRA address + QR (or pivot).
8. Receipt card with gift-card code, tx hash, cost, popups count.
