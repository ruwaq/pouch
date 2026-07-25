# Security Audit — Pouch (2026-07-25)

> Complete security + quality audit performed 2026-07-25, before the Jul 30 deadline.
> Findings verified directly against source code (file:line references included).
> **Next session: read this file end-to-end before starting any fix.** See
> [`./FOLLOW-UP-ACTION-PLAN.md`](./FOLLOW-UP-ACTION-PLAN.md) for the prioritized
> execution order.

---

## Context

- Audit date: 2026-07-25 (deadline: Jul 30).
- State: project already presented + videos recorded; this audit finds improvements/bugs before final polish.
- Method: three parallel sub-agents audited (1) web3/funds layer, (2) API/auth layer, (3) domain/AI/frontend. All critical findings re-verified manually against source.
- Head commit at audit time: `cfc5658`.

---

## What's done well (keep)

- `Result<T,E>` + discriminated `DomainError` union used consistently across packages.
- Every LLM code path has a deterministic regex/template fallback (`infra-ai/src/llm-intent-parser.ts:36-87`, `llm-reply-strategy.ts:15-32`, `factory.ts:37-43`).
- `.env` is correctly gitignored and **not** committed (verified via `git ls-files`; only `.env.example` + `apps/web/.env.local.example` tracked).
- SQL is fully parameterized via Drizzle ORM query builder — no injection vectors.
- JWT verification pins `algorithms: ['HS256']` (`middleware/auth.ts:45`) — prevents `alg:none` attacks.
- API keys transported via header, not URL query, in both Gemini and Bitrefill clients.
- `cash_out` tool args ARE properly validated (`mapCashOutArgs`, `infra-ai/src/llm-tools.ts`).
- Web3 layer enforces a `TOKEN_ADDRESSES` allowlist (`private-key-provider.ts:513-525`) — backstop for parser gaps.
- No `dangerouslySetInnerHTML` anywhere in the frontend.
- No secret/private-key logging in the API layer (Pino logger is a no-op in demo; only `Boolean(hasKey)` is logged).
- Domain package `typecheck` passes clean.
- No TODO/FIXME/HACK markers found in non-test source.

---

## CRITICAL (fix before Jul 30)

### C1. Bitrefill webhook has NO signature verification (unauthenticated)
- **Files:** `packages/infra-offramp/src/bitrefill/adapter.ts:154-183`; `apps/api/src/routes/webhooks/bitrefill.ts:8-33`; `apps/api/src/middleware/auth.ts:28`.
- **Problem:** `verifyWebhook(payload: unknown, _headers: Record<string, string> = {})` discards the headers (note the `_` rename). There is no HMAC, no `timingSafeEqual`, no `WEBHOOK_SECRET` read anywhere in runtime code (grep confirmed zero matches). `WEBHOOK_SECRET` is declared in `shared/config.ts:63` (`z.string().min(32)`) but never consumed. The webhook route is in the auth skip-list (`auth.ts:28`), so it is fully unauthenticated. "Verification" just re-fetches the invoice by attacker-supplied `id` from the body.
- **Impact:** Anyone who can guess/learn a Bitrefill invoice id can `POST /webhooks/bitrefill {"id":"<id>"}` and force order status changes / redemption-code persistence (`bitrefill-webhook-service.ts:59-64` calls `orders.updateStatus`).
- **Fix:** Implement real HMAC verification of the Bitrefill signature header using `WEBHOOK_SECRET`, with `crypto.timingSafeEqual` on equal-length digests. Reject (400) if header missing/mismatched. The webhook route must require it before `service.handle`.

### C2. Auth bypass in demo mode (affects ALL endpoints)
- **Files:** `apps/api/src/middleware/auth.ts:36-40, 56-60`; `apps/api/src/app.ts:67-86`; `apps/api/src/bootstrap/create-runtime-app-services.ts:191-272, 358-369`.
- **Problem:** When `allowDemoFallback` is true (set whenever `mode === 'demo'`), any request with no cookie — or with a cookie that fails `jwtVerify` — is silently authenticated as `userId='demo-user'` and allowed through. `mode === 'demo'` is triggered by `DEMO_MODE=true` **or any uncaught boot error** (unless `shouldFailFast` is true, which is only true when `NODE_ENV==='production' AND DEMO_MODE!=='true'`). The error message in `app.ts:74-77` itself recommends setting `DEMO_MODE=true`.
- **Impact:** In production with `DEMO_MODE=true` (recommended by the error handler!), the entire API is open: `/agent/chat`, `/balance`, `/orders` accept unauthenticated traffic as `demo-user`.
- **Fix:** Never enable `allowDemoFallback` when `NODE_ENV==='production'`, regardless of `DEMO_MODE`. Make `createRuntimeAppServices` fail-closed in production (re-throw instead of swallowing into demo mode).

