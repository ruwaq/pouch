# Session Handoff — Audit Fixes + Demo Plan (2026-07-25)

> **For the next session: read this first.** Status snapshot at the end of the
> 2026-07-25 session. The user made all demo decisions — this is the single
> source of truth for what to build before the Jul 30 deadline.

---

## TL;DR

- ✅ **All 6 CRITICAL fixes (C1–C6) shipped, merged to `main`, pushed to `origin/main`.**
- ✅ `pnpm typecheck` 8/8, `pnpm test` 8/8 — green on `main`.
- 🎯 **Demo decisions are LOCKED** (see "Demo decisions" below) — no more clarification needed.
- 🚨 **PASO 0 is blocking and on the USER** (Vercel secrets today, see below).
- ⏭️ **Build queue** for next session: whitelist of wallets + H2/H3/H6 + balance en tiempo real + Bitrefill demo + Gemini 3.6.

---

## Demo decisions (LOCKED — user confirmed)

The user wants a **live demo with REAL money**, but **risk-controlled via a strict whitelist**:

| Decision | Value |
|----------|-------|
| Deploy | Existing `https://pouch-orpin.vercel.app` (production). No separate staging. |
| Access control | **No Magic login.** URL is shared only with judges privately. |
| Money | **REAL assets from the main wallet** (the one with all the funds). |
| Fund safety | **Whitelist of wallets.** Funds must ONLY circulate between our own wallets (the ones we hold keys for). Any attempt to send outside the whitelist must be blocked. |
| Balance | Must update **in real time** (currently it is NOT real-time — see "Gaps discovered"). |
| Bitrefill | **DEMO mode only.** Must be clearly labeled "DEMO" in UI/chat. No real gift-card purchases. |
| LLM | Gemini **3.6** flash (free tier — confirmed working 2 days ago). |
| Movement | Minimum movement of assets. |

### Residual risk the user accepted

With "main wallet + whitelist", the whitelist protects against **external attacks**
(anyone trying to drain to an unknown address is blocked). It does NOT protect against
**internal value loss via buggy swap math (H2)** — every under-priced swap eats value
*inside* the circuit. **H2 is therefore critical for this demo decision**, not optional.

---

## 🚨 PASO 0 — BLOCKING, ON THE USER (today)

The repo `github.com/ruwaq/pouch` is **PUBLIC**. The committed `vercel.json` contains:

```json
"JWT_SECRET":     "placeholder-jwt-secret-minimum-32-chars!!"
"WEBHOOK_SECRET": "placeholder-webhook-secret-minimum-32!"
"DATABASE_URL":   "postgresql://placeholder:placeholder@localhost:5432/placeholder"
```

Anyone who reads the public repo knows the JWT secret and can forge tokens for any user
(including admin) and move funds from the wallet. **This attack does not depend on knowing
the demo URL** — it stems from the public repo. It must be fixed BEFORE any work on the demo.

### What the user is doing today

1. Generate fresh secrets:
   ```bash
   openssl rand -hex 32   # JWT_SECRET
   openssl rand -hex 32   # WEBHOOK_SECRET
   ```
2. Set them as **Environment Variables in Vercel** (Settings → Environment Variables).
3. Set a real `DATABASE_URL` from their DB provider.
4. **Remove the placeholder values from `vercel.json`** (next session will handle the code
   change so the file no longer ships secrets).

The user confirmed: **"Sí, lo hago hoy."**

---

## Build queue for next session (priority order)

### 🔴 Blocking for real-money demo (all required before Jul 30)

1. **Whitelist of wallets (new — call it H11).** Hook into the send/transfer path so any
   destination address not in a configurable allow-list is blocked at the policy layer
   (`SecurityChecker`), never reaching the chain. Allow-list = our own wallets only.
   Circuito cerrado.

2. **H2 — slippage math fix** (`private-key-provider.ts:734`). Currently under-prices ~40x.
   With real money + whitelist, every swap eats value inside the circuit. **Critical.**

3. **H3 — amount validation** (`private-key-provider.ts:483,531`). Negatives/NaN reach
   `parseEther`. Blocks a crash during the live demo.

