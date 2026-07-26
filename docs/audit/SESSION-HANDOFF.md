# Session Handoff — Audit Fixes + Demo Plan (2026-07-26)

> **For the next session: read this first.** Status snapshot at the end of the
> 2026-07-26 session. The user made all demo decisions — this is the single
> source of truth for what to build before the Jul 30 deadline.

---

## TL;DR

- ✅ **All 6 CRITICAL fixes (C1–C6) shipped, merged, pushed** (previous session).
- ✅ **PASO 0 DONE this session** — Vercel secrets rotated by the agent, `vercel.json` cleaned, verified cryptographically.
- ✅ **Wallet explorer links feature DONE this session** — judges can now see each wallet's address + Arbiscan/Basescan/Snowtrace link in the `WalletPanel`.
- ✅ `pnpm build` 8/8, `pnpm test` 8/8 — green on `main` and on production.
- 🎯 **Demo decisions LOCKED** — no more clarification needed.
- ⏭️ **Build queue for next session:** whitelist of wallets (H11) → H2 → H3 → H6 → real-time balance → reactivate `allowDemoFallback` → Bitrefill DEMO → Gemini 3.6 → rate limit.

---

## Demo decisions (LOCKED — user confirmed)

The user wants a **live demo with REAL money**, but **risk-controlled via a strict whitelist**:

| Decision | Value |
|----------|-------|
| Deploy | Existing `https://pouch-orpin.vercel.app` (production). No separate staging. |
| Access control | **No Magic login.** URL is shared only with judges privately. (Confirmed again this session: "no debe haber login".) |
| Money | **REAL assets from the main wallet** (the one with all the funds). |
| Fund safety | **Whitelist of wallets.** Funds must ONLY circulate between our own wallets. Any attempt to send outside the whitelist must be blocked. |
| Balance | Must update **in real time** (currently it is NOT real-time — see "Gaps"). |
| Bitrefill | **DEMO mode only.** Must be clearly labeled "DEMO" in UI/chat. No real gift-card purchases. |
| LLM | Gemini **3.6** flash (free tier — confirmed working). |
| Movement | Minimum movement of assets. |
| Wallet visibility | **Always show** the on-chain address + link to scan explorer for every real wallet. NO mocks: a wallet without a real address shows no link (do not fake it). |

### Residual risk the user accepted

With "main wallet + whitelist", the whitelist protects against **external attacks**
(anyone trying to drain to an unknown address is blocked). It does NOT protect against
**internal value loss via buggy swap math (H2)** — every under-priced swap eats value
*inside* the circuit. **H2 is therefore critical for this demo decision**, not optional.

---

## ✅ PASO 0 — DONE (this session, by the agent)

The repo `github.com/ruwaq/pouch` is **PUBLIC**. The committed `vercel.json` *used to*
contain placeholder values for `JWT_SECRET`/`WEBHOOK_SECRET`/`DATABASE_URL`. Worse, the
Vercel Production env vars were **empty** (marked `sensitive` with value `''`), so the
app was falling back to the public placeholders at runtime.

**What was done this session (all by the agent, none by the user):**

1. Generated 3 fresh 64-char-hex secrets with `openssl rand -hex 32`.
2. Uploaded them to Vercel Production as `type=encrypted` (replacing the empty ones).
3. Updated the local `.env` (backup at `.env.bak.20260725-225111`, gitignored).
4. Removed the placeholder lines from the committed `vercel.json` (commit `8115431`).
5. Redeployed to production.
6. **Verified cryptographically:** forged a JWT with the OLD placeholder secret → got
   `401 Unauthorized`; forged a JWT with the NEW secret → got `200` + real balance.
   The public-repo token-forgery vector is closed.

**Commits:** `8115431` (vercel.json cleanup). Secrets themselves are in Vercel + `.env`
only, never in the repo.

---

## ✅ Wallet Explorer Links feature — DONE (this session)

Spec: `docs/superpowers/specs/2026-07-26-wallet-explorer-links-design.md`.
Plan: `docs/superpowers/plans/2026-07-26-wallet-explorer-links.md`.

**What was built (subagent-driven, 6 tasks, all reviewed):**

1. `BalanceAsset` interface (`packages/domain/src/types.ts`) gained an optional
   `address?: string` field.
2. `PrivateKeyAccountProvider.getUnifiedBalance()` populates `address: walletConfig.address`
   in the 3 real-provider push sites (native ETH, USDC, extra tokens). The hardcoded AVAX
   `knownAssets` fallback (Wallet 3/4) intentionally stays address-free.
3. Regression test in `private-key-provider.test.ts` asserts every real asset has a
   valid `0x…` address.
4. New helper `apps/web/src/lib/explorer.ts`: `shortAddress`, `explorerAddressUrl`
   (wraps `@pouch/shared`'s `getExplorerUrl`, returns `null` instead of Arbiscan fallback
   for unknown chains), re-exports `getExplorerName`.
