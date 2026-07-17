# Handoff — Current Snapshot

Last updated: 2026-07-15 (OKX AI Genesis: ASP #5979 registered + activated. HackQuest: submission form ready.)

## Strategic direction — CONFIRMED

**Pouch = conversational off-ramp agent.** AI agent that converts crypto to real-world value (gift cards, top-ups, eSIM) via natural language. Cross-chain consolidation via Particle UA + EIP-7702.

Full design spec: [`docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md`](./superpowers/specs/2026-07-13-pouch-offramp-agent-design.md)

### Why this direction (research-backed)
- **0 competitors** in off-ramp niche among 23 active UXmaxx projects (blue ocean)
- **0 historical hackathon winners** in crypto-to-gift-card or AI-agent-off-ramp
- **Differentiator vs incumbents:** chain abstraction on the INPUT (Bitrefill/Coinbase/x402 are all single-chain USDC)

### Bounties targeted ($4.1k-$5.1k potential — ZeroDev dropped 2026-07-14)
- UA Track ($1.5-2.5k) — cross-chain consolidation via UA 7702
- Arbitrum ($2k) — settlement chain = Arbitrum One (already wired)
- Magic Labs ($500) — blind signatures, zero popups
- Openfort ($100) — gas sponsorship via agent backend wallet (Phase 4, spec written)

### Cut from scope
- Reloadly (not a bounty, eats 1.5 days)
- x402 / EIP-3009 (confirmed bug: reverts in UA 7702)
- ZeroDev session keys (complexity; blind signatures cover the narrative)
- Web comercial / landing (minimalist: shows functionality, not marketing)

---

## Verified state

The workspace currently passes:
```bash
pnpm dev:api     # ✅ boots: "Pouch API listening on http://localhost:3001" (runtime blocker fixed 2026-07-14)
pnpm dev:web     # ✅ Next.js 15 on :3000, proxies /api/* → :3001 (Phase 3)
pnpm typecheck   # 8/8 packages
pnpm test        # 104 tests passing (56 baseline + 36 Phase 2 + 12 web Phase 3)
pnpm build       # 8/8 packages
```

### Phase 3 E2E demo flow — VERIFIED (2026-07-14)

With both `pnpm dev:api` + `pnpm dev:web` running (no Magic key needed):
- `GET /api/health` → `{"ok":true,"service":"api","mode":"demo"}` (via the Next proxy)
- `GET /api/balance?userId=demo-user` → `{"total":150,"assets":[...]}`
- `POST /api/agent/chat` `{"message":"Cash out $25 to Amazon"}` → full `AgentChatResponse`: 4-step trace (`Reading balance` → `Finding best provider [cheapest]` → `Creating order` → `Signing payment [NO POPUP]`) + conversational reply + parsed intent.
- The web app (`localhost:3000`) renders the chat UI in demo mode (no Magic key → ChatView directly); BalancePill shows `$150.00 · 1 asset`; suggestion chips + demo banner present; sending a message renders the user bubble + agent bubble (reply + trace timeline + receipt card).

## Implemented API surface

- `POST /agent/chat` — conversational cash-out (returns trace)
- `GET /balance` — unified balance (auth context or demo fallback)
- `GET /orders/:id` — order detail (ownership-filtered by userId)
- `POST /webhooks/bitrefill` — idempotent webhook (Gap F fixed: 2-arg verifyWebhook)
- `POST /auth/callback` — Magic DID → JWT cookie (Phase 1)
- `POST /auth/logout` — clear session cookie (Phase 1)
- `POST /transactions/plan/consolidate` — plan UA consolidation, return unsigned rootHash (Phase 1)
- `POST /transactions/plan/payment` — plan UA payment, return unsigned rootHash (Phase 1)

## What is real vs demo

### Real / production-shaped
- Monorepo + package boundaries (hexagonal, domain isolation)
- Domain: router / executor (emits trace steps) / typed errors / IntentParser + IntentParserStrategy
- Bitrefill adapter with quote pricing, canonical package_id, webhook verification, redemption fetch
- Drizzle-backed repositories (orders + webhook events + users)
- Runtime bootstrap with env-driven provider loading and fail-fast
- `ParticleAccountProvider` — real read-only balance via UA SDK `getPrimaryAssets()` (Phase 1)
- Auth: `@magic-sdk/admin` DID verification → `jose` JWT cookie (Phase 1)
- Transaction planner: `TransactionPlanner` plans UA txs, returns unsigned plans for browser signing (Phase 1)
- Initial Drizzle migration generated (`packages/infra-db/drizzle/0000_*.sql`)

### Demo / temporary (until manual gates run)
- `infra-web3` defaults to `WEB3_PROVIDER_MODE=demo` — `DemoAccountProvider` simulates balances/payments
- Auth middleware has `allowDemoFallback: true` in demo mode (no cookie → `demo-user`); production enforces 401
- Intent parser uses Gemini function-calling (Phase 2) when `LLM_PROVIDER=gemini`+`GEMINI_API_KEY` set, else regex — and falls back to regex on ANY LLM failure (demo never breaks). Reply is conversational (LLM) or template, same fallback rule.
- Frontend (Phase 3): Magic login modal + chat UI + agent trace timeline + receipt card + balance pill + zero-popup counter. Works in demo mode without a Magic key (verified E2E). Real Magic auth + UA 7702 signing = Phase 4 (gated on Manual Gate 1).
- The spike script (`packages/infra-web3/spike/ua-spike.mts`) is written but NOT yet run against real funds

---

## Phase status

### Phase 0 — Domain foundation (DONE)
- ✅ `TraceStep` + `TraceRecorder` in domain; `CashOutExecutor` emits trace; surfaced via `AgentChatResponse.trace`
- ✅ `IntentParserStrategy` interface (LLM parser injectable in Phase 2)
- ✅ Gap F fixed: `BitrefillAdapter.verifyWebhook(payload, headers)`
- ✅ Ownership plumbing: orders carry `userId`; repos + `/orders/:id` filter by it
- ✅ `LLM_PROVIDER`/`GEMINI_API_KEY`/`LLM_MODEL` in Zod config
- ✅ `users` unique indexes on `magic_public_key` + `evm_address`

### Phase 1 — Web3 spike + auth (DONE — code complete, 2 manual gates pending)
- ✅ Raw-key UA spike script (`packages/infra-web3/spike/ua-spike.mts`) — validates Particle UA + 7702 end-to-end
- ✅ `ParticleAccountProvider` (read-only balance via `getPrimaryAssets`); `factory.ts` particle mode no longer throws
- ✅ Auth: `MagicAdminLike` → `AuthService` (DID validate → upsert → session JWT via jose)
- ✅ `createAuthMiddleware` (JWT cookie → ctx.userId/evmAddress; demo fallback for tests/dev)
- ✅ `/auth/callback` + `/auth/logout` + `/transactions/plan/*` routes
- ⏭️ **MANUAL GATE 1:** Run the spike (needs ~$1 USDC + Particle creds): `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike`
- ⏭️ **MANUAL GATE 2:** Apply DB migration (needs live Postgres): `pnpm db:migrate`
- ⏭️ Frontend-driven signing (Magic signs rootHash + 7702 auths in browser) — Phase 3

**Architecture decision (research-backed, 2026-07-13):** Magic signing is browser-only. The server plans UA transactions (`createConvertTransaction`/`createTransferTransaction`) and returns unsigned plans; the browser signs the `rootHash` + 7702 auths via Magic, then `sendTransaction`. The server-side `AccountProvider.consolidate`/`sendPayment` return typed errors in real Particle mode (they cannot sign); `DemoAccountProvider` simulates them for tests/dev.

**Particle UA testnet:** Unavailable. The incentivized testnet ended Sep 2025; UA V2 (launched Jul 2026) is mainnet-only. The spike uses ~$1 real USDC. SDK version: `@particle-network/universal-account-sdk@^2.0.3` (NOT beta — verified).

### Phase 2 — LLM layer (DONE — code complete; real API key optional)
- ✅ `packages/infra-ai/` — provider-agnostic `LLMProvider` port + `GeminiProvider` adapter (`@google/genai` function-calling)
- ✅ `LlmIntentParser` (implements `IntentParserStrategy`) with regex fallback on ANY failure (provider error / non-cash_out function / plain text / bad args)
- ✅ `ReplyStrategy` port (domain) + `LlmReplyStrategy` (conversational reply, deterministic template fallback)
- ✅ Factory (`createLlmProvider` / `createIntentParser` / `createReplyStrategy` / `createAgentLlm`) — SDK imported ONLY in `factory.ts`, gated behind `LLM_PROVIDER`+`GEMINI_API_KEY`
- ✅ Wired into `createRuntimeAppServices` (LLM when configured, regex + template otherwise); demo path untouched
- ✅ `IntentParserStrategy.parse` made async (required to host the async LLM call)
- ✅ `@google/genai@1.52.0` resolved; verified `gemini-2.0-flash` model wiring
- ⏭️ Admin supplies real `GEMINI_API_KEY` at demo time (regex always works without it — demo never breaks because of the LLM)
- ⏭️ Verified via unit + integration tests (32 in infra-ai + 2 runtime-wiring in api); **live-server smoke is blocked by a Phase 1 runtime issue** (see ⚠️ below), unrelated to Phase 2

> ✅ **Runtime blocker RESOLVED (2026-07-14).** The earlier diagnosis was wrong: the SDK *does* export `UNIVERSAL_ACCOUNT_VERSION` (verified in `.d.ts`, `.cjs`, and `.mjs` of `@particle-network/universal-account-sdk@2.0.3`; `import` works from `packages/infra-web3`). The real root cause was **deferred ESM module loading under pnpm + tsx**: `universal-account.ts` imported the SDK at module top-level, and `packages/infra-web3/src/index.ts` re-exported it via a barrel (`export * from './particle/universal-account'`). So any `import from '@pouch/infra-web3'` in `apps/api` linked the Particle SDK at startup, and its ESM named-export resolution failed in that context — throwing `does not provide an export named 'UNIVERSAL_ACCOUNT_VERSION'` regardless of `WEB3_PROVIDER_MODE`. **Fix:** the SDK import was moved *inside* `ParticleAccountProvider.getInstance()` (now async) and replaced the module-level `UniversalAccount` typing with a local `UniversalAccountLike`. Demo mode never resolves the SDK; particle mode loads it lazily on first use. Verified: `pnpm dev:api` now boots (`Pouch API listening on http://localhost:3001`), `pnpm typecheck`/`test`/`build` all pass 8/8.

### Phase 3 — Frontend (DONE — code complete 2026-07-14, E2E verified in demo mode)
- ✅ Tailwind v4 + design tokens (globals.css); same-origin `/api` proxy (next.config rewrites)
- ✅ Typed API client (`apiGet`/`apiPost` + `ApiError`, `credentials: 'include'`)
- ✅ Magic client wrapper (lazy singleton, `EVMExtension`, blind-signature login)
- ✅ SessionProvider (Magic → `/auth/callback` → httpOnly cookie; demo fallback when no Magic key)
- ✅ ChatProvider (`/agent/chat`), Landing + Magic login modal, session-gated page shell
- ✅ ChatView (header + BalancePill + zero-popup counter + demo banner), MessageList (user/agent bubbles + auto-scroll + empty-state suggestions), ChatInput (Enter to send), AgentTurn + TraceTimeline (NO POPUP emphasis) + ReceiptCard (polls `/orders/:id`)
- ⏭️ Real Magic auth needs `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` set (demo mode works without it)
- ⏭️ UA 7702 browser signing (`sign7702Authorization` + `/transactions/plan/*` → `sendTransaction`) — Phase 4, gated on Manual Gate 1 (the UA spike). A `ua-signer.ts` seam is sketched in the plan (Task 14) but not wired.

### Phase 4 — Bounties + polish (CODE COMPLETE 2026-07-14)
- ✅ **Spec written (2026-07-14):** [`docs/superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md`](./superpowers/specs/2026-07-14-pouch-phase4-openfort-gas-sponsorship.md)
- ❌ **ZeroDev SRA DROPPED (2026-07-14):** Researched pricing — free tier is testnet-only; production $69–500/mo. Particle UA is mainnet-only → ZeroDev testnet cannot route to it. Architecturally broken on a free budget, not just expensive. Bounty ($500) soltado. `/deposit` page dropped with it (it only existed to host SRA). `ZERODEV_PROJECT_ID` stays in config but factory ignores it.
- ❌ **Bitrefill real purchase DROPPED:** Mock fulfillment for dev AND demo. Zero cost.
- ✅ **Openfort gas sponsorship — BUILT:** `AgentWalletPort` (domain) + `OpenfortAgentWallet` (infra-web3, deferred ESM via lazy clientFactory) + `NoopAgentWallet` + `createAgentWallet` factory (sync, prod fail-fast). Two-step settlement trace (`Funding agent wallet [UA 7702]` → `Paid via Openfort gasless [NO POPUP]`). Runtime wired (sync, no boot change). ~22 new tests.
- ✅ **CI lint step** — `.github/workflows/ci.yml` runs typecheck + lint + test + build; eslint flat config (`eslint.config.mjs` + `typescript-eslint@^8`) added.
- ✅ **Demo hardening** — friendly error bubbles (domain-specific), balance skeleton loading, mobile responsive breakpoints, demo banner clarity.
- ✅ **Submission prep** — README rewritten (bounties + demo + env checklist), `docs/SUBMISSION.md` bounty mapping.

### Phase 5 — Deploy + Gemini (DONE 2026-07-15)
- ✅ **Vercel deploy LIVE:** https://pouch-orpin.vercel.app — chat UI + API en un solo proyecto Next.js
- ✅ **Hono API montada como Next.js Route Handler** (`apps/web/src/app/api/[...path]/route.ts`) — la API Hono corre como serverless function dentro de Next.js, sin servidor separado
- ✅ **`DEMO_MODE=true`** env override: el runtime short-circuit a `createDemoAppServices()` sin importar `NODE_ENV=production`. Funciona con `.trim()` porque Vercel añade newlines a los valores env
- ✅ **Gemini AI LIVE:** `GEMINI_API_KEY` + `LLM_PROVIDER=gemini` seteados en Vercel → respuestas conversacionales reales del bot (no templates)
- ✅ **LLM integrado en demo mode:** `createDemoAppServices()` ahora usa `createAgentLlm()` cuando `GEMINI_API_KEY` está disponible (regex fallback si no)
- ✅ **vercel.json** monorepo config (rootDirectory=apps/web, framework=nextjs, pnpm install)
- ✅ **next.config.ts** con `transpilePackages` para workspace packages + `serverExternalPackages` para SDKs pesados
- ✅ **GitHub repo:** https://github.com/ruwaq/pouch (código completo, sin CI workflow — bloqueado por scope del token)
- ⚠️ **CI workflow (`ci.yml`)** NO está en GitHub — el token OAuth de `ruwaq` no tiene scope `workflow`. El archivo existe localmente pero se removió del push. Para subirlo: crear un PAT con scope `workflow` o subirlo desde la UI de GitHub.

### Verified state (2026-07-15)
```bash
# Conversational agent with Gemini 3.5 Flash + multi-turn confirmation:
curl -s -X POST http://localhost:3001/api/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Cash out $50 to Amazon","userId":"demo-user"}'
# → "You have $100.00 across 3 chains. I'm ready to Cash out $50.00 to Amazon. Confirm?"

curl -s -X POST http://localhost:3001/api/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"yes","userId":"demo-user"}'
# → AgentChatResponse with 6-step trace [UA 7702] + [NO POPUP]

# Local:
pnpm typecheck   # 8/8 packages
pnpm test        # 127 tests
pnpm build       # 8/8 packages
pnpm dev         # API (:3001) + Web (:3000)
```

### Discord intel (2026-07-15)
- **Particle UA:** Mainnet-only (confirmado 3x por DevRel). No hay workaround.
- **Arbitrum:** Issues activos (Jul 14-15). "System maintenance" → usar Base como fallback.
- **Competencia:** 0 proyectos de off-ramp. Pouch = blue ocean.
- **ZeroDev SRA:** También mainnet-only (confirmado por kunal). Drop validado.
- **Todos los equipos:** Misma situación. Nadie tiene testnet. La recomendación oficial es mainnet con pequeños montos.

---

## Key files to continue from

### Plans & specs (read first)
- `docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md` — design spec
- `docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md` — phase index
- `docs/superpowers/plans/2026-07-13-pouch-phase0-domain-foundation.md` — Phase 0 (done)
- `docs/superpowers/plans/2026-07-13-pouch-phase1-web3-spike-and-auth.md` — Phase 1 (done)

### Runtime composition
- `apps/api/src/bootstrap/create-runtime-app-services.ts`
- `apps/api/src/app.ts`

### Domain (pure, tested, DO NOT rebuild)
- `packages/domain/src/types.ts` — AccountProvider, OffRampProvider, TraceStep, IntentParserStrategy
- `packages/domain/src/executor.ts` — CashOutExecutor (emits trace)
- `packages/domain/src/trace.ts` — TraceStep + TraceRecorder
- `packages/domain/src/intent-parser.ts` — regex IntentParser (implements IntentParserStrategy)

### Infra (real implementations)
- `packages/infra-web3/src/particle/universal-account.ts` — ParticleAccountProvider (read-only balance)
- `packages/infra-web3/src/particle/ua-assets-mapper.ts` — UA → domain Balance mapper
- `packages/infra-web3/src/factory.ts` — AccountProvider DI (demo + particle modes)
- `packages/infra-web3/spike/ua-spike.mts` — raw-key spike script (MANUAL GATE: run with funds)
- `packages/infra-offramp/src/bitrefill/*` — complete adapter
- `packages/infra-db/src/repositories/*` — Drizzle repos (orders + webhook events + users)

### API (Hono)
- `apps/api/src/middleware/auth.ts` — JWT cookie → ctx (demo fallback)
- `apps/api/src/services/auth-service.ts` — DID → JWT
- `apps/api/src/services/transaction-planner.ts` — UA tx planning (frontend signing seam)
- `apps/api/src/routes/` — all route definitions

## Notes for the next session
- **La demo está LIVE en https://pouch-orpin.vercel.app** — modo "Try Demo" (sin login), Gemini 3.5 Flash conversacional, multi-chain consolidation UA 7702 + Openfort gasless + NO POPUP.
- **Gemini 3.5 Flash funciona** — REST API directa, modelo `gemini-3.5-flash` (API key en `.env`, no commiteada). Si falla por cuota, el regex parser es el fallback automático.
- **Conversational agent implementado** — 4 tools (check_balance, search_products, cash_out, off_topic), multi-turno con confirmación antes de ejecutar. El usuario dice "yes" para confirmar, "no" para cancelar.
- **JWT_SECRET + WEBHOOK_SECRET generados** (2026-07-15). `vercel.json` limpio sin `DEMO_MODE`. Para producción: solo falta setear las credenciales de providers en Vercel.
- **Estrategia confirmada (2026-07-15):** Mainnet con ~$5 USDC. Particle UA NO tiene testnet (confirmado por DevRel en Discord 3 veces). Todos los equipos están en la misma situación.
- **⚠️ Arbitrum tiene issues (Jul 14-15):** "System maintenance" reportado por múltiples equipos. Si persiste, cambiar settlement a Base (`SETTLEMENT_CHAIN_ID=8453`). El código ya lo soporta.
- **Competencia:** Pouch es el ÚNICO proyecto de off-ramp (crypto → gift cards). 0 competidores directos en el hackathon.
- **Arquitectura de deploy:** la API Hono está montada como Route Handler de Next.js (`apps/web/src/app/api/[...path]/route.ts`), no como servidor separado. Un solo deploy en Vercel.
- **DEMO_MODE=true** es la variable crítica. Sin ella, Vercel (NODE_ENV=production) crashea porque loadConfig requiere DATABASE_URL, JWT_SECRET, etc. Para producción real: quitar DEMO_MODE y setear todas las credenciales.

### Gemini model constraint (2026-07-15)
- **⚠️  Only gemini-3.5-flash works.** gemini-2.0-flash → 404, gemini-2.5-* → 404. Model fallback array is empty in code.
- **Free tier:** 1,500 req/day. When rate-limited, replies fall back to bilingual templates (regex + templateReply).
- **Resilience:** Retry on 429/503 with exponential backoff (200ms, 400ms, 800ms). After 2 retries, falls back to templates.

### Latest refactor: Gemini-powered conversational replies (2026-07-15)
- **ReplyContext**: 9 scenarios (greeting, balance, search, confirmation, success, cancelled, insufficient, error, fallback)
- **LlmReplyStrategy v2**: Gemini generates ALL replies, not just cash-out success. Per-scenario prompt engineering.
- **Conversation memory**: last 10 messages per user stored in-memory, passed to Gemini for context.
- **System prompt**: rewritten with personality, reply guidelines per scenario, bilingual instructions.
- **Templates**: bilingual fallback for all 9 scenarios when Gemini is down.
- **136 tests** (33 infra-ai, 31 api, 23 infra-web3, 22 domain, 12 web, 9 infra-offramp, 4 shared, 2 infra-db)
- **All gates green**: 8/8 typecheck, 8/8 build, 8/8 test.
- Cleanup: deleted stale dist/ dirs, .vtt transcripts, empty scripts/ dir. Redacted GCP API key from git history.
- **Gemini funciona en demo mode:** `createDemoAppServices()` usa `createAgentLlm()` con env vars directos. Si GEMINI_API_KEY no está, usa regex fallback.
- **Vercel project:** `pouch` en el team `alpakas-projects` (cuenta `pepepop2000@gmail.com`). El git author debe ser `pepepop2000@gmail.com` para deployar (Hobby plan bloquea otros autores).
- **GitHub repo:** `ruwaq/pouch` — código completo menos `ci.yml` (scope del token). Para añadir CI: crear PAT con scope `workflow` o subir el archivo desde la UI.
- **Diferentes cuentas:** GitHub=`ruwaq` (PrometeoDEV), Vercel=`pepepop2000`. No están conectados — el deploy es via CLI, no via GitHub integration.
- Particle UA es mainnet-only. El spike usa fondos reales (~$1 USDC). Para hacerlo real en la demo: setear PARTICLE_*, MAGIC_*, OPENFORT_* en Vercel.
- The SDK's `package.json` has a broken `exports` field. Worked around via `paths` overrides.

---

## ▶️ How to resume the next session

### First message to send to the agent:
```
Continúa el proyecto Pouch. Lee docs/HANDOFF.md para el estado actual.

El proyecto está DEPLOYADO en Vercel (https://pouch-orpin.vercel.app) con
modo demo + Gemini AI. Estrategia confirmada: mainnet con ~$5 USDC
(Particle UA no tiene testnet — confirmado por DevRel en Discord).

Prioridad #1: migrar a producción real (quitar DEMO_MODE, setear keys).
Prioridad #2: pulir demo seed multi-chain + video.
Deadline: Jul 20, 2026.
```

### Credenciales necesarias (tener a mano antes de empezar):

| Servicio | Variables | Dónde conseguir |
|----------|-----------|-----------------|
| **Particle** | `PARTICLE_PROJECT_ID`, `PARTICLE_CLIENT_KEY`, `PARTICLE_APP_ID` | dashboard.particle.network |
| **Magic** | `MAGIC_SECRET_KEY`, `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` | magic.link → Dashboard |
| **Openfort** | `OPENFORT_SECRET_KEY`, `OPENFORT_WALLET_SECRET`, `OPENFORT_POLICY_ID` | openfort.io → Dashboard |
| **Bitrefill** | `BITREFILL_API_KEY`, `BITREFILL_API_SECRET` | bitrefill.com → Developers |
| **Supabase** | `DATABASE_URL` | supabase.com → Project settings |
| **Gemini** | `GEMINI_API_KEY` (ya está en Vercel) | aistudio.google.com |

### Si Arbitrum sigue con problemas:
```bash
# Cambiar settlement a Base:
SETTLEMENT_CHAIN_ID=8453
SUPPORTED_CHAINS=8453,42161
```

### What's done (don't redo):
- ✅ Design spec + competitive research + all docs
- ✅ Phase 0: domain foundation (trace, parser strategy, ownership, Gap F, config)
- ✅ Phase 1: web3 spike script + real Particle provider + full auth + transaction planner
- ✅ Phase 2: LLM layer (infra-ai + Gemini function-calling + regex fallback)
- ✅ Phase 3: Frontend (chat UI + agent trace + Magic login + receipt), E2E verified in demo mode
- ✅ Initial Drizzle migration generated
- ✅ Phase 4: Openfort gas sponsorship + CI lint + demo hardening (code complete, 126 tests)
- ✅ **Phase 5: Deploy a Vercel** — Hono API como Route Handler, DEMO_MODE, Gemini LIVE
- ✅ **Demo pública funcionando:** https://pouch-orpin.vercel.app
- ✅ **Phase 6: Conversational Agent (2026-07-15)** — Gemini 3.5 Flash, multi-turn confirmation flow, REST API (no SDK)

### Phase 6 — Conversational Agent (DONE 2026-07-15)
- ✅ **Gemini 3.5 Flash** — model default cambiado de `gemini-2.0-flash` (deprecado) a `gemini-3.5-flash` (stable)
- ✅ **REST API directa** — `gemini-provider.ts` usa `fetch()` a `generativelanguage.googleapis.com` en vez del SDK `@google/genai` (evita ESM issues en serverless)
- ✅ **4 tools** — Gemini maneja `cash_out`, `check_balance`, `search_products`, `off_topic`
- ✅ **Multi-turno con confirmación** — `AgentChatService` rewrite completo:
  - `check_balance` → muestra balance multi-chain
  - `search_products` → busca productos disponibles
  - `cash_out` → **NO ejecuta**. Muestra plan y pide confirmación ("¿Confirmas?")
  - `off_topic` → respuesta conversacional
- ✅ **Estado de conversación** — intent pendiente guardado en `Map<userId, PendingCashOut>`. Confirmaciones: `yes`, `ok`, `do it`, `confirm`, `sí`, `si`. Cancelaciones: `no`, `cancel`, `never mind`.
- ✅ **Hybrid services** — demo-user usa memoria + simulación; real users usan DB + Particle UA + Openfort
- ✅ **Try Demo button** — landing page con botón "Try Demo" que hace login sin email vía `/auth/demo`
- ✅ **136 tests** (33 infra-ai, 31 api, 23 infra-web3, 22 domain, 12 web, 9 infra-offramp, 4 shared, 2 infra-db)

### Gemini 3.5 Flash key (AI Studio)
- **API Key:** (redacted — stored in `.env`, not committed)
- **⚠️  Only gemini-3.5-flash works.** gemini-2.0-flash → 404, gemini-2.5-* → 404. Model fallback array is empty in code.
- **Free tier:** 1,500 req/day. When rate-limited, replies fall back to bilingual templates (regex + templateReply).
- **Resilience:** Retry on 429/503 with exponential backoff (200ms, 400ms, 800ms). After 2 retries, falls back to templates.
- **Modelo:** `gemini-3.5-flash` (stable, Jul 2026)

---

## Discord research (2026-07-15) — Testnet SITREP

Se revisaron los canales `#❓technical-questions` y `#💬general` del Discord de UXmaxx. Esto es lo que todos los equipos están enfrentando:

### Particle UA es MAINNET-ONLY — confirmado por DevRel

El DevRel de Particle (Soos3D) lo dijo explícitamente 3 veces en el canal:

> **Jun 26:** *"Universal Accounts are only on mainnet. The architecture is complex and require many moving parts so testnets are not doable unfortunately."*

> **Jul 7:** *"Mainnet only."*

> **Jul 10:** *"Correct, the UA infra is only on mainnet. Unfortunately is not possible to run on testnet, too many variables and missing services."*

**Cero ambigüedad.** No hay testnet, no habrá testnet, y todos los equipos están en la misma situación.

### Todos los equipos preguntan lo mismo — NADIE tiene solución

| Equipo | Pregunta | Fecha |
|--------|----------|-------|
| Mogate.io | *"seems there's no UA for testnet yet?"* | Jun 26 |
| Rohith | *"Does UA with EIP-7702 support only mainnet?"* | Jun 26 |
| Horizon | *"Is UA 7702 supported on any testnet?"* | Jul 3 |
| dhruv | *"Particle rejects testnet chains... are we supposed to build directly for mainnet?"* | Jul 10 |
| AJ | *"The SDK supports only mainnet, should we demo in mainnet?"* | Jul 12 |
| Naman | *"Can we demo in preview mode instead of real chain?"* | Jul 13 |

La respuesta SIEMPRE es: **mainnet con pequeños montos (~$1-5).**

### ⚠️ Arbitrum tiene problemas (Jul 14-15, 2026)

> **Chris Gold (ayer):** *"System maintenance, please use SEND/TRANSFER/SELL feature to transfer your assets immediately"* en Arbitrum mainnet.

> **Soos3D (ayer):** *"Yes, I believe we have some issue on Arbitrum at the moment. We are working on it."*

**Estrategia:** Si Arbitrum sigue con problemas, cambiar settlement a **Base (8453)** — ya está en `SUPPORTED_CHAINS` y el código lo soporta sin cambios.

### Competencia directa

| Proyecto | Qué hace | Compite con Pouch? |
|----------|----------|---------------------|
| **Beam** (pankaj) | Send-money-by-link, settle en Arbitrum | ❌ Es send, no cash-out |
| **Enigma of Alchemist** (Ash) | Web3 3D game | ❌ Gaming |
| **Otros** | DeFi, payments, social | ❌ Nadie en off-ramp |

**Pouch sigue siendo el ÚNICO proyecto de off-ramp (crypto → gift cards/top-ups).** Blue ocean confirmado.

### ZeroDev SRA también es mainnet-only

> **kunal (ZeroDev, Jul 6):** *"We do support testnets for sponsorship but not SRA."*

Esto confirma que el drop de ZeroDev fue correcto — incluso si no hubiera sido por pricing, SRA no funciona en testnet.

### Estrategia confirmada

| Decisión | Razón |
|----------|-------|
| **Mainnet con ~$5 USDC** | Única opción viable. Recomendada por Particle. Todos los equipos hacen lo mismo. |
| **Settlement chain: Base (8453) como fallback** | Arbitrum tiene issues ahora mismo. Cambiar `SETTLEMENT_CHAIN_ID` si es necesario. |
| **Demo mode para desarrollo, real para la demo final** | Ya tenemos ambos. El switch es solo cambiar env vars. |
| **No perder tiempo buscando testnet** | No existe. Punto. |

---

### What's left (priorizado para el hackathon — deadline Jul 20)

| # | Tarea | Prioridad | Estado |
|---|-------|-----------|--------|
| 1 | **Migrar a producción real** — setear Particle + Magic + Openfort keys. Quitar `DEMO_MODE`. | 🔴 Crítica | 🟡 Listo (keys seteadas, vercel.json limpio) |
| 2 | **Pulir demo seed multi-chain** — balances en Arbitrum + Base con consolidation UA 7702 | 🟡 Alta | ✅ Hecho (2026-07-15) |
| 3 | **Conversational Agent** — Gemini 3.5 Flash multi-turno con confirmación | 🟡 Alta | ✅ Hecho (2026-07-15) |
| 4 | **Video/gif de la demo** para el submission | 🟡 Alta | ⬜ Pendiente |
| 5 | **Bitrefill API key** — off-ramp con gift cards reales | 🟢 Media | ⬜ Pendiente |
| 6 | **DB real** — probar persistencia en Supabase con usuarios reales | 🟢 Media | ⬜ Pendiente |
| 7 | **Subir CI workflow a GitHub** — crear PAT con scope `workflow` | 🟢 Baja | ⬜ Pendiente |

**Demo multi-chain (2026-07-15):** El demo seed ahora muestra 3 assets en 2 chains: USDC Arbitrum ($45), USDC Base ($30), ETH Base ($25). `requiresConsolidation: true` activa el trace "Consolidating via Universal Account [UA 7702]". BalancePill muestra nombres de chain (Arbitrum, Base) + dropdown pulido con indicador "Multi-chain — consolidates via UA 7702". ReceiptCard muestra chain name. Suggestion chips actualizados: "Cash out $50 to Amazon", "Show my balance", "Cash out $25 to Uber".

**Nota:** Si Arbitrum sigue con problemas, cambiar `SETTLEMENT_CHAIN_ID=8453` (Base) y `SUPPORTED_CHAINS=8453,42161`. El código ya lo soporta.

### Phase 4 decisions (LOCKED 2026-07-14 — do not revisit):
- **Openfort:** BUILD. Agent backend wallet (Opción A). `AgentWalletPort` in domain (optional), `OpenfortAgentWallet` in infra-web3. SDK `@openfort/openfort-node@^0.10.8`, deferred ESM import (same pattern as Particle fix).
- **ZeroDev SRA:** DROPPED. Free tier testnet-only × Particle mainnet-only = incompatible. No code. `ZERODEV_PROJECT_ID` ignored.
- **`/deposit` page:** DROPPED (only existed for ZeroDev).
- **Bitrefill real purchase:** DROPPED. Mock fulfillment everywhere.
- **CI lint + demo hardening + README:** IN SCOPE.

### Manual gates still pending (user-run, not agent):
1. **Spike (Phase 1):** `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike` (~$1 USDC, validates UA + 7702)
2. **DB migration (Phase 1):** `pnpm db:migrate` (needs live Postgres)
3. **Openfort dashboard setup (Phase 4):** Create project → enable backend wallets (get `WALLET_SECRET`) → policy (Base+Arbitrum, `sponsorEvmTransaction`) → feeSponsorship (`pay_for_user`) → 3 IDs in `.env`. Documented step-by-step in the Phase 4 spec §5.

### Bounties targeted ($4.1k–5.1k):
- UA Track ($1.5–2.5k) — Phase 1 (UA consolidation + 7702)
- Arbitrum ($2k) — settlement chain config
- Magic Labs ($500) — Phase 3 (blind signatures, zero popups)
- Openfort ($100) — Phase 4 (agent wallet + gas sponsorship)

### OKX AI Genesis — ASP Registration (2026-07-15)
- **Onchain OS:** 8 skills installed. Agentic Wallet: `prometeodev7@gmail.com` (Account 1).
- **ASP #5979 "Pouch":** Registered + activated. Service: "Crypto Cashout to Gift Cards" (A2A, 1 USDT).
- **AI Runtime:** Codex (switched from Claude — free, no subscription needed).
- **Activation:** Submitted for review (`approvalStatus: 2`). Visible on okx.ai after approval.
- **XPUB address:** `xpub6DASePz9gqLgPhXy5FZ1vh3kRH8JqLtKvBNPq7jQ3mNxVwRcYfH2sT8pLmA4kU9bWnC5dE6fJ7gK8hN9iM2o`
- **Wallet:** `0x28ab0e111de89ac3e6ee435babb71a2723a2d4f5` (XLayer, chain 196)

### HackQuest Submission (2026-07-15)
- **Form fields prepared** (name, intro, sectors, tech tags, description, MVP link, GitHub).
- **Contract address:** N/A — EIP-7702 delegation (no custom contract deploy). Explain in description.
- **Pendiente:** Screenshots (4 imágenes, 500×300 o 1280×720), videos (demo + pitch), conectar wallet.

### Verification (todo pasa):
```bash
pnpm typecheck   # 8/8 packages
pnpm test        # 126 tests
pnpm build       # 8/8 packages
# Demo live: https://pouch-orpin.vercel.app
```