### C3. `POST /auth/demo` issues a real 24h JWT unconditionally
- **File:** `apps/api/src/app.ts:139-156`.
- **Problem:** Mounted in every environment; `/auth/` is in the public-paths skip-list. Any anonymous client can POST and receive a valid HS256 JWT (`sub: 'demo-user'`, `evmAddress: '0xdemo'`) valid 24h, set as httpOnly cookie.
- **Fix:** Only mount when `mode === 'demo'` (or at minimum `!isProduction`).

### C4. `/agent/chat` trusts `userId` from the body (IDOR / impersonation)
- **Files:** `apps/api/src/routes/agent.ts:31`; `apps/api/src/routes/balance.ts:14`; `apps/api/src/routes/orders.ts:12`.
- **Problem:** The authenticated principal (`context.get('userId')` set by JWT middleware) is **ignored**. The body controls which user the cash-out/send/swap/balance flow operates on. Same flaw in `/balance` and `/orders/:id` via query string `?userId=<victim>`.
- **Impact:** Any caller can drive spend/consolidation/send logic against another user, or read their balance/orders (including redemption codes).
- **Fix:** Always derive identity from `context.get('userId')`. Remove `userId` from accepted body fields. Add Zod validation. For `/orders/:id` enforce tenancy at the repo layer (`findById(id, userId)` must require userId).

### C5. Hardcoded wallet addresses act as a funds escape hatch
- **Files:** `packages/infra-web3/src/private-key/private-key-provider.ts:339-342` (read), `:422-426` (send); mirrored in `apps/api/src/services/agent-chat-service.ts:558-565`; also `private-key-provider.ts:586-601` (`resolveSender`).
- **Problem:** The `SECURITY_BLOCKED wallet-whitelist` gate is bypassed by a hardcoded `KNOWN_ADDRESSES`/`KNOWN_WALLETS` map:
  ```
  0x4c7eB03cb8c77A27a55c691D74Ee27C1A57bd619  -> "Wallet 3"
  0x4DC637B52827fD797Bf480b62093a210Cb471581  -> "Wallet 4"
  ```
  Commit `28c983d` ("hardcoded wallet address fallback for send") confirms this was deliberate. Worse, `resolveSender` falls back to "first wallet with a private key" if no match — so a misconfigured/attacker-controlled `userId` moves funds from "Wallet 1".
- **Fix:** Remove `KNOWN_ADDRESSES` entirely. Derive the expected address from each `SEED_PHRASE_*` and only whitelist the *computed* address. Make `resolveSender` strict (return `undefined` if no match → existing `!fromWallet` SECURITY_BLOCKED branch fires).

### C6. Fake "delivered" receipt on real failure (any user)
- **Files:** `apps/api/src/services/agent-chat-service.ts:576-617` (send), `:800-839` (swap), `:1006-1020+` (fund-gas).
- **Problem:** When the real `sendPayment` returns an error, the service fabricates `mockTxHash = 0xsend-${Date.now().toString(16)}`, a random blockNumber, marks `status: 'delivered'`, and tells the user "Sent!" with an Arbiscan link that 404s. **Not gated on `DEMO_MODE` or `userId === 'demo-user'`** — triggers on any real failure for any user, including production users whose send genuinely failed.
- **Fix:** Only enter the demo-fallback branch when `isDemo(userId)` or explicit `DEMO_MODE`. On real failure, propagate the error.

---

## HIGH

### H1. Openfort `settlePayment` / `sendEth` send to ANY address, no validation
- **Files:** `packages/infra-web3/src/openfort/openfort-provider.ts:118-161` (`settlePayment`), `:172-214` (`sendEth`).
- **Problem:** Both take `to: string` straight from the caller with no whitelist. The agent wallet (Openfort, sponsored gas) is the highest-trust signing key in the system — draining it kills all gasless settlement. `sendEth` also casts `sendTransaction` to `Function` and `cachedAccount` via `as unknown` (lines 192, 194), bypassing the typed contract used by `settlePayment`.
- **Fix:** Apply the same wallet-whitelist gate as `private-key-provider`. Validate `to` with `ethers.isAddress`. Define an `OpenfortAccount` interface; stop the `as unknown` casts.