5. `apps/web/src/components/dashboard/WalletPanel.tsx` renders
   `0xAbcd…F01 ↗ Arbiscan` under each wallet label (only when a real address exists).
6. **Smoke-tested in production**: `/api/balance` returns `address` on real assets
   (Wallet 1 on Arbitrum → `0xA5fA06…e3DD`). The AVAX fallback wallets show no link,
   as designed.

**Commits:** `164bb32`, `e202983`, `a087d84`, `3532012`, `b29b540`.

**Note for next session:** the explorer link only renders for assets that come back with
a non-empty `address`. The AVAX "Wallet 3"/"Wallet 4" fallback entries in
`private-key-provider.ts` (~lines 344-347) have no address; this is intentional, but if
the user wants them verified on Snowtrace too, those entries need real addresses added.

---

## 🚨 Demo fallback is OFF in production (NEW gap)

During PASO 0 verification, the smoke test of `/api/balance` without a cookie returned
`401 Unauthorized` — meaning `allowDemoFallback: false` in production. **This breaks the
"no login" demo decision**: any judge hitting the URL without a valid session cookie is
rejected.

This is consistent with the C5 fix (`allowDemoFallback = isDemo && !isProduction`).
**It must be re-enabled** so the demo works for judges without login — but ONLY after
the whitelist + H2 are in place, because re-enabling demo fallback re-opens the C5
vector that those two items now close.

**Action (in the build queue below, item 6):** flip `allowDemoFallback` back to `true`
in production AFTER whitelist + H2/H3/H6 land.

---

## Build queue for next session (priority order)

### 🔴 Blocking for real-money demo (all required before Jul 30)

1. **Whitelist of wallets (H11).** Hook into the send/transfer path so any destination
   address not in a configurable allow-list is blocked at the policy layer
   (`SecurityChecker`), never reaching the chain. Allow-list = our own wallets only.
   Circuito cerrado. **This is now the SOLE external-defense layer** (since demo fallback
   will be re-enabled). The allow-list should reuse the addresses already exposed via
   `BalanceAsset.address` / `PrivateKeyAccountProvider.getWalletInfo()`.

2. **H2 — slippage math fix** (`private-key-provider.ts` swap function, ~line 734).
   Currently under-prices ~40x. With real money + whitelist, every swap eats value
   inside the circuit. **Critical.**

3. **H3 — amount validation** (`private-key-provider.ts:483,531`). Negatives/NaN reach
   `parseEther`. Blocks a crash during the live demo.

