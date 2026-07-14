# Pouch — Phase 4: Openfort Gas Sponsorship + Demo Hardening

**Design spec — 2026-07-14**
**Status:** Approved scope (decisions confirmed 2026-07-14 with user).
**Depends on:** Phases 0–3 (all code-complete, E2E verified in demo mode).

---

## 1. What this phase is

Phase 4 closes the hackathon build. It lands the **one remaining executable bounty** (Openfort gas sponsorship, $100), the long-pending **CI lint step**, and the **demo hardening + submission prep** that turns "it works" into "it wins."

### Scope decisions (confirmed 2026-07-14)

| Decision | Resolution |
|----------|-----------|
| **ZeroDev SRA** | ❌ **DROPPED.** Researched 2026-07-14: free tier is testnet-only (10K credits/mo); production starts at $69/mo (Growth) or ~$500/mo (SRA base). Particle UA is mainnet-only (testnet ended Sep 2025) → ZeroDev testnet **cannot route to** Particle mainnet. Architecturally broken on a free budget, not just expensive. Soltamos los $500 del bounty. |
| **`/deposit` page** | ❌ **DROPPED.** It existed only to host ZeroDev SRA. Without ZeroDev there's no bounty and no UX gap to fill (UA deposit works implicitly). |
| **Bitrefill real purchase (~$1)** | ❌ **DROPPED.** Mock fulfillment for dev AND demo. Zero cost, zero demo risk. |
| **Openfort gas sponsorship** | ✅ **BUILD.** Free tier (2,000 ops/mo), 1 known competitor, $100 bounty. The only Phase 4 bounty we can execute for free. |
| **Integration model** | ✅ **Agent backend wallet (Opción A).** Openfort creates its OWN EOA + EIP-7702-delegates it to its "Calibur" implementation. Gas sponsorship only works for Openfort's own accounts — it CANNOT sponsor an external smart account (Particle UA). Confirmed by reading the 0.10.8 SDK types. So: Particle UA = the **user's** account; Openfort wallet = the **agent's** gasless signer that executes the Bitrefill purchase server-side. |

### Bounties targeted after Phase 4 ($4.1k–5.1k)

| # | Bounty | Prize | Covered by |
|---|--------|-------|------------|
| 1 | UA Track | $1.5k–2.5k | Phase 1 (UA consolidation + 7702) |
| 2 | Arbitrum | $2k | Settlement chain = Arbitrum One (config) |
| 3 | Magic Labs | $500 | Phase 3 (blind signatures, zero popups) |
| 4 | Openfort | $100 | **THIS PHASE** |

ZeroDev ($500) is out. Zero infrastructure cost across the entire demo.

---

## 2. Openfort integration — design

### 2.1 The narrative for judges

> "Pouch's agent doesn't just consolidate the user's cross-chain funds — it *executes the purchase on their behalf*, gasless, using an Openfort agent wallet with EIP-7702 + gas sponsorship. The user never signs a transaction. The agent pays nothing in gas. Zero popups, end to end."

The trace shows it: a new step `Paid via Openfort gasless` with a badge. This is the concrete artifact the Openfort bounty judges see.

### 2.2 Architecture — agent backend wallet as a separate actor

```
┌──────────────────────────────────────────────────────────────────┐
│  User's account (mainnet, EIP-7702)                              │
│  Particle Universal Account                                      │
│  - holds user's cross-chain balances                             │
│  - Magic blind-signs 7702 auths (Phase 1 seam, Phase 4 wire)     │
└─────────────────────────────┬────────────────────────────────────┘
                              │ (user funds consolidated → USDC on Arbitrum)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Agent's account (mainnet, EIP-7702)                             │
│  Openfort backend wallet ("Calibur" implementation)              │
│  - created server-side via openfort.accounts.evm.backend.create  │
│  - gas-sponsored via policy + feeSponsorship (pay_for_user)      │
│  - executes the USDC transfer to Bitrefill's payment address     │
└─────────────────────────────┬────────────────────────────────────┘
                              │ gasless ERC-20 transfer
                              ▼
                        Bitrefill payment address
```