### H2. Slippage math is wrong — under-prices by ~40x (sandwich-exposed)
- **File:** `packages/infra-web3/src/private-key/private-key-provider.ts:734`.
- **Code:** `amountOutMinimum: amountInWei * 25n / 100000n * 95n / 100n` → evaluates to `amountIn * 0.0002375`. Comment says "5% slippage (500 bps)".
- **Problem:** So far below real expected output that any sandwich bot arbitrages the swap silently — the user always receives ≥ `amountOutMinimum` so the contract never reverts and tests pass.
- **Fix:** Compute `amountOutMinimum` from a real quote (`router.callStatic.exactInputStatic` or quoter), then apply `* 95n / 100n`. Reject swaps where expected/min ratio implies >5%.

### H3. No amount validation — negatives/NaN/Infinity reach `parseEther`
- **Files:** `packages/infra-web3/src/private-key/private-key-provider.ts:483`, `:531`.
- **Problem:** `amount.value` typed `number` flows straight into `ethers.parseEther(amount.value.toString())`. `parseEther("-5")` broadcasts a negative-value tx; `parseEther("NaN")` throws. The executor's only guard is `balance.value.total < intent.amount.value`, which is false for `NaN` (`NaN < NaN === false`) → check bypassed.
- **Fix:** At top of `sendPayment`, validate `Number.isFinite(amount.value) && amount.value > 0`; return a typed `INVALID_AMOUNT` error otherwise.

### H4. Bitrefill `Authorization: Bearer` follows cross-origin redirects
- **Files:** `packages/infra-offramp/src/bitrefill/client.ts:78-87`; `packages/shared/src/http.ts:38-91`.
- **Problem:** `Authorization: Bearer ${apiKey}` attached to every request via `requestJson`/`request`. `request()` calls `fetch` with no `redirect: 'manual'` and no per-redirect header stripping. Node `fetch` does NOT strip credentials on cross-origin redirects (browsers do). A redirect to another host leaks the bearer token.
- **Fix:** In `shared/http.ts`, set `redirect: 'manual'` (or `'error'`) for requests carrying an `Authorization` header, OR strip `Authorization`/`Cookie` when the redirect location host differs from the original.

### H5. `BITREFILL_BASE_URL` accepts any scheme (no https enforcement)
- **File:** `packages/shared/src/config.ts:38`.
- **Problem:** `z.string().url()` accepts `http://`, `ftp://`, etc. A typo or env injection (`BITREFILL_BASE_URL=http://...`) sends the bearer in plaintext, enabling MitM. Same concern for `RPC_URL_42161`/`RPC_URL_8453`, `APP_URL`, `DATABASE_URL`.
- **Fix:** Custom zod refinement requiring `https://` (allow `http://localhost`/`127.0.0.1` only when `NODE_ENV !== 'production'`).

### H6. No timeouts / AbortController / retry on any web3 external call
- **Files:** all RPC + SDK calls in `private-key-provider.ts` (`provider.getBalance`, `getFeeData`, `estimateGas`, `sendTransaction`, `tx.wait()` at :492, :545, :738, :754), `openfort-provider.ts`, `particle/universal-account.ts`.
- **Problem:** Grep for `AbortController|setTimeout|signal:` in web3 layer = **zero matches**. `tx.wait()` has no timeout and no `CONFIRMATIONS` → a stuck pending tx hangs the worker forever. Slow RPC hangs the API worker. No retry on transient 5xx (hard `UNKNOWN` error).
- **Fix:** Use `ethers.FetchRequest` with per-call timeouts; wrap external calls in `Promise.race` with `AbortController`. Add 1 retry on network errors only.

### H7. Rate limiter: spoofable IP + in-memory (multi-instance broken)
- **File:** `apps/api/src/app.ts:22-23, 55-63`.
- **Problem:** (a) Client-supplied `x-forwarded-for` first entry trusted as client IP — rotate header = fresh bucket per request. (b) Process-local `Map` — in serverless/multi-instance each instance has its own counters, defeating the limit entirely.
- **Fix:** Trust only the hop set by your own load balancer (last entry, or account-based limit behind auth). Back the limiter with Redis or platform rate-limit service.

### H8. `createInvoice` is non-idempotent but auto-retries
- **File:** `packages/infra-offramp/src/bitrefill/client.ts:78-87`.
- **Problem:** Default retry-on-5xx means a slow 502 from Bitrefill + retry can double-create an invoice. The domain generates a fresh `crypto.randomUUID()` per attempt (`executor.ts:104`) but Bitrefill's API uses its own invoice id; the key isn't sent as a Bitrefill idempotency token. A retried POST can produce two real invoices/payments.
- **Fix:** For `createInvoice` pass `retries: 0`. Add an `Idempotency-Key` header if Bitrefill supports one.

