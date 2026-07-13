# Pouch — Conversational Off-Ramp Agent

**Design spec — 2026-07-13**
**Status:** Approved direction (off-ramp agent, gift cards). Pending implementation plan.

---

## 1. What we are building

**Pouch** is an AI cashout agent: a conversational interface where users speak in natural language and an AI agent converts their crypto into real-world value (gift cards, mobile top-ups, eSIM) — without the user ever seeing wallets, gas, chains, or signing popups.

**One-line pitch:** *"Talk to your money. It cashes out anywhere."*

### The 30-second demo

> User: "Cash out $50 to Amazon"
> Agent: *(inline trace visible)*
> - Parsed intent: cash_out, giftcard, Amazon, $50
> - Found balances: $12 ETH on Base + $25 USDC on Arbitrum + $18 SOL
> - Consolidating via Universal Account... ✓
> - Comparing providers: Bitrefill $50.00 vs [fallback] $50.50
> - Best option: Bitrefill
> - Purchasing... ✓ signed via Magic (0 popups)
> - ✅ Amazon gift card: [AMZN-XXXX] delivered

### Strategic positioning

Pouch occupies the **off-ramp** niche — converting crypto to real-world spendable value. This is:

- **Blue ocean in the UXmaxx hackathon:** 0 competitors doing off-ramp (research confirmed 23 active projects; none do cash-out to gift cards). The crowded spaces are P2P payments (6+ teams), merchant checkout (5+), and AI payments (4+).
- **Tier-1 recognized pain point:** Off-ramp / "last mile" is the most cited crypto friction of 2025-2026 (Mastercard, Federal Reserve, Atlantic Council, Paxos all published on it in the last 12 months).
- **Zero precedent as hackathon winner:** No crypto-to-gift-card or AI-agent-off-ramp project has won a chain abstraction hackathon. Maximum surprise factor for judges.
- **Defensible differentiator vs incumbents:** Coinbase AgentKit, Stripe, Cryptorefills x402, and Amazon Bedrock all do "AI agent pays with crypto" — but they are all **single-chain USDC**. Pouch's wedge is **chain abstraction on the input**: pay with ANY token on ANY chain (consolidated via Particle UA). No incumbente does this.

### The 5 bounties we target ($4,600–$5,600 potential)

| # | Bounty | Prize | How Pouch covers it |
|---|--------|-------|---------------------|
| 1 | Universal Accounts Track | $1.5k–$2.5k | Cross-chain consolidation via UA + EIP-7702 is core to the flow |
| 2 | Arbitrum bounty | $2k | Settlement chain = Arbitrum One (config via env, already wired) |
| 3 | Magic Labs bonus | $500 | Embedded wallet + blind signatures = zero popups (UX differentiator) |
| 4 | ZeroDev SRA subtrack | $500 | `createSmartRoutingAddress()` for cross-chain deposits — only 1 competitor (AVUS-RN) |
| 5 | Openfort subtrack | $100 | Agent backend wallet + gas sponsorship (policy) — only 1 competitor (Recurra) |

**Note:** Bounties 4 and 5 are "almost guaranteed" — near-zero competition based on GitHub research. The ZeroDev and Openfort subtracks each have only 1 known competitor.

---

## 2. What already exists (preserve, don't rebuild)

The following is **implemented, tested, and must not be thrown away:**

```
packages/domain/          ✓ router, executor, intent-parser, types, errors — pure, tested
packages/infra-offramp/   ✓ bitrefill adapter (client/mapper/adapter), provider registry
packages/infra-db/        ✓ schema (users, orders, webhook_events, balance_snapshots), repositories
packages/shared/          ✓ config (Zod), result types, http, logger
apps/api/src/routes/      ✓ /agent/chat, /balance, /orders/:id, /webhooks/bitrefill
apps/api/src/services/    ✓ agent-chat-service, balance-service, order-service, bitrefill-webhook-service
packages/infra-web3/      ✓ factory.ts (AccountProvider DI seam), demo-account-provider.ts
```

### Key seams ready for extension