**Why two accounts (not one):** Openfort cannot sponsor gas for Particle's UA (confirmed — its paymaster only evaluates transactions through its own account infra). So the agent wallet is a **separate, independent signer** that does the final leg (pay Bitrefill) gasless. The user's UA does the cross-chain consolidation (bounty #1); the agent wallet does the settlement payment gasless (bounty #5). Both are EIP-7702; both are zero-popup for the end user.

### 2.3 Domain seams (pure, no SDK)

Two new ports in `packages/domain/src/types.ts`, following the existing `AccountProvider`/`OffRampProvider` pattern:

```typescript
/** A gasless signer that the agent uses to settle an order payment. */
export interface AgentWalletPort {
  /** The agent wallet's address (where the UA funds the wallet before settlement). */
  getAddress(): Promise<Result<{ address: string }, DomainError>>;

  /** Send an ERC-20 `amount` of `token` to `to` on `chainId`, gas-sponsored. */
  settlePayment(params: {
    to: string;
    amount: Amount;
    token: string;
    chainId: number;
  }): Promise<Result<TxResult, DomainError>>;

  /** Human label for the trace badge, e.g. "Openfort gasless". */
  readonly label: string;
}
```

`CashOutExecutor` gets an optional `agentWallet?: AgentWalletPort` injected. **It is optional** so existing demo-mode execution and all current tests stay green unchanged.

### 2.4 Wiring into the executor — the settlement step

Today `CashOutExecutor.execute()` ends with `account.sendPayment(...)` (the UA paying Bitrefill directly), labeled `Signing payment [NO POPUP]`. We **refine** the flow rather than replace it:

- **Demo mode (no agent wallet injected):** unchanged. UA pays Bitrefill directly. Trace step: `Signing payment [NO POPUP]`.
- **Configured mode (agent wallet injected):** the UA consolidates funds to the **agent wallet's address** (not Bitrefill directly), then the agent wallet pays Bitrefill gasless. Two trace steps:
  1. `Funding agent wallet [UA 7702]` — UA → agent wallet (user's funds move to the gasless signer).
  2. `Paid via Openfort gasless [NO POPUP]` — agent wallet → Bitrefill (gas-sponsored, server-side).

This keeps the existing UA payment path intact (demo never breaks) while adding the Openfort-sponsored leg on top when configured. The agent wallet address is fetched once via `AgentWalletPort.getAddress()` and cached.

### 2.5 Infra layer

```
packages/infra-web3/src/
├── openfort/
│   ├── openfort-provider.ts    OpenfortAgentWallet implements AgentWalletPort
│   │                           (@openfort/openfort-node@^0.10.8)
│   └── openfort-mapper.ts      errors → DomainError
├── demo/
│   └── (existing DemoAccountProvider stays)
├── noop-agent-wallet.ts        NoopAgentWallet (throws AGENT_WALLET_NOT_CONFIGURED;
│                               factory default when OPENFORT_* unset)
└── factory.ts                  + createAgentWallet(config): AgentWalletPort
```

**`OpenfortAgentWallet` implementation shape** (from verified 0.10.8 SDK API):

```typescript
import Openfort from '@openfort/openfort-node';

export class OpenfortAgentWallet implements AgentWalletPort {
  readonly label = 'Openfort gasless';
  private readonly client: Openfort;
  private cachedAccount: { address: string; account: unknown } | null = null;

  constructor(
    secretKey: string,
    walletSecret: string,
    private readonly feeSponsorshipId: string,   // "fes_..." (linked to a policy)
    private readonly logger: LoggerPort,
  ) {
    this.client = new Openfort(secretKey, { walletSecret });
  }

  /** Lazily create/resolve the agent's backend wallet (idempotent per wallet id). */
  async getAddress(): Promise<string> { ... }   // openfort.accounts.evm.backend.create()

  async settlePayment({ to, amount, token, chainId }): Promise<Result<TxResult, DomainError>> {
    // 1. encode ERC-20 transfer calldata (ethers v6 TransactionDescription / manual)
    // 2. openfort.accounts.evm.backend.sendTransaction({
    //      account, chainId, interactions: [{ to: token, data: transferCalldata }],
    //      policy: this.feeSponsorshipId,
    //    })
    // 3. map result.response.transactionHash → TxResult
    // 4. on any SDK error → mapped DomainError via openfort-mapper
  }
}
```

**SDK import discipline:** `@openfort/openfort-node` is imported **only** inside `openfort-provider.ts`. The factory imports it lazily (same deferred-ESM pattern that fixed the Phase 1 Particle runtime blocker). Demo mode never resolves the SDK.

**Confirmed SDK facts (researched 2026-07-14 from 0.10.8 tarball + docs):**
- Constructor: `new Openfort(secretKey, { walletSecret })` — BOTH secrets required for backend wallets.
- Create wallet: `openfort.accounts.evm.backend.create()` → `{ id, address, custody, walletId, sign... }`. EIP-7702 delegation to "Calibur" is **automatic** on first tx per chain.
- Send gasless: `openfort.accounts.evm.backend.sendTransaction({ account, chainId, interactions, policy })`.
  - `interactions`: `[{ to: tokenAddress, data: transferCalldata }]` (raw calldata; no contract registration needed).
  - `policy`: the `feeSponsorshipId` (`fes_...`). ⚠️ The SDK type comment says "starts with pol_" but examples pass `sponsorship.id` (`fes_...`). **Test empirically first; default to `fes_...`.**
- Gas sponsorship = TWO linked objects: a `policy` (criteria rules) + a `feeSponsorship` (`pay_for_user` strategy, linked via `policyId`). The dashboard creates these once; we reference the `feeSponsorship.id` from env.
- Chains: Base (8453) ✅ + Arbitrum One (42161) ✅, both mainnet.
- Free tier: 2,000 ops/mo ($0.001/op overage). One wallet creation + N transfers fits easily.

### 2.6 Config

Already in `packages/shared/src/config.ts` (added Phase 0, currently unused):

```typescript
OPENFORT_SECRET_KEY: z.string().optional(),
OPENFORT_WALLET_SECRET: z.string().optional(),
OPENFORT_FEE_SPONSORSHIP_ID: z.string().optional(),
```

`ZERODEV_PROJECT_ID` stays in config but the factory ignores it with a warning log. Removing it is a later cleanup, not this phase.

**Fail-fast rule:** in `production` (`NODE_ENV=production`), if `OPENFORT_SECRET_KEY` is set but `OPENFORT_WALLET_SECRET` or `OPENFORT_FEE_SPONSORSHIP_ID` is missing → throw on boot (incomplete Openfort config). In dev/demo → fall back to `NoopAgentWallet` (demo path, never breaks).

### 2.7 Wiring into the runtime

`apps/api/src/bootstrap/create-runtime-app-services.ts`:
- After creating `accountProvider`, call `createAgentWallet(config)` → `AgentWalletPort | undefined`.
- Pass it into `new CashOutExecutor(router, providers, accountProvider, orders, logger, agentWallet)`.
- The agent wallet is **undefined** in demo mode (no Openfort keys) → executor runs the unchanged demo path. Configured mode → both settlement steps active.

### 2.8 Testing

- **Domain:** extend `CashOutExecutor` tests with a mock `AgentWalletPort` → assert the two-step settlement trace (`Funding agent wallet` + `Paid via Openfort gasless [NO POPUP]`). Assert demo path (no wallet) unchanged.
- **infra-web3:** `OpenfortAgentWallet` with a mocked `Openfort` client (inject a thin interface, not the SDK directly — so tests import no SDK). Assert `settlePayment` encodes calldata, calls `sendTransaction` with the right `policy`, maps success + each error class to `DomainError`.
- **Runtime wiring:** one integration test asserting configured-mode executor gets an `OpenfortAgentWallet`, demo-mode gets none.
- **No live Openfort calls in tests.** Real sponsorship is validated by a manual smoke step (the phase's one manual gate — see §5).

---

## 3. CI lint step

### What
Add a lint job to CI so quality gates run on every PR/push. AGENTS.md has listed "CI lint step" as pending since Phase 0.

### How
- Project uses GitHub Actions (check for existing `.github/workflows/`). If none exists, create `.github/workflows/ci.yml`.
- Job: `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build`. Cache `pnpm` store + turbo cache.
- Trigger: on push to `main`, PRs to `main`.
- Keep it free (GitHub Actions public repos = unlimited minutes).

### Verification
The workflow runs green on the current `main` (all gates already pass locally).

---

## 4. Demo hardening + submission prep

### 4.1 Demo hardening (frontend + API robustness)
- **Error states in the chat:** if `/agent/chat` returns a `DomainError`, render a friendly agent bubble ("I couldn't complete that — here's what happened: …") instead of a silent failure. Currently only success is wired.
- **Empty/loading states:** `BalancePill` skeleton while `/balance` loads; `ReceiptCard` already polls — verify it handles `404` (order not yet persisted) gracefully.
- **Mobile responsiveness:** the chat layout is desktop-first. Add responsive breakpoints (Tailwind) so the demo works if a judge opens it on a phone. Minimum: chat column full-width under `md:`, trace collapses cleanly.
- **Demo banner clarity:** the existing demo banner should state *what* is simulated (balances + payment) vs real, so a judge isn't confused. One line.

### 4.2 Submission prep (docs)
- **README** (root): concise submission README — pitch, demo gif/video placeholder, how to run (`pnpm dev`), env var checklist, which bounties we target + where each is satisfied. English-only (judges are international).
- **AGENTS.md + HANDOFF.md:** mark Phase 4 done, update bounty table (ZeroDev out), record the Openfort agent-wallet decision.
- **Bounty mapping doc:** a short `docs/SUBMISSION.md` (or section in README) that maps each criterion of each target bounty → where it's satisfied in code/demo. Judges read this to verify.

### 4.3 Explicitly NOT in scope (cut for focus)
- No `/deposit` page.
- No new off-ramp provider.
- No streaming/SSE (synchronous-with-stagger trace from Phase 3 stays).
- No real Bitrefill purchase.
- No production deployment (local demo only; deploy is post-hackathon).
- No ZeroDev code (dir stays empty; `ZERODEV_PROJECT_ID` ignored).

---

## 5. Manual gates (user-run, not agent)

Phase 4 adds **one** manual gate (Openfort) to the two still pending from Phase 1:

| # | Gate | What | When |
|---|------|------|------|
| 1 (Phase 1) | UA spike | `SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike` (~$1 USDC) | Before demo if real UA flow is wanted |
| 2 (Phase 1) | DB migration | `pnpm db:migrate` (needs live Postgres) | Before demo if persistence wanted |
| 3 (Phase 4) | Openfort dashboard setup | Create Openfort project → enable backend wallets (get `WALLET_SECRET`) → create a policy (Base + Arbitrum, `sponsorEvmTransaction`) → create a `feeSponsorship` (`pay_for_user`, linked to policy) → put the 3 IDs in `.env`. Optional: 1 real gasless tx smoke. | Before demo if Openfort bounty is wanted live |

**The demo works without any of these gates** (demo mode). The gates make it real. Gate 3 is documented step-by-step in the plan so any agent or human can execute it.

---

## 6. Verification gate (end of phase)

```bash
pnpm typecheck   # all packages
pnpm lint        # all packages
pnpm test        # existing + new AgentWallet tests, all green
pnpm build       # all packages
pnpm dev:api     # boots (demo + configured)
pnpm dev:web     # renders chat in demo mode
```

CI workflow runs the same gates and is green on `main`.

---

## 7. Phase summary table

| Work item | Layer | Bounty | Risk |
|-----------|-------|--------|------|
| `AgentWalletPort` + executor two-step settlement | domain | Openfort narrative | Low (additive, optional) |
| `OpenfortAgentWallet` + `NoopAgentWallet` + factory | infra-web3 | Openfort $100 | Medium (new SDK, deferred ESM) |
| Config fail-fast (prod) | shared | — | Low |
| Runtime wiring | api | — | Low |
| CI lint workflow | ci.yml | — | Low |
| Error/empty/mobile states | web | UX 40% | Low |
| README + SUBMISSION + bounty mapping | docs | all | Low |

**Sources for the pricing/architecture research (2026-07-14):**
- ZeroDev pricing: https://docs.zerodev.app/blog/pricing-update, https://zerodev.app/faqs
- Openfort pricing: https://www.openfort.io/pricing
- Openfort agent wallet guide: https://www.openfort.io/blog/how-to-build-an-agent-wallet
- Arbitrum + Openfort sponsored tx: https://docs.arbitrum.io/for-devs/third-party-docs/Openfort
- Openfort SDK 0.10.8 API: `@openfort/openfort-node@0.10.8` tarball (types + examples), https://github.com/openfort-xyz/openfort-node