### H9. No global error handler; internal messages leaked
- **Files:** `apps/api/src/app.ts` (no `app.onError`); `routes/agent.ts:47-50`; `routes/transactions.ts:29-31, 59-61`; `routes/domain-errors.ts:38-39, 41-42`; `routes/auth.ts:22-27`.
- **Problem:** Unhandled exceptions propagate `err.message`/`detail` to the client. `toDomainErrorMessage` concatenates internal `error.cause` for `AGENT_WALLET_SETTLE_FAILED`. Can leak provider error bodies, stack snippets, internal ids. `auth.ts` returns Magic SDK `error.message` verbatim.
- **Fix:** Add `app.onError` that logs full error server-side (Pino) and returns generic `{ error: 'Internal server error' }` to client; strip `cause`/`detail` from non-debug responses.

### H10. LLM tool args for `send`/`swap`/`search` trusted unvalidated
- **File:** `packages/infra-ai/src/llm-intent-parser.ts:56-81`.
- **Problem:** Only `cash_out` runs `mapCashOutArgs()` (`llm-tools.ts:20-53`). The `send`/`swap`/`search_products` branches consume `fc.args.*` directly into a `CashOutIntent` with only a `typeof` check. `amount` has no upper bound / `> 0` / `Number.isFinite` check. `token`/`toWallet`/`fromWallet`/`targetToken` taken verbatim (re-validated downstream, but inconsistently).
- **Fix:** Route all tool args through a single `mapArgs()` validator per tool (mirror `mapCashOutArgs`). Enforce `Number.isFinite(amount) && amount > 0 && amount <= MAX_TRANSFER`. Restrict `token`/`targetToken` to the same symbol set the regex parser uses (`ARB|ETH|USDC|USDT|AVAX|MATIC|SOL`).

---

## MEDIUM

| ID | File:line | Problem | Fix |
|----|-----------|---------|-----|
| M1 | `app.ts:97-131` | `/health` unauthenticated + pings Gemini with real key on every hit → quota DoS + config oracle (`geminiConfigured`). | Protect `/health` (split into public liveness vs authed readiness); don't echo `geminiConfigured`. |
| M2 | `private-key-provider.ts:194-205` | Invalid seed phrase → wallet silently dropped (`catch {}`). Labels "Wallet 3/4" then misalign; `KNOWN_ADDRESSES` point to wallets that may not exist on-chain. | On parse failure, throw at construction in non-demo/prod (fail-fast), or log structured error with index. |
| M3 | `private-key-provider.ts:208-212` | Private keys printed to stdout (masked 6+4 hex chars) — bypasses `LoggerPort`. Class header promises "masked in all logs". | Never log any portion of a private key. Log only label + address. Route through injected `LoggerPort`. |
| M4 | `particle/ua-assets-mapper.ts:38-42` | Filters by literal symbol `'USDC'` but `tokenType` is not guaranteed → `settlementUsd=0` and `requiresConsolidation=true` always → every cash-out calls `consolidate()` which always fails. | Match by normalized token identifier (address vs known USDC list — codebase already has it in `private-key-provider.ts:27`). |
| M5 | `private-key-provider.ts:105` | `MAX_GAS_PRICE_GWEI = 50` fixed — wrong for Avalanche (regularly 25-30, spikes >50 → rejects legit txs indefinitely) and meaningless for Arbitrum L2 (real cost is L1 calldata, not checked). | Per-chain cap `{ 42161: 0.1, 8453: 0.1, 43114: 250 }`; on L2s also enforce USD max via `gasLimit * gasPrice * nativePrice`. |
| M6 | `infra-ai/llm-reply-strategy.ts:116-132` | Bitrefill product names (`p.name`) and `context.error` interpolated into LLM prompt unescaped → prompt-injection vector. | Wrap in delimiters (`<untrusted>…</untrusted>`); instruct system prompt never to obey instructions inside. |
| M7 | `domain/intent-parser.ts:201, 219-228` | Send/swap `amount.value` carries `currency:'USD'` but is a token quantity → `SecurityChecker` compares token units vs USD thresholds. Check is effectively meaningless for send/swap. | Give send/swap their own amount type, or skip USD check for non-cash-out + apply token cap. |
| M8 | `domain/executor.ts:118-120` | Silently overwrites `order.userId` with caller's. Combined with `OrderRepository.findById(id, userId?)` (optional) = no hard tenancy. | Treat userId mismatch as error; make `findById` require userId; enforce tenancy at repo layer. |
| M9 | `agent-chat-service.ts:50-55` | `pendingConfirmations`, `conversationHistory`, `entryTimestamps` in Maps → break in multi-instance. | Move to shared store (Redis/DB) keyed by user, or make API stateless (sign pending plan as client token). |
| M10 | `bootstrap/...:313-318` | `hybridAgentWallet.settlePayment` fakes tx hash if `to === 0x…dEaD` without `isDemo` check → real settlement to burn address silently "succeeds". | Gate on `isDemo(params.from)` or order id, not destination address. |
| M11 | `infra-offramp/adapter.ts:95-100, 107-112` | Offramp errors leak raw upstream provider `error.message` to users (system prompt says "never expose technical details" but deterministic path bypasses it). | Log raw server-side; return sanitized `DomainError` message. |
| M12 | `domain/router.ts:11-13` | `CheapestStrategy.select` non-null `!` on `[...quotes].sort()[0]` — safe today but public interface; future caller with `[]` gets undefined deref. | Guard inside `select` (`if (!quotes.length) throw`). |
| M13 | `domain/intent-parser.ts:235-264` | Swap parser accepts `tokenIn === tokenOut` (e.g. "swap 1 ETH for ETH") → no-op swap confirmed. | Reject when equal with typed error. |