4. **H6 — timeouts / AbortController** on web3 calls. Without this a slow tx freezes the
   worker in front of the judges. **Also the foundation for real-time balance** (#5).

5. **Real-time balance refresh.** Today `balance-service.ts` delegates to
   `accountProvider.getUnifiedBalance()` with no polling/refresh. Implement a short-TTL
   cache + on-chain refresh so balances update during the demo.

6. **Re-enable `allowDemoFallback` in production** (after 1-5 land). Without this the
   demo returns 401 to unauthenticated judges. See the "Demo fallback is OFF" note above.

### 🟡 Demo polish

7. **Bitrefill — force DEMO mode + clear "DEMO" label.** No real gift-card purchases.
   Label in the UI and in chat replies.

8. **Gemini 3.5-flash → 3.6-flash** (`apps/api/src/app.ts:105` and
   `create-demo-agent-service.ts`).

9. **H7 — rate limit on `/agent/chat`.** Because the demo runs without login, this
   protects `GEMINI_API_KEY` from abuse.

10. **M5/M2 — per-chain gas cap + fail-fast if `SEED_PHRASE_3` still absent.**

### 🟢 Verification

11. **Smoke test the demo on production** with a small real movement before Jul 30:
    whitelist blocks external sends, balance updates live, swaps price correctly,
    Bitrefill stays demo, chat works, explorer links open the right explorer.

12. **`git branch -d audit-fixes`** — local branch already merged, safe to delete.

---

## Gaps discovered (carried over + new this session)

1. **PASO 0 (RESOLVED this session).** `JWT_SECRET`/`WEBHOOK_SECRET`/`DATABASE_URL`
   were placeholders committed to a PUBLIC repo, AND the Vercel Production values were
   empty. Now rotated + verified.

2. **Balances are NOT real-time.** `balance-service.ts` delegates to
   `accountProvider.getUnifiedBalance()` with no polling/refresh. New requirement #5.

3. **Demo mode uses real `GEMINI_API_KEY` for every chat turn.** Riskier without login.
   Mitigated by H7 (#9).

4. **Bitrefill in `mode: 'configured'` makes REAL gift-card orders.** User wants demo
   only with clear labels. Requirement #7.

5. **`SEED_PHRASE_3` is absent** from `.env` (only `SEED_PHRASE_1`/`_2` present).

6. **C5 was an active drain vector** (restated for clarity): pre-fix, anyone who knew
   the two hardcoded addresses could move Wallet 1's funds. Closed by `d6a6e17`.
   The whitelist (item #1) hardens this further. **Re-enabling demo fallback (#6)
   re-opens the surface — only do it after #1+#2 are in.**

7. **NEW — `allowDemoFallback` is `false` in production.** Breaks the no-login demo
   today. See "Demo fallback is OFF" section above.

8. **NEW — AVAX fallback wallets (Wallet 3/4) have no on-chain address.** They show
   no explorer link in the panel. Intentional for now; if the user wants them
   verifiable on Snowtrace, real addresses need to be added to the `knownAssets`
   array in `private-key-provider.ts`.

---

## Exact repo state

- **Branch:** `main` (you are here)
- **HEAD:** `b29b540` — "feat(web): show wallet address + explorer link in WalletPanel"
- **Remote:** `origin/main` = `b29b540` (in sync, pushed)
- **Working tree:** clean (only `.env.bak.20260725-225111` untracked, gitignored)
- **Leftover local branch:** `audit-fixes` (merged; safe to delete)

### Commits from this session (on main, pushed)

| What | Commit | One-liner |
|------|--------|-----------|
| PASO 0 | `8115431` | Remove placeholder secrets from `vercel.json` |
| Spec | `969e78e` | Wallet explorer links design doc |
| Plan | `425b9ad` | Wallet explorer links implementation plan |
| Task 1 | `164bb32` | Add optional `address` to `BalanceAsset` |
| Task 2 | `e202983` | Populate `address` on real wallet balance assets |
| Task 3 | `a087d84` | Regression guard for address field |
| Task 4 | `3532012` | Explorer URL helpers (reuses `@pouch/shared`) |
| Task 5 | `b29b540` | Render address + explorer link in `WalletPanel` |

(Secrets themselves are in Vercel env vars + local `.env` only — never in the repo.)

### Prior session commits (still on main)

| Fix | Commit | One-liner |
|-----|--------|-----------|
| C1 | `13ec3ed` + `1a0581e` | Bitrefill webhook HMAC + 401/400 narrowing |
| C2 | `7cda9a2` | `allowDemoFallback = isDemo && !isProduction` |
| C3 | `d28ec5d` | `/auth/demo` mounted only outside production |
| C4 | `2da0d93` | Identity from JWT context (closed IDOR) |
| C5 | `d6a6e17` | Removed wallet bypass + strict `resolveSender` |
| C6 | `2e0438e` | Fake receipts only for `demo-user` |

---

## How to resume

1. **Confirm PASO 0 is still solid:** smoke `/api/balance` with a forged-OLD-placeholder
   token (expect 401) and with the real `.env` `JWT_SECRET` (expect 200). If either
   regressed, investigate before anything else.
2. **Work the build queue in priority order.** Items 1-6 are the blocking set — do them
   as a TDD sequence before any polish. Item 6 (re-enable demo fallback) MUST come after
   1+2.
3. **Do not** touch the items in "What NOT to touch" below without checking with the user.

---

## Verification commands (re-run anytime)

```bash
cd "/Users/munay/dev/UXmaxx Hackathon"
pnpm install
pnpm build       # 8/8 expected
pnpm test        # 8/8 expected; api=49 tests, web=18, infra-web3=30, others passWithNoTests
pnpm typecheck   # 8/8 expected
```

Smoke production after any deploy:

```bash
# Forge a token with the current .env JWT_SECRET and call /api/balance.
# Expect 200 + assets with `address` field on real wallets (Wallet 1 on Arbitrum).
```

If anything is red, **stop and investigate** — do not start new work on a broken baseline.

---

## Files of record

- `docs/audit/README.md` — entry point, TL;DR of the 6 CRITICALs.
- `docs/audit/2026-07-25-security-audit.md` — full audit (CRITICAL + HIGH + MEDIUM + LOW).
- `docs/audit/FOLLOW-UP-ACTION-PLAN.md` — execution table with `[x]`/`[ ]` status.
- `docs/audit/SESSION-HANDOFF.md` — **this file.**
- `docs/superpowers/specs/2026-07-26-wallet-explorer-links-design.md` — design for the
  wallet explorer links feature shipped this session.
- `docs/superpowers/plans/2026-07-26-wallet-explorer-links.md` — implementation plan
  for that feature (6 tasks, all completed).

---

## What NOT to touch without checking with the user first

- **C2/C3 behavior.** `allowDemoFallback = isDemo && !isProduction` is correct as-is.
  Re-enabling demo fallback in production is a deliberate decision tied to whitelist
  readiness (build queue item 6) — do not flip it casually.
- **The `demo-user` fallback in `balance.ts`/`agent.ts`.** Removing it breaks the judge demo.
- **The hardcoded `knownAssets` AVAX balances** (`private-key-provider.ts:~344-347`).
  They have no `address` by design — the explorer link correctly skips them. If the user
  wants them verifiable, real addresses must be sourced first.
- **The wallet choice.** Main wallet with full funds is locked. Protect via whitelist,
  not by switching wallets.
- **The Vercel env vars.** PASO 0 is closed. Do not rotate secrets again without reason.
