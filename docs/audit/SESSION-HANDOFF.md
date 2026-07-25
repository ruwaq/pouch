# Session Handoff — Audit Fixes (2026-07-25)

> **For the next session: read this first.** Status snapshot at the end of the
> 2026-07-25 session that landed all 6 CRITICAL fixes.

---

## TL;DR

- ✅ **All 6 CRITICAL fixes (C1–C6) shipped, merged to `main`, and pushed to `origin/main`.**
- ✅ `pnpm typecheck` 8/8, `pnpm test` 8/8 — green on `main`.
- ⏭️ **Workstreams B (HIGH) and C (MEDIUM/LOW) are NOT started** — see below.
- ⚠️ **One open decision for the user:** the demo flow under `NODE_ENV=production` (see "Open decisions").

---

## Exact repo state

- **Branch:** `main` (you are here)
- **HEAD:** `3b69372` — "Merge branch 'audit-fixes': CRITICAL security fixes C1–C6"
- **Remote:** `origin/main` = `3b69372` (in sync, pushed)
- **Working tree:** clean
- **Leftover local branch:** `audit-fixes` (merged; safe to delete with `git branch -d audit-fixes`)

### The 6 CRITICAL commits (now on main)

| Fix | Commit | One-liner |
|-----|--------|-----------|
| C1 | `13ec3ed` + `1a0581e` | Bitrefill webhook HMAC verification + 401/400 narrowing + route test |
| C2 | `7cda9a2` | `allowDemoFallback = isDemo && !isProduction` |
| C3 | `d28ec5d` | `/auth/demo` mounted only outside production |
| C4 | `2da0d93` | Identity from JWT context (closed IDOR on 3 routes) |
| C5 | `d6a6e17` | Removed wallet bypass + strict `resolveSender` + fail-fast seeds |
| C6 | `2e0438e` | Fake receipts only for `demo-user`; real users get propagated error |

Docs: `4e1c4b0` (audit), `a1513fa` (plan), `ee37bf7` (status sync).

---

## Open decisions (need user input before next work)

### 1. Demo flow under `NODE_ENV=production` ⚠️ most important

**The situation:** C2 changed the behavior in production. Before, with `DEMO_MODE=true` in prod, any unauthenticated request fell back to `demo-user`. Now (C2) it returns **401**. And C3 unmounts `/auth/demo` entirely in production.

**The question:** If the live demo to judges runs on a deployment with `NODE_ENV=production`, the judge entering without a login will get 401s and the `/auth/demo` button won't exist. Three options the user needs to pick from:

- **(a)** Run the judge demo on a staging/preview deployment with `NODE_ENV != production` (demo fallback + `/auth/demo` both work). *Recommended for hackathon.*
- **(b)** Keep prod deploy but add a real Magic login for the demo (no demo bypass at all).
- **(c)** Revisit C2/C3 to allow `DEMO_MODE` to re-enable the fallback in prod (re-introduces the audit risk — not recommended).

**Do not assume (a)** — confirm with the user how the demo is deployed before the next session.

### 2. Workstream B vs. C priority

The user's deadline is Jul 30. Workstream B (HIGH) has demo-relevant items (H2 slippage, H6 timeouts, H3 amount validation) and non-demo items (H1, H4, H5, H7, H8, H9, H10). Ask the user whether to:
- Push on demo-relevant HIGHs before the deadline, or
- Focus on the non-demo HIGHs for production-readiness, or
- Skip to polish (Workstream C).

---

## Findings discovered during implementation (NOT in original audit)

These came up while verifying/building the fixes — record so they're not lost:

1. **C5 was worse than the audit described.** The audit called the hardcoded addresses a "funds escape hatch." The red-phase test showed it was **active fund movement**: a non-derived address passed the whitelist via `knownToWallet`, `resolveSender` fell back to Wallet 1 (which had a key), and the transfer attempted to sign/broadcast — only failing on `INSUFFICIENT_FUNDS`, not `SECURITY_BLOCKED`. So before C5, anyone who knew the two hardcoded addresses could have drained Wallet 1 if it had balance. **Closed by `d6a6e17`.**