1. **`AccountProvider` interface** (`packages/domain/src/types.ts:141-145`) — the contract. Three methods: `getUnifiedBalance`, `consolidate`, `sendPayment`. DemoAccountProvider implements it; we add a real Particle implementation.
2. **`createAccountProvider(config)` factory** (`packages/infra-web3/src/factory.ts:20`) — switches on `WEB3_PROVIDER_MODE`. The `particle` case currently throws; we implement it.
3. **`createRuntimeAppServices` DI hook** (`apps/api/src/bootstrap/create-runtime-app-services.ts:31`) — `dependencies.createAccountProvider` allows injecting a custom provider for testing.
4. **`createApp({ ...services })`** (`apps/api/src/app.ts:13`) — seam to inject auth middleware and services.
5. **Config schema** (`packages/shared/src/config.ts`) — already has `MAGIC_PUBLISHABLE_KEY`, `PARTICLE_*`, `OPENFORT_*`, `ZERODEV_PROJECT_ID`, `JWT_SECRET`. All optional, ready to be activated.
6. **DB schema `users` table** — has `magic_public_key`, `evm_address`, `email` columns ready for auth.
7. **Path aliases point to `.ts` source** — no build step needed in dev.

---

## 3. What is missing (the build)

### Gap A — 0 SDKs installed

No web3 SDK is in any `package.json`. Need to add (pinned versions from Particle DevRel + npm research):

- `@particle-network/universal-account-sdk@^2.0.0-beta.3` — Universal Account, EIP-7702 (DevRel-confirmed version for this hackathon)
- `ethers@^6.16.0` — **v6 mandatory** (v5 lacks `authorizeSync` / `hashAuthorization` for 7702)
- `magic-sdk` + `@magic-ext/evm` — embedded wallet, blind signatures, EIP-7702 sign
- `@openfort/openfort-node@^0.10.8` — agent wallet + gas sponsorship (policy)
- `@zerodev/smart-routing-address@^0.2.5` — Smart Routing Address (SRA)
- `jose` — JWT verification (Magic DID token → our JWT)

### Gap B — Particle UA provider is a stub

`createAccountProvider` throws on `particle` mode. The `particle/`, `magic/`, `openfort/`, `zerodev/` directories in `infra-web3` are empty. We need:

- `packages/infra-web3/src/particle/universal-account.ts` — implements `AccountProvider` using the UA SDK in headless Node mode (confirmed viable via `universal-account-example` repo).
- `packages/infra-web3/src/chains.ts` — chain config from env (no hardcoding).

### Gap C — No auth

`userId` comes from body/query (defaults to `'demo-user'`). `JWT_SECRET` is in config but is dead code. No middleware. `/orders/:id` has no ownership check.

### Gap D — No migrations

No `drizzle/` directory. `db:migrate` runs `drizzle-kit push` (no versioned migration files).

### Gap E — No frontend (beyond static landing)

Next.js 15 + React 19 scaffold exists, but no Tailwind, no client components, no `@pouch/infra-web3` dependency, no chat UI.

### Gap F — Minor bugs

- `/orders/:id` has no `userId` param → no ownership check.
- `OffRampProvider.verifyWebhook` signature mismatch (1 arg in some implementations vs 2 in interface).

---

## 4. Architecture