---

## LOW / INFO (notables)

- **L1** `private-key-provider.ts:45-49` — Hardcoded USD prices (`ETH=2500`, `AVAX=18`, `ARB=0.088` which today is ~$0.30-0.50, off 4-5x). `total` and executor's `balance.value.total < intent.amount.value` use these. Fetch from oracle (Chainlink) at balance-read time with cache.
- **L2** `private-key-provider.ts:333-336` — Fake hardcoded balances for "Wallet 3/4" (`0.0315 AVAX`) always injected (modulo dedupe). UI lies if those wallets move. Looks like debug that shipped. Remove.
- **L3** Cookie `maxAge=7d` (`app.ts:152`) > JWT `exp=24h` (`auth-service.ts:73`) → 6-day window of invalid-cookie 401s (or demo fallback).
- **L4** `web/.../AgentTurn.tsx:17-41` — Markdown link URLs from LLM not sanitized (`javascript:` possible). React escapes children but validate `/^https?:\/\//i` before `href`.
- **L5** `domain/security.ts:81-98` — `SecurityChecker` **fail-open** (policy-store error → `ALLOW`). For a security control should be fail-closed.
- **L6** `infra-ai/gemini-provider.ts:131-138` — No timeout on Gemini `fetch` (doesn't use shared `request()`). Hung connection blocks request.
- **L7** `bootstrap/...:111` + `:313-318` — Demo uses burn address `0x…dEaD`; if non-demo routed through demo provider (e.g. provider list empty), real payment to burn address silently "succeeds".
- **L8** `app.ts` — `effectiveSecret = jwtSecret ?? 'dev-insecure-secret-change-me'`; only throws in `isProduction && !isDemo`. Staging/dev with no `JWT_SECRET` signs JWTs with publicly-known secret → token forge. Always require strong secret outside localhost; go through `loadConfig()` not direct `process.env`.
- **L9** JWT has no `iss`/`aud` claims; `jwtVerify` doesn't check them → any token signed with same secret accepted.
- **L10** `sameSite` inconsistent: `Strict` for demo login (`app.ts:150`), `Lax` for Magic login (`auth.ts:33`). Centralize cookie options.
- **L11** `infra-db/.../webhook-event-store.ts` — Dedup by `(providerId, eventId)` only dedupes retries; once C1 is fixed, also enforce monotonic status state machine in `orders.updateStatus`.
- **L12** `infra-web3/openfort/openfort-provider.ts:137` — `parseUnits(String(amount), 6)` hardcodes 6 decimals; signature accepts arbitrary `token`. 18-decimal token → wrong magnitude.
- **L13** No CORS policy set on the API (currently implicit-safe via SameSite, but worth explicit allow-list for the web origin).

---

## Audit methodology

1. Invoked `code-review` + `security-auditor-blockchain` skills for the checklist framework.
2. Dispatched 3 parallel sub-agents (Explore type) to audit in depth:
   - Agent A → web3/funds layer (`packages/infra-web3/**`, `transaction-planner*`, related wiring).
   - Agent B → API/auth (`apps/api/src/**`, offramp, db, middleware).
   - Agent C → domain/AI/frontend (`packages/domain`, `packages/infra-ai`, `packages/infra-offramp/bitrefill`, `packages/shared`, frontend hotspots).
3. Manually re-verified all CRITICAL findings against source (`adapter.ts:154`, `agent.ts:31`, `private-key-provider.ts:333-342`).
4. Confirmed `.env` is not tracked in git; confirmed domain `typecheck` passes clean.