2. **C5 root cause (the audit's M2, folded into C5):** `SEED_PHRASE_3` is ABSENT from `.env`, and the two hardcoded addresses don't derive from `SEED_PHRASE_1`/`_2` (verified against the real `.env` — lengths only, not values). The bypass existed because those wallets never loaded. The fix is fail-fast in prod + strict resolveSender; the wallets that don't load now simply don't exist as send targets.

3. **Code-quality reviewer note on C4 (not a bug, design observation):** the `demo-user` fallback is duplicated — it lives in the auth middleware (`middleware/auth.ts`) AND is re-implemented at the handler level in `balance.ts` and `agent.ts` (`?? 'demo-user'`). `orders.ts` correctly requires auth (401). The cleaner design would push the fallback only into the middleware and have all handlers 401 on missing principal. **Not applied** because it would break the judge demo flow (users without Magic login). Worth revisiting post-hackathon.

4. **Two pre-existing lint errors** (out of scope, not introduced by these fixes): `openfort-provider.ts:192` (`Function` type cast) and `agent-chat-service.ts:272` (`prefer-const` on `walletAddresses`). They remain.

---

## How to resume each workstream

### Workstream B — HIGH (not started)

Open `docs/audit/FOLLOW-UP-ACTION-PLAN.md` → "Workstream B" table. Demo-relevant first:

1. **H2** slippage math (under-prices ~40x) — `private-key-provider.ts:734`. Demo-relevant: swaps silently sandwiched.
2. **H6** no timeouts/AbortController on web3 calls — `private-key-provider.ts`, `openfort-provider.ts`. Demo-relevant: stuck tx hangs worker.
3. **H3** no amount validation (negatives/NaN reach `parseEther`) — `private-key-provider.ts:483, 531`. Demo-relevant.
4. **M5** (in Workstream C but demo-relevant) per-chain gas cap — `private-key-provider.ts:105`.
5. **L1** (demo-relevant) hardcoded USD prices off 4-5x — `private-key-provider.ts:45-49`.

Non-demo HIGHs: H1 (Openfort dest whitelist), H4 (redirect header leak), H5 (https enforcement), H7 (rate limiter), H8 (idempotency), H9 (global error handler), H10 (LLM arg validation).

### Workstream C — MEDIUM/LOW (not started)

Same file → "Workstream C" table. All 13 MEDIUMs + the LOWs remain `[ ]`.

---

## Verification commands (re-run anytime)

```bash
cd "/Users/munay/dev/UXmaxx Hackathon"
pnpm install
pnpm typecheck   # 8/8 expected
pnpm test        # 8/8 expected; api=49 tests, web=12, others passWithNoTests
```

If any are red, **stop and investigate** — do not start new work on a broken baseline.

---

## Files of record

- `docs/audit/README.md` — entry point, TL;DR of the 6 CRITICALs.
- `docs/audit/2026-07-25-security-audit.md` — full audit (CRITICAL + HIGH + MEDIUM + LOW).
- `docs/audit/FOLLOW-UP-ACTION-PLAN.md` — execution table with `[x]`/`[ ]` status. **C1–C6 marked `[x]`; B and C still `[ ]`.**
- `docs/audit/SESSION-HANDOFF.md` — **this file.**
- `docs/superpowers/plans/2026-07-25-audit-critical-fixes.md` — the implementation plan that was executed (reference for the TDD steps taken).

---

## What NOT to touch without checking with the user first

- **C2/C3 behavior in production** — see Open Decision #1. Changing this re-opens the audit risk or breaks the demo.
- **The `demo-user` fallback in `balance.ts`/`agent.ts`** — removing it breaks the judge demo flow.
- **The hardcoded `knownAssets` AVAX balances** (`private-key-provider.ts:333-336`) — these are L2, intentionally left in place during C5.