### 4.1 Layer diagram (extends existing)

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15)                                  │
│  - Chat window + inline agent trace + receipt card      │
│  - Magic login (embedded wallet, blind signatures)      │
│  - Deposit page (ZeroDev SRA address + QR)              │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS + JWT cookie
┌────────────────────────▼────────────────────────────────┐
│  API (Hono)                                             │
│  - Auth middleware (verify Magic DID → issue/verify JWT) │
│  - /agent/chat  /balance  /orders/:id  /auth/*          │
│  - /webhooks/bitrefill  /deposit/address                │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Domain (pure, no SDKs)                                 │
│  - IntentParser → OffRampRouter → CashOutExecutor        │
│  - AccountProvider / OffRampProvider / OrderRepository   │
│    (interfaces only — implemented in infra-*)            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  Infra layer                                            │
│  infra-web3/        infra-offramp/   infra-db/           │
│  - particle/UA      - bitrefill       - Drizzle repos    │
│  - magic/wallet     - (registry)      - schema           │
│  - openfort/agent                                       │
│  - zerodev/sra                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Architecture principles (NON-NEGOTIABLE — from AGENTS.md)

1. **Domain isolation:** `packages/domain` imports NO SDKs. Pure logic, testable in milliseconds.
2. **Adapter pattern:** Each provider/SDK is interchangeable. Adding a provider = 1 new file.
3. **Config via env (Zod-validated):** Zero hardcoded chains, secrets, or URLs. Fail-fast on missing config.
4. **Idempotency:** Webhooks and orders deduplicate by ID. Survive retries.
5. **Error-first:** Typed errors (`Result<T,E>`), no loose exceptions.

### 4.3 Critical constraint: Particle UA is mainnet-only

Confirmed by Particle DevRel (Soos3D) in the hackathon Discord: "Universal Accounts are only on mainnet. the architecture is complex and require many moving parts so testnets are not doable."

**Implication:** The spike (Phase 1) uses real funds ($5-10 USDC). There is no testnet fallback for UA. The `DemoAccountProvider` remains available via `WEB3_PROVIDER_MODE=demo` for unit/integration tests and local dev without burning funds.

---

## 5. The web3 spike + fallback strategy

### Why spike-first

Particle UA + EIP-7702 via Magic is the highest-risk component (risk register #1). It must be validated early with real funds before building the full flow on top of it. If it blocks, we fall back gracefully.

> **Note on phasing:** The spike is the first implementation work (days 1-2 of the build). Phase references like "Phase 5" below map to the existing `docs/DEVELOPMENT_PLAN.md` timeline — the writing-plans step will produce the detailed day-by-day sequence.

### Spike scope (2 days, real funds $5-10 USDC)

1. **Magic login (browser):** Email/Google → embedded wallet EOA. Verify `sign7702Authorization` works.
2. **EIP-7702 delegation:** Delegate the EOA to the UA implementation contract on Base + Arbitrum (our source chains). Confirm via `getEIP7702Deployments`.
3. **Unified balance:** Call `getPrimaryAssets()` → see aggregated balances across chains.
4. **Cross-chain consolidation:** `createConvertTransaction` → consolidate scattered tokens to USDC on Arbitrum. One `rootHash` signature covers the whole bundle.
5. **Merchant payment:** Send USDC to a test address (Bitrefill's payment address or our own) from the UA.

**Reference repo to clone patterns from:** `github.com/Particle-Network/ua-7702-magic-demo` (the official Magic + 7702 demo, linked 3x by Particle DevRel as THE reference).

### Spike success criteria

- ✅ Magic login produces an EOA that can sign 7702 authorizations
- ✅ EOA delegates to UA implementation on Base + Arbitrum
- ✅ `getPrimaryAssets()` returns aggregated balance
- ✅ One cross-chain `createConvertTransaction` succeeds (funds move, tx hash returned)
- ✅ Payment from UA to an address succeeds

### Fallback (if spike blocks after 2 days)

If Magic 7702 sign or UA delegation fails irrecoverably:
- Keep the spike artifacts (what worked).
- Use Magic login + EOA (without 7702) for a **balance-read real + simulated transaction** flow.
- Narrativa honest: "We validate chain abstraction end-to-end; the demo uses balance-read real with transaction narration for the parts where 7702 delegation blocked us."
- Still covers Magic bounty ($500) and Arbitrum bounty ($2k, via settlement). Loses UA Track ($1.5-2.5k) but keeps the rest.

### Key technical details for the integration (from research)

- **ethers v6 mandatory** — v5 lacks `authorizeSync` / `hashAuthorization`.
- **Delegation is one-time per chain.** Pre-delegate Base + Arbitrum during onboarding for clean demo UX.
- **Flow:** `createConvertTransaction` → returns `userOps[]` with optional `eip7702Auth` → sign `rootHash` once → `sendTransaction` (one signature covers the whole cross-chain bundle).
- **Login social de Particle NO soporta 7702** (confirmed by DevRel). Magic (or Dynamic) is the only path. Magic is mandatory, not optional.
- **UA no soporta gasless nativo** (DevRel: "universal accounts don't support gasless yet"). UA handles gas via universal gas (pay with any token). Openfort covers gas sponsorship separately for the agent backend wallet.

---

## 6. Auth flow (DID → JWT cookie)

### Why

Today `userId` comes from body/query (defaults to `'demo-user'`). No session, no ownership. We need real identity for `/orders/:id` ownership checks and to persist the user's UA address.

### Flow

```
1. Frontend: Magic login (email/Google) → Magic SDK returns DID token
2. Frontend: POST /auth/callback { didToken } → API
3. API: Verify DID token with Magic SDK server-side (magic.token.validate)
       → extract wallet address + email + Magic public key
4. API: Upsert user in DB (users table: magic_public_key, evm_address, email)
5. API: Issue our own JWT (jose, signed with JWT_SECRET)
       → claims: { sub: userId, evmAddress, exp }
6. API: Set JWT in httpOnly cookie
7. Subsequent requests: Auth middleware reads cookie → verifies JWT → populates ctx.set('userId', ...)
8. /orders/:id now filters by userId (ownership check)
```

### Files to create

- `apps/api/src/middleware/auth.ts` — Hono middleware: read cookie → verify JWT (jose) → populate `ctx.userId`. Public routes (`/health`, `/auth/callback`, `/webhooks/*`) skip.
- `apps/api/src/routes/auth.ts` — `POST /auth/callback` (verify DID, upsert user, issue JWT), `POST /auth/logout` (clear cookie).
- Update `apps/api/src/routes/orders.ts` — add `userId` to query, filter by it.
- Update `apps/api/src/app.ts` — register auth middleware + auth routes.

### Why DID → JWT (not DID per request)

- JWT in httpOnly cookie is simpler for the frontend (no header management).
- One DID verification per session (on login), not per request.
- Enables ownership check on `/orders/:id`.
- Cookie-based auth works with SSE/streaming for the agent trace (if we add streaming later).

---

## 7. Frontend design

### Philosophy: demo técnica transparente, not producto comercial

Pouch is a **showcase técnico transparente**. The frontend is a panel of observability of the agent: every step of the flow (parse → routing → consolidation → settlement → delivery) must be **visible** to the judge, not hidden behind marketing.

**"Invisible para el usuario" ≠ "Invisible para el juez".** The end-user in the chat does not see wallets/gas/signatures (fulfills the pitch). But the UI has an **inline agent trace** that shows in real time what the agent is doing. This satisfies both "UX excellence (40%)" and "Technical quality (10%)" criteria simultaneously.

### Stack

- Next.js 15 (App Router) + React 19 — already scaffolded
- Tailwind CSS — styling layer
- shadcn/ui — component primitives (`Collapsible`, `Card`, `Badge`, `Button`, `Input`)
- react-resizable-panels — optional, for resizable layout
- `@pouch/infra-web3` — shared types (added as workspace dependency)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Pouch          Popups avoided: 0 🟢    Session: $500 / 1h    │
├────────────────────────────────────────────┬─────────────────┤
│                                            │                 │
│  [User] cash out 0.05 ETH to Amazon        │  (empty until   │
│                                            │   completed)    │
│  [Agent] Done — $142 Amazon card ready     │                 │
│   ▾ How I did this (5 steps)               │                 │
│   ● Parsed intent      0.2s ✓ [cash_out]   │  ┌───────────┐  │
│   ● Found balances     0.1s ✓ [3 chains]   │  │ Amazon    │  │
│   ● Consolidated       2.3s ✓ [UA 7702]    │  │ $142      │  │
│   ● Routed Bitrefill   0.4s ✓ [cheapest]   │  │ code…     │  │
│   ● Signed (7702)      1.1s ✓ [NO POPUP]   │  │ tx 0x…    │  │
│   ● Delivered          0.3s ✓              │  │ cost $0.02│  │
│                                            │  │ popups: 0 │  │
│                                            │  └───────────┘  │
│  [input] message...                    [↵] │                 │
└────────────────────────────────────────────┴─────────────────┘
```

### Component structure

```
apps/web/src/app/
├── layout.tsx                 (root layout, Tailwind, Magic provider)
├── page.tsx                   (chat page — main demo)
├── login/page.tsx             (Magic login screen)
├── deposit/page.tsx           (ZeroDev SRA address + QR)
└── components/
    ├── chat/
    │   ├── chat-window.tsx        (message list + input)
    │   ├── message-bubble.tsx     (user/agent bubble)
    │   ├── agent-trace.tsx        (collapsible inline timeline)
    │   └── step-row.tsx           (one step: status + label + duration + badge)
    ├── dashboard/
    │   ├── receipt-card.tsx       (transaction receipt after completion)
    │   ├── balance-card.tsx       (unified balance display)
    │   └── popups-counter.tsx     (header stat: popups avoided)
    └── login/
        └── magic-login.tsx        (Magic embedded wallet button)
```

### The "zero popup" visualization problem

"Zero popups" is abstract. The UI must make the absence of popups **visible**. Three techniques (from UI research):

1. **"NO POPUP" badge** on each signing step (distinct visual treatment — green check + pill badge).
2. **"Popups avoided" counter** in the header (converts absence into a positive metric, like a security dashboard "errors: 0").
3. **Session-scope card** showing what's pre-authorized (max $, assets, expires) — proves the absence is bounded and auditable, not magic.

### Agent trace: states and delivery model

Each step row has a status:
- `pending` (grey dot, "Waiting...")
- `active` (pulsing blue dot, "Consolidating...")
- `complete` (green check, "0.8s ✓")
- `error` (red x, with error message)

**Delivery model — synchronous with stagger animation (MVP).** The API returns the full trace array (all steps already `complete`) in a single synchronous response. The frontend renders the steps with a cosmetic stagger (e.g., 200ms delay per step, animating each from `pending` → `active` → `complete`) to produce the "live" feel without the complexity of SSE/WebSocket streaming. This achieves the same visual demo effect with a fraction of the implementation cost. True streaming is a stretch goal for Phase 5 polish if time allows.

The frontend renders the trace inline, collapsible, default-open during the demo.

---

## 8. Bounties implementation plan

### Bounty 1: Universal Accounts Track ($1.5k–$2.5k) — CORE
**Requirement:** UA SDK in EIP-7702 mode + at least one cross-chain operation.
**How:** The cash-out flow inherently requires cross-chain consolidation (user holds tokens on multiple chains → UA consolidates → pays Bitrefill). EIP-7702 delegation is the onboarding step.
**Deliverable:** Working demo where user logs in via Magic, agent consolidates cross-chain balances via UA 7702, and purchases a gift card.

### Bounty 2: Arbitrum ($2k) — ALREADY WIRED
**Requirement:** App deployed primarily on Arbitrum, chain-abstracted UX.
**How:** `SETTLEMENT_CHAIN_ID` config points to Arbitrum One (42161). The consolidation target and Bitrefill payment settle on Arbitrum. Already in config.
**Deliverable:** Settlement visible in the agent trace ("Settling on Arbitrum ✓").

### Bounty 3: Magic Labs ($500) — EMBEDDED WALLET
**Requirement:** Best embedded wallet UX, social login, invisible wallets.
**How:** Magic login (email/Google) produces an EOA. EIP-7702 delegation to UA is signed via Magic's `sign7702Authorization` (blind signature — zero popup). The "popups avoided" counter makes this visible.
**Deliverable:** Login with Magic, 7702 delegation without popup, counter showing 0 popups across the whole flow.

### Bounty 4: ZeroDev SRA ($500) — DEPOSIT PAGE
**Requirement:** `createSmartRoutingAddress()` for cross-chain deposits.
**How:** `packages/infra-web3/src/zerodev/sra.ts` calls ZeroDev SDK to generate a Smart Routing Address for the user. Frontend `/deposit` page shows the address + QR code. User can deposit any token on any chain → it arrives consolidated.
**Competitors:** Only 1 known (AVUS-RN). Near-guaranteed.
**Deliverable:** `/deposit` page with SRA address + QR, integrated into onboarding.

### Bounty 5: Openfort ($100) — GAS SPONSORSHIP
**Requirement:** Openfort wallet + gas sponsorship.
**How:** `packages/infra-web3/src/openfort/agent-wallet.ts` creates a backend agent wallet with Openfort. Gas sponsorship via policy (NOT x402 — the x402/EIP-3009 path is confirmed buggy in UA 7702, a participant reported USDC `isValidSignature` reverts). The agent wallet handles the Bitrefill purchase server-side, gasless.
**Competitors:** Only 1 known (Recurra). Near-guaranteed.
**Deliverable:** Agent wallet transacts gasless, visible in the trace ("Paid via Openfort gasless ✓").

### What we explicitly DO NOT build

| Cut feature | Reason |
|-------------|--------|
| Reloadly (2nd off-ramp provider) | Not a direct bounty. Eats 1.5 days. Smart routing demonstrated within Bitrefill (product comparison). |
| x402 / EIP-3009 | Confirmed bug: reverts in UA 7702. Openfort stays on gas sponsorship policy. |
| ZeroDev session keys | High complexity, limited time. "Zero popup" narrative covered by Magic blind signatures. |
| Web comercial / landing / hero sections | Confirmed: minimalist, shows functionality. Zero marketing. |

---

## 9. Data flow: end-to-end cash-out

```
User types: "cash out $50 to Amazon"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Frontend sends POST /agent/chat                       │
│    { message: "cash out $50 to Amazon" }                 │
│    + JWT cookie (userId from auth)                       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 2. API: Auth middleware → ctx.userId                     │
│    AgentChatService.handleMessage(message, userId)       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Domain: IntentParser.parse(message)                   │
│    → CashOutIntent { action: 'cash_out',                 │
│        category: 'giftcard', brand: 'amazon',            │
│        amount: { value: 50, currency: 'USD' } }          │
│    [TRACE STEP: "Parsed intent ✓"]                       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Domain: CashOutExecutor.execute(intent, userId)       │
│                                                           │
│    4a. AccountProvider.getUnifiedBalance(userId)         │
│        → Balance { total, assets[], requiresConsolidation }│
│        [TRACE: "Found balances ✓ [3 chains]"]            │
│                                                           │
│    4b. if requiresConsolidation:                         │
│        AccountProvider.consolidate(userId, chainId, token)│
│        → TxResult { txHash, chainId }                    │
│        [TRACE: "Consolidated via UA 7702 ✓"]             │
│                                                           │
│    4c. OffRampRouter.route(intent, providers)             │
│        → providers.searchProducts("amazon", {category})   │
│        → providers.getQuote(product, amount)              │
│        → RoutingDecision { quote, consideredProviders }   │
│        [TRACE: "Routed to Bitrefill ✓ [cheapest]"]       │
│                                                           │
│    4d. OffRampProvider.createOrder(orderRequest)          │
│        → Bitrefill adapter → POST /invoices              │
│        → Order { id, status: 'payment_pending',          │
│                   payment: { address, amount, chainId } } │
│                                                           │
│    4e. AccountProvider.sendPayment({                     │
│          from: userId, to: payment.address,               │
│          amount, chainId, token })                        │
│        → UA executes payment to Bitrefill address         │
│        → TxResult { txHash }                              │
│        [TRACE: "Signed via Magic (0 popups) ✓"]          │
│                                                           │
│    4f. OrderRepository.save(order)                        │
│    → return CashOutResult { orderId, status }            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 5. API returns:                                          │
│    { reply: "Done — Amazon gift card processing",         │
│      trace: [...steps],                                  │
│      orderId: "..." }                                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 6. (async) Bitrefill webhook → /webhooks/bitrefill      │
│    → verifyWebhook (idempotent by eventId)               │
│    → updateStatus(orderId, 'delivered', { redemption })  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Frontend polls GET /orders/:id (owned by userId)      │
│    → receives redemption.code                            │
│    → renders receipt card with gift card code            │
└─────────────────────────────────────────────────────────┘
```

### The agent trace shape

The executor emits structured trace steps that the API returns alongside the reply. Each step:

```typescript
interface TraceStep {
  id: string;                    // unique within the turn
  label: string;                 // "Consolidated via UA 7702"
  status: 'pending' | 'active' | 'complete' | 'error';
  durationMs?: number;           // filled on complete
  badge?: string;                // "NO POPUP", "cheapest", "3 chains"
  detail?: string;               // optional drill-in text
}
```

The API response shape (`AgentChatResponse`) is extended to include `trace: TraceStep[]`. The frontend renders this as an inline collapsible timeline inside the agent's chat turn.

---

## 10. Testing strategy

### Unit tests (Vitest, milliseconds)

- `packages/domain/` — IntentParser, OffRampRouter, CashOutExecutor with mock providers. **Already exists.** Extend with trace-step assertions.
- `apps/api/src/services/` — service layer with injected in-memory repositories. **Pattern already established** in `app.test.ts`.

### Integration tests (Vitest, mock external calls)

- Auth flow: Magic DID → JWT → middleware populates userId.
- Cash-out flow: chat → intent → router → executor → Bitrefill adapter (mocked HTTP) → order.
- Webhook: idempotent delivery, redemption persistence.

### Spike validation (manual, real funds)

- The 2-day web3 spike validates Particle UA + Magic 7702 with real USDC. This is manual, not automated.

### E2E (deferred)

- Full flow with real funds ($5-10 USDC) on Phase 5 (D8-D9). Record video backup.

---

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Particle UA mainnet issues during spike | Medium | High | 2-day spike + fallback (balance-read real + simulated tx). Don't build full flow until spike passes. |
| Magic 7702 sign method blocks | Low | High | Validated by Particle DevRel (`ua-7702-magic-demo` exists and works). Reference repo to clone. |
| Bitrefill API requires approval/keys | Medium | Critical | Use Bitrefill test products first. Adapter already implemented; needs real key validation (D3 task). |
| x402/EIP-3009 revert in UA 7702 | Confirmed | Medium | Avoid x402 entirely. Openfort uses gas sponsorship policy only. |
| Frontend scope creep | High | Medium | Minimalist mandate: chat + trace + receipt. No landing, no marketing, no extra pages beyond /deposit. |
| Demo crash on judging day | Medium | Critical | Record video backup (D9). Test E2E with real funds before submission. |

---

## 12. Success criteria (what "done" looks like for submission)

1. **Login:** User logs in with Magic (email or Google) → embedded wallet created.
2. **Onboarding:** EOA delegates to UA via EIP-7702 on Base + Arbitrum (one-time, zero popup).
3. **Balance:** User sees unified balance across chains in USD.
4. **Cash-out:** User types "cash out $X to [brand]" → agent consolidates cross-chain → buys gift card → delivers code.
5. **Trace:** Every step visible in the inline agent trace with durations and badges.
6. **Zero popup:** Counter shows "0 popups" across the whole flow. Signing step shows "NO POPUP" badge.
7. **Deposit:** `/deposit` page shows ZeroDev SRA address + QR.
8. **Receipt:** Completed cash-out shows a receipt card with gift card code, tx hash, cost, popups count.

---

## 13. Out of scope (deferred / cut)

- Reloadly second off-ramp provider (cut — not a bounty)
- x402 / EIP-3009 payment protocol (cut — confirmed bug in UA 7702)
- ZeroDev session keys (cut — complexity, blind signatures cover the narrative)
- Mobile native app (web-only, per DevRel guidance "prefer something we can run out of the box")
- AI model beyond keyword/regex intent parser (stretch — current IntentParser is keyword-based; LLM integration is Phase 5 polish if time allows)
- Production deployment hardening (rate limiting, observability beyond basic logging — Phase 5)

---

## References

- `ua-7702-magic-demo` (Particle official): https://github.com/Particle-Network/ua-7702-magic-demo
- `universal-account-example` (Node.js scripts): https://github.com/Particle-Network/universal-account-example
- Particle UA docs: https://developers.particle.network/universal-accounts/overview
- Bitrefill API: https://docs.bitrefill.com/
- Hackathon program: https://www.encodeclub.com/programmes/uxmaxx-hackathon
- Competitive research: 23 active projects identified, 0 in off-ramp niche
- Historical research: 0 hackathon winners in crypto-to-gift-card or AI-agent-off-ramp categories