4. **H6 — timeouts / AbortController** on web3 calls. Without this a slow tx freezes the
   worker in front of the judges. **Also the foundation for real-time balance** (see #5).

5. **Real-time balance refresh.** NEW requirement from the user. Today `balance-service.ts`
   just delegates to `accountProvider.getUnifiedBalance()` with no live polling. Implement
   a short-TTL cache + on-chain refresh so balances update in real time during the demo.

### 🟡 Demo polish

6. **Bitrefill — force DEMO mode + clear "DEMO" label.** No real gift-card purchases.
   Label in the UI and in chat replies. User explicitly requested: "decir cuál es real y
   cuál es demo".

7. **Gemini 3.5-flash → 3.6-flash** (`apps/api/src/app.ts:105` and
   `create-demo-agent-service.ts`). User confirmed 3.6 flash free tier works.

8. **H7 — rate limit on `/agent/chat`.** Because the demo runs without login, this
   protects `GEMINI_API_KEY` from abuse. Important given the URL-only protection model.

9. **M5/M2 — per-chain gas cap + fail-fast if `SEED_PHRASE_3` still absent.** Prevents
   failed/overpriced txs during the demo.

### 🟢 Verification

10. **Smoke test the demo on the production deploy** with a small real movement (main
    wallet, but tiny amount) before Jul 30. Confirm: whitelist blocks external sends,
    balance updates live, swaps price correctly, Bitrefill stays demo, chat works.

11. **`git branch -d audit-fixes`** — local branch already merged, safe to delete.

---

## Gaps discovered this session (NOT in the original audit)

1. **`JWT_SECRET`/`WEBHOOK_SECRET`/`DATABASE_URL` are placeholders committed to a PUBLIC
   repo.** Worse than any C-finding — anyone can forge JWTs. Documented above as PASO 0.

2. **Balances are NOT real-time.** `balance-service.ts` delegates to
   `accountProvider.getUnifiedBalance()` with no polling/refresh. The user assumed real-time;
   it is not. New requirement #5 above.

3. **Demo mode uses real `GEMINI_API_KEY` for every chat turn.** Already known but now
   riskier: the demo runs without login, so an attacker with the URL could spam the chat
   endpoint and burn API quota. Mitigated by H7 (#8).

4. **Bitrefill in `mode: 'configured'` makes REAL gift-card orders.** The user wants demo
   only with clear labels. New requirement #6.

5. **`SEED_PHRASE_3` is absent** from `.env` (only `SEED_PHRASE_1`/`_2` present). Already
   noted in C5; remains the root of the M2 fail-fast item.

6. **C5 was an active drain vector, not a passive bypass** (restated for clarity):
   pre-fix, anyone who knew the two hardcoded addresses could move Wallet 1's funds if it
   had balance. Closed by `d6a6e17`. The new whitelist (item #1) hardens this further.

---

## Exact repo state

- **Branch:** `main` (you are here)
- **HEAD:** `999da0b` — "docs(audit): add session handoff + update README entry point"
- **Remote:** `origin/main` = `999da0b` (in sync, pushed)
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

## How to resume

1. **First:** ask the user "¿Arreglaste los secrets de Vercel?" If not, do not start the
   build queue — start there.
2. **Then:** work the build queue in priority order. Do items 1–5 (the blocking set) as a
   TDD sequence before any polish.
3. **Do not** change C2/C3 behavior, the `demo-user` fallback in `balance.ts`/`agent.ts`,
   or the hardcoded `knownAssets` AVAX balances — see "What NOT to touch".

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
- `docs/audit/FOLLOW-UP-ACTION-PLAN.md` — execution table with `[x]`/`[ ]` status.
  **C1–C6 marked `[x]`; B and C still `[ ]`.**
- `docs/audit/SESSION-HANDOFF.md` — **this file.**
- `docs/superpowers/plans/2026-07-25-audit-critical-fixes.md` — reference for the TDD steps taken.

---

## What NOT to touch without checking with the user first

- **C2/C3 behavior in production.** The user has accepted the production demo will return
  401 to unauthenticated users *unless* the URL is shared. Do not change.
- **The `demo-user` fallback in `balance.ts`/`agent.ts`.** Removing it breaks the judge demo.
- **The hardcoded `knownAssets` AVAX balances** (`private-key-provider.ts:333-336`) — L2,
  intentionally left in place during C5.
- **The wallet choice.** Main wallet with full funds is locked. Protect via whitelist, not
  by switching wallets.
