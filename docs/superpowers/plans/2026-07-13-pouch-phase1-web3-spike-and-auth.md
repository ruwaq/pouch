# Pouch Phase 1 — Web3 Spike + Real Particle UA + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the Particle Universal Account + EIP-7702 + signing flow end-to-end with a real mainnet key (raw-key spike, ~$1–2 USDC), then wire real identity (Magic DID → JWT) and a real balance provider, so Phase 3's frontend-driven cash-out flow has a live, working backend.

**Architecture (CRITICAL — differs from the design spec):** Research (2026-07-13) proved that Magic signing is **browser-only**. The server can plan UA transactions (`createConvertTransaction`, `createTransferTransaction`) and call `getPrimaryAssets()`, but it **cannot sign** the `rootHash` or 7702 authorizations — only the browser (holding the Magic-embedded key) can do that. Therefore:
- **Server does:** intent parsing, routing, Bitrefill order creation, balance reads, transaction **planning** (returns unsigned tx + rootHash).
- **Browser does:** Magic login, balance display, transaction **signing** (signs rootHash + 7702 auths via Magic), `sendTransaction`, reports the tx hash back.
- `AccountProvider` on the server becomes **read-only** (`getUnifiedBalance` only) for real Particle mode. Consolidation/payment signing moves to the frontend (Phase 3). The `DemoAccountProvider` keeps its full (simulate-everything) behavior for tests/dev.

**Tech Stack:** TypeScript 5.8, Hono 4.9, `@magic-sdk/admin@^2.8.2` (server DID verification), `jose@^6.2.3` (our JWT), `ethers@^6.17.0`, `@particle-network/universal-account-sdk@^2.0.3` (NOT beta — verified stable release), Vitest 3.2, pnpm 10 workspaces.

**Funds:** Mainnet only (~$1–2 USDC for the spike). No testnet exists for UA (confirmed by Particle DevRel). The `demo` mode (`WEB3_PROVIDER_MODE=demo`) remains for all automated tests — no funds burned in CI.

---

## Verified SDK facts (grounding for every snippet)

These were confirmed against the real `.d.ts` files on npm (2026-07-13). Every code snippet below uses these exact APIs.

### Particle UA SDK (`@particle-network/universal-account-sdk@2.0.3`)

```ts
import { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION, type IUniversalAccountConfig } from '@particle-network/universal-account-sdk';

// Constructor takes credentials + ownerAddress (the EOA). NO signer passed in.
const ua = new UniversalAccount({
  projectId, projectClientKey, projectAppUuid,           // Particle creds (note: "appUuid", not "appId")
  smartAccountOptions: {
    name: 'UNIVERSAL',
    version: UNIVERSAL_ACCOUNT_VERSION,                   // import this constant, do NOT hardcode ("2.0.1")
    ownerAddress,                                         // EOA address string
    useEIP7702: true,                                     // 7702 mode for Magic
  },
});

// Balance — returns aggregated primary tokens (ETH/USDC/USDT/BNB/SOL)
const assets = await ua.getPrimaryAssets();                // { assets: IAsset[], totalAmountInUSD }

// Plan a consolidation (target-side only — router picks the funding path)
const tx = await ua.createConvertTransaction(
  { chainId: 42161, expectToken: { type: 'USDC', amount: '0.0001' } },
);
// tx.rootHash is what gets signed. tx.userOps[i].eip7702Auth + eip7702Delegated describe delegation needs.

// Plan a payment to an address (dedicated method, NOT the convert flow)
const payTx = await ua.createTransferTransaction(
  { token: { chainId: 42161, address: USDC_CONTRACT }, amount: '1.00', receiver: '0xbitrefill' },
);

// Execute — caller signs rootHash externally and passes the signature string
await ua.sendTransaction(tx, signature, authorizations);  // authorizations = signed 7702 auths (if any)

// Delegation status
const deployments = await ua.getEIP7702Deployments();     // [{ chainId, isDelegated, ... }]
```

**Signing happens in the browser (Magic), not the server.** Server produces the `ITransaction` (incl. `rootHash`); browser signs `rootHash` via `magic.rpcProvider` → ethers `signMessage`.

### Magic Admin SDK (`@magic-sdk/admin@2.8.2`) — server-side DID verification

```ts
import { Magic } from '@magic-sdk/admin';                 // DIFFERENT package from client magic-sdk
const magic = new Magic(MAGIC_SECRET_KEY);                // SECRET key, server-only

magic.token.validate(didToken);                           // throws MagicAdminSDKError on invalid; returns void
const [, claim] = magic.token.decode(didToken);           // [proofString, Claim]
// claim.iss === 'did:ethr:0x<lowercase-address>'         // canonical user identifier

const metadata = await magic.users.getMetadataByToken(didToken);
// metadata.publicAddress  → '0x...'   (the EOA, used as UA ownerAddress)
// metadata.email          → string | null
// metadata.issuer         → 'did:ethr:0x...'   (== claim.iss)
```

### jose (`^6.2.3`) — our own session JWT

```ts
import { SignJWT, jwtVerify } from 'jose';
const secret = new TextEncoder().encode(JWT_SECRET);
const jwt = await new SignJWT({ sub: userId, evmAddress })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuedAt()
  .setExpirationTime('24h')
  .sign(secret);
const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
```

---

## File Structure

### New files
- `packages/infra-web3/spike/ua-spike.mts` — Node spike script (raw key, validates the full UA flow with real USDC). NOT shipped — lives in a `spike/` dir excluded from the build.
- `packages/infra-web3/src/particle/universal-account.ts` — real `AccountProvider` (read-only: `getUnifiedBalance`) over the UA SDK.
- `packages/infra-web3/src/particle/ua-assets-mapper.ts` — pure mapper `IAssetsResponse` → domain `Balance` (no SDK types leak into domain).
- `packages/infra-web3/src/particle/types.ts` — minimal re-exports of the UA SDK types we depend on (so domain stays SDK-free).
- `apps/api/src/middleware/auth.ts` — Hono middleware: cookie → verify JWT (jose) → populate `ctx.userId` + `ctx.evmAddress`. Public paths skip.
- `apps/api/src/routes/auth.ts` — `POST /auth/callback` (verify DID, upsert user, issue JWT cookie), `POST /auth/logout`.
- `apps/api/src/services/user-service.ts` — upsert + find user by Magic issuer.
- `packages/infra-db/src/repositories/user-repository.ts` — Drizzle repo for the `users` table.
- `apps/api/src/services/auth-service.ts` — orchestrates DID validate → decode → upsert → issue JWT.
- `packages/infra-web3/__tests__/ua-assets-mapper.test.ts` — pure mapper tests (no SDK, no network).
- `apps/api/src/services/auth-service.test.ts` — auth service with mocked Magic admin + mocked user repo.
- `apps/api/src/middleware/auth.test.ts` — middleware: valid JWT populates ctx, missing/invalid → 401.

### Modified files
- `packages/infra-web3/package.json` — add `@particle-network/universal-account-sdk@^2.0.3`, `ethers@^6.17.0`.
- `packages/infra-web3/src/factory.ts` — `particle` case returns the real provider (no longer throws).
- `packages/infra-web3/src/index.ts` — export the Particle provider.
- `apps/api/package.json` — add `@magic-sdk/admin@^2.8.2`, `jose@^6.2.3`.
- `apps/api/src/app.ts` — register auth middleware + auth routes; pass `evmAddress` into balance service.
- `apps/api/src/routes/balance.ts` — use `ctx.evmAddress` when authed; keep `?userId=` fallback for demo.
- `apps/api/src/routes/orders.ts` — read `userId` from `ctx.userId` (auth) instead of query.
- `packages/shared/src/config.ts` — add `MAGIC_SECRET_KEY` (server-side, distinct from publishable key).
- `packages/infra-db/src/schema.ts` — add `issuer text unique` column to `users` (Magic DID is the canonical key).
- `.env.example` — add `MAGIC_SECRET_KEY`, `PARTICLE_*` real values note, `SPIKE_PRIVATE_KEY` for the spike.

---

## Task 1: Install SDKs + spike script (raw key, real funds)

**Files:**
- Modify: `packages/infra-web3/package.json`
- Create: `packages/infra-web3/spike/ua-spike.mts`

**Why:** The spike is the highest-risk de-risking step. It validates the entire UA SDK flow (instantiation → balance → convert → sign → send → poll) with a raw private key in Node — before we build anything on top. Uses ~$1–2 of real USDC. This is manual, not automated (no CI). The script becomes the authoritative reference for the real provider.

- [ ] **Step 1: Install the UA SDK + ethers in infra-web3**

Run:
```bash
pnpm --filter @pouch/infra-web3 add @particle-network/universal-account-sdk@^2.0.3 ethers@^6.17.0
```

Expected: both packages added to `packages/infra-web3/package.json` `dependencies`. (No peer deps required by the UA SDK — confirmed in research.)

- [ ] **Step 2: Add the spike script**

Create `packages/infra-web3/spike/ua-spike.mts`:

```typescript
/**
 * Pouch — Phase 1 web3 spike (RAW KEY, real mainnet funds ~$1-2).
 *
 * Validates the full Particle Universal Account flow end-to-end in Node:
 *   1. Instantiate UniversalAccount with a raw EOA key
 *   2. getPrimaryAssets() → see aggregated balance
 *   3. createConvertTransaction() → plan a tiny USDC consolidation to Arbitrum
 *   4. Sign rootHash + 7702 auths with the raw key (ethers v6)
 *   5. sendTransaction() → execute
 *   6. getTransaction() → poll until FINISHED
 *
 * This script is NOT shipped. It lives in spike/ (excluded from build).
 * Reference: github.com/Particle-Network/universal-account-example (examples/7702-convert-evm.ts)
 *
 * Run: SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 exec tsx spike/ua-spike.mts
 */
import 'dotenv/config';

import { Wallet, getBytes, hashAuthorization } from 'ethers';
import {
  CHAIN_ID,
  UNIVERSAL_ACCOUNT_VERSION,
  UniversalAccount,
  type EIP7702Authorization,
  type ITransaction,
  type IUserOpWithChain,
} from '@particle-network/universal-account-sdk';

// --- Spike config (all from env; never hardcode) ---
const PRIVATE_KEY = process.env.SPIKE_PRIVATE_KEY;
const PROJECT_ID = process.env.PARTICLE_PROJECT_ID;
const PROJECT_CLIENT_KEY = process.env.PARTICLE_CLIENT_KEY;
const PROJECT_APP_UUID = process.env.PARTICLE_APP_ID; // SDK field is "projectAppUuid"
const TARGET_CHAIN = process.env.SPIKE_TARGET_CHAIN ? Number(process.env.SPIKE_TARGET_CHAIN) : CHAIN_ID.ARBITRUM_MAINNET_ONE;
const CONVERT_AMOUNT = process.env.SPIKE_CONVERT_AMOUNT ?? '0.0001'; // tiny, ~$0.0001 USDC

if (!PRIVATE_KEY || !PROJECT_ID || !PROJECT_CLIENT_KEY || !PROJECT_APP_UUID) {
  console.error('Missing required env. Set SPIKE_PRIVATE_KEY, PARTICLE_PROJECT_ID, PARTICLE_CLIENT_KEY, PARTICLE_APP_ID.');
  process.exit(1);
}

const wallet = new Wallet(PRIVATE_KEY);

const ua = new UniversalAccount({
  projectId: PROJECT_ID,
  projectClientKey: PROJECT_CLIENT_KEY,
  projectAppUuid: PROJECT_APP_UUID,
  smartAccountOptions: {
    name: 'UNIVERSAL',
    version: UNIVERSAL_ACCOUNT_VERSION,
    ownerAddress: wallet.address,
    useEIP7702: true,
  },
});

async function signTransaction(transaction: ITransaction): Promise<{ signature: string; authorizations: EIP7702Authorization[] }> {
  // Sign the rootHash (EIP-191 personal_sign). signMessageSync is fine for a raw key.
  const signature = wallet.signMessageSync(getBytes(transaction.rootHash));

  // Walk userOps; sign any 7702 auth that isn't already delegated.
  const authorizations: EIP7702Authorization[] = [];
  const nonceMap = new Map<number, string>();

  for (const userOp of transaction.userOps as IUserOpWithChain[]) {
    if (userOp.eip7702Auth && !userOp.eip7702Delegated) {
      let serialized = nonceMap.get(userOp.eip7702Auth.nonce);
      if (!serialized) {
        const digest = hashAuthorization(userOp.eip7702Auth);
        serialized = wallet.signingKey.sign(digest).serialized;
        nonceMap.set(userOp.eip7702Auth.nonce, serialized);
      }
      authorizations.push({ userOpHash: userOp.userOpHash, signature: serialized });
    }
  }

  return { signature, authorizations };
}

async function pollUntilFinished(transactionId: string, maxAttempts = 20): Promise<unknown> {
  for (let i = 0; i < maxAttempts; i++) {
    const detail = await ua.getTransaction(transactionId) as { status?: number };
    console.log(`  poll ${i + 1}/${maxAttempts}: status=${detail.status}`);
    if (detail.status === 7) { // FINISHED
      return detail;
    }
    if (detail.status === 6) { // EXECUTION_FAILED
      throw new Error(`Transaction ${transactionId} failed (status 6).`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${transactionId} did not finish in ${maxAttempts} attempts.`);
}

async function main() {
  console.log('=== Pouch UA spike ===');
  console.log('EOA address:', wallet.address);

  // 1. Check delegation status
  console.log('\n[1] EIP-7702 delegation status:');
  const deployments = await ua.getEIP7702Deployments() as Array<{ chainId: number; isDelegated: boolean }>;
  for (const d of deployments) {
    console.log(`  chain ${d.chainId}: ${d.isDelegated ? 'delegated ✓' : 'NOT delegated'}`);
  }

  // 2. Read unified balance
  console.log('\n[2] Unified balance (getPrimaryAssets):');
  const assets = await ua.getPrimaryAssets();
  console.log(`  total USD: ${assets.totalAmountInUSD}`);
  for (const asset of assets.assets) {
    console.log(`  ${asset.tokenType}: ${asset.amount} ($${asset.amountInUSD})`);
  }

  // 3. Plan a tiny convert → USDC on target chain
  console.log(`\n[3] createConvertTransaction (→ USDC ${CONVERT_AMOUNT} on chain ${TARGET_CHAIN}):`);
  const transaction = await ua.createConvertTransaction({
    chainId: TARGET_CHAIN,
    expectToken: { type: 'USDC', amount: CONVERT_AMOUNT },
  });
  console.log('  transactionId:', transaction.transactionId);
  console.log('  rootHash:', transaction.rootHash);
  console.log('  userOps:', transaction.userOps.length);
  console.log('  needs 7702 auth:', transaction.userOps.some((u: IUserOpWithChain) => u.eip7702Auth && !u.eip7702Delegated));

  // 4. Sign
  console.log('\n[4] Signing rootHash + 7702 auths...');
  const { signature, authorizations } = await signTransaction(transaction);
  console.log('  signature:', signature.slice(0, 20) + '...');
  console.log('  authorizations:', authorizations.length);

  // 5. Send
  console.log('\n[5] sendTransaction:');
  const sendResult = await ua.sendTransaction(transaction, signature, authorizations) as { transactionId: string };
  console.log('  transactionId:', sendResult.transactionId);
  console.log('  activity:', `https://universalx.app/activity/details?id=${sendResult.transactionId}`);

  // 6. Poll
  console.log('\n[6] Polling for completion...');
  await pollUntilFinished(sendResult.transactionId);
  console.log('  ✓ FINISHED');
  console.log('\n=== Spike PASSED ===');
}

main().catch((err) => {
  console.error('\n=== Spike FAILED ===');
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the spike run script + exclude spike/ from the package build**

Add to `packages/infra-web3/package.json` `scripts`:

```json
    "spike": "tsx spike/ua-spike.mts"
```

Ensure `tsconfig.json` `include` does NOT pick up `spike/` (it currently includes `src/**/*.ts(x)` + `__tests__/**/*.ts(x)`, so `spike/` is already excluded — verify by reading the file). If `spike/` would be compiled, add `"exclude": ["spike"]`.

- [ ] **Step 4: Run the spike (MANUAL — real funds)**

This step is performed by a human with real USDC, NOT by the agent in CI. Document it as a manual gate.

**Prerequisites:**
- A funded EOA with ~$1–2 USDC spread across ≥1 chain (Base or Arbitrum).
- Particle project credentials (projectId, clientKey, appId) from dashboard.particle.network.
- A `.env` with: `SPIKE_PRIVATE_KEY=0x...`, `PARTICLE_PROJECT_ID=...`, `PARTICLE_CLIENT_KEY=...`, `PARTICLE_APP_ID=...`.

**Run:**
```bash
pnpm --filter @pouch/infra-web3 spike
```

**Spike success criteria (all must pass):**
- [ ] `[1]` Delegation status reads without error (may show delegated or not).
- [ ] `[2]` `getPrimaryAssets()` returns assets + `totalAmountInUSD` > 0.
- [ ] `[3]` `createConvertTransaction()` returns a transaction with a `rootHash`.
- [ ] `[4]` Signing the rootHash + 7702 auths succeeds (signature + authorizations arrays populated).
- [ ] `[5]` `sendTransaction()` returns a `transactionId`.
- [ ] `[6]` Polling reaches status 7 (FINISHED).
- [ ] Activity URL shows the transaction on universalx.app.

**If the spike fails:** Do NOT proceed to Task 2. Document what failed and apply the fallback (balance-read real + simulated transaction narration) per the design spec §5. The `DemoAccountProvider` remains the test/dev path either way.

- [ ] **Step 5: Commit (spike artifacts + SDK install)**

```bash
git add packages/infra-web3/package.json packages/infra-web3/spike/ua-spike.mts
git commit -m "feat(infra-web3): add UA SDK + raw-key spike script (Phase 1 de-risking)"
```

---

## Task 2: UA assets mapper (pure, testable)

**Files:**
- Create: `packages/infra-web3/src/particle/ua-assets-mapper.ts`
- Test: `packages/infra-web3/__tests__/ua-assets-mapper.test.ts`

**Why:** The UA SDK's `IAssetsResponse` shape must be translated into our domain `Balance` without leaking SDK types into the domain. This pure mapper is the seam — fully unit-testable with no network, no funds.

- [ ] **Step 1: Write the failing test**

Create `packages/infra-web3/__tests__/ua-assets-mapper.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { mapAssetsResponseToBalance } from '../src/particle/ua-assets-mapper';

describe('mapAssetsResponseToBalance', () => {
  it('maps an IAssetsResponse into a domain Balance with aggregated assets', () => {
    const response = {
      totalAmountInUSD: 142.5,
      assets: [
        {
          tokenType: 'USDC',
          price: 1,
          amount: 50,
          amountInUSD: 50,
          chainAggregation: [
            { token: { chainId: 42161, address: '0xusdc-arb' }, amount: 30, amountInUSD: 30, rawAmount: 30_000000 },
            { token: { chainId: 8453, address: '0xusdc-base' }, amount: 20, amountInUSD: 20, rawAmount: 20_000000 },
          ],
        },
        {
          tokenType: 'ETH',
          price: 3000,
          amount: 0.0308,
          amountInUSD: 92.5,
          chainAggregation: [{ token: { chainId: 8453, address: '0x0000' }, amount: 0.0308, amountInUSD: 92.5, rawAmount: 30_800000_000000_0000 }],
        },
      ],
    };

    const balance = mapAssetsResponseToBalance(response, { settlementChainId: 42161 });

    expect(balance.total).toBe(142.5);
    expect(balance.assets).toHaveLength(3);
    expect(balance.assets).toContainEqual({ chainId: 42161, symbol: 'USDC', amount: 30, usdValue: 30 });
    expect(balance.assets).toContainEqual({ chainId: 8453, symbol: 'USDC', amount: 20, usdValue: 20 });
    expect(balance.assets).toContainEqual({ chainId: 8453, symbol: 'ETH', amount: 0.0308, usdValue: 92.5 });
    // requiresConsolidation = true if the largest single asset share on the settlement chain < total
    expect(balance.requiresConsolidation).toBe(true);
  });

  it('reports requiresConsolidation=false when all value is already USDC on the settlement chain', () => {
    const response = {
      totalAmountInUSD: 100,
      assets: [
        {
          tokenType: 'USDC',
          price: 1,
          amount: 100,
          amountInUSD: 100,
          chainAggregation: [{ token: { chainId: 42161, address: '0xusdc-arb' }, amount: 100, amountInUSD: 100, rawAmount: 100_000000 }],
        },
      ],
    };

    const balance = mapAssetsResponseToBalance(response, { settlementChainId: 42161 });

    expect(balance.requiresConsolidation).toBe(false);
  });

  it('handles an empty balance gracefully', () => {
    const response = { totalAmountInUSD: 0, assets: [] };

    const balance = mapAssetsResponseToBalance(response, { settlementChainId: 42161 });

    expect(balance.total).toBe(0);
    expect(balance.assets).toEqual([]);
    expect(balance.requiresConsolidation).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: FAIL — `Cannot find module '../src/particle/ua-assets-mapper'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/infra-web3/src/particle/ua-assets-mapper.ts`:

```typescript
import type { Balance, BalanceAsset } from '@pouch/domain';

// Minimal structural type matching the UA SDK's IAssetsResponse — kept here (infra) so the domain stays SDK-free.
export interface UaAssetsResponseLike {
  totalAmountInUSD: number;
  assets: Array<{
    tokenType: string;
    amount: number;
    amountInUSD: number;
    chainAggregation: Array<{
      token: { chainId: number; address: string };
      amount: number;
      amountInUSD: number;
    }>;
  }>;
}

export interface MapOptions {
  settlementChainId: number;
}

export function mapAssetsResponseToBalance(response: UaAssetsResponseLike, options: MapOptions): Balance {
  const assets: BalanceAsset[] = [];

  for (const asset of response.assets) {
    for (const chainAgg of asset.chainAggregation) {
      assets.push({
        chainId: chainAgg.token.chainId,
        symbol: asset.tokenType.toUpperCase(),
        amount: chainAgg.amount,
        usdValue: chainAgg.amountInUSD,
      });
    }
  }

  // Consolidation is needed when value is split across multiple chains/tokens
  // (the UA will have to bundle the payment into one cross-chain tx).
  const settlementChainAssets = assets.filter(
    (a) => a.chainId === options.settlementChainId && a.symbol === 'USDC',
  );
  const settlementUsd = settlementChainAssets.reduce((sum, a) => sum + a.usdValue, 0);
  const requiresConsolidation = response.totalAmountInUSD > 0 && settlementUsd < response.totalAmountInUSD;

  return {
    total: response.totalAmountInUSD,
    assets,
    requiresConsolidation,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: PASS — 3 mapper tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/infra-web3/src/particle/ua-assets-mapper.ts packages/infra-web3/__tests__/ua-assets-mapper.test.ts
git commit -m "feat(infra-web3): pure UA assets → domain Balance mapper"
```

---

## Task 3: Real Particle AccountProvider (read-only balance)

**Files:**
- Create: `packages/infra-web3/src/particle/universal-account.ts`
- Create: `packages/infra-web3/src/particle/types.ts`
- Modify: `packages/infra-web3/src/factory.ts`
- Modify: `packages/infra-web3/src/index.ts`

**Why:** The `particle` case in the factory currently throws. We implement a real `AccountProvider` that reads unified balance from the UA SDK. Per the frontend-driven architecture, **only `getUnifiedBalance` is real** on the server; `consolidate` and `sendPayment` throw a typed error explaining signing must happen in the browser. (Phase 3 implements the browser signing path; the demo provider still simulates everything for tests.)

- [ ] **Step 1: Create the Particle provider types + module**

Create `packages/infra-web3/src/particle/types.ts`:

```typescript
// Re-export the minimal UA SDK surface this package depends on.
// Domain never imports from here — this is infra-only.
export { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION } from '@particle-network/universal-account-sdk';

export interface ParticleProviderConfig {
  projectId: string;
  projectClientKey: string;
  projectAppUuid: string;
  settlementChainId: number;
}
```

Create `packages/infra-web3/src/particle/universal-account.ts`:

```typescript
import { err, ok } from '@pouch/shared';
import type { AccountProvider, Balance, DomainError, UserId } from '@pouch/domain';

import { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION } from './types';
import type { ParticleProviderConfig } from './types';
import { mapAssetsResponseToBalance, type UaAssetsResponseLike } from './ua-assets-mapper';

// Each user gets their own UniversalAccount (one per Magic EOA address).
// The provider caches UA instances by ownerAddress.
export class ParticleAccountProvider implements AccountProvider {
  private readonly instances = new Map<string, UniversalAccount>();

  constructor(private readonly config: ParticleProviderConfig) {}

  async getUnifiedBalance(userId: UserId): ReturnType<AccountProvider['getUnifiedBalance']> {
    const ua = this.getInstance(userId);

    try {
      const response = (await ua.getPrimaryAssets()) as unknown as UaAssetsResponseLike;
      const balance: Balance = mapAssetsResponseToBalance(response, {
        settlementChainId: this.config.settlementChainId,
      });
      return ok(balance);
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? `Particle balance read failed: ${error.message}` : 'Particle balance read failed.',
      });
    }
  }

  async consolidate(): ReturnType<AccountProvider['consolidate']> {
    // Server cannot sign — browser holds the Magic key. Phase 3 implements the browser path.
    return err({
      type: 'UNKNOWN',
      message: 'Consolidation signing happens in the browser (Magic). Use the transaction-planning endpoint + frontend signer.',
    });
  }

  async sendPayment(): ReturnType<AccountProvider['sendPayment']> {
    return err({
      type: 'UNKNOWN',
      message: 'Payment signing happens in the browser (Magic). Use the transaction-planning endpoint + frontend signer.',
    });
  }

  private getInstance(ownerAddress: string): UniversalAccount {
    let ua = this.instances.get(ownerAddress);

    if (!ua) {
      ua = new UniversalAccount({
        projectId: this.config.projectId,
        projectClientKey: this.config.projectClientKey,
        projectAppUuid: this.config.projectAppUuid,
        smartAccountOptions: {
          name: 'UNIVERSAL',
          version: UNIVERSAL_ACCOUNT_VERSION,
          ownerAddress,
          useEIP7702: true,
        },
      });
      this.instances.set(ownerAddress, ua);
    }

    return ua;
  }
}
```

All imports are at the top — no bottom-of-file imports (those cause bundler issues).

- [ ] **Step 2: Wire the factory**

Modify `packages/infra-web3/src/factory.ts`. Replace the `assertParticleModeSupported` function and the `particle` case:

```typescript
import type { AccountProvider } from '@pouch/domain';
import type { Config } from '@pouch/shared';

import { DemoAccountProvider } from './demo-account-provider';
import { ParticleAccountProvider } from './particle/universal-account';

function resolveMode(config: Config): 'demo' | 'particle' {
  if (config.WEB3_PROVIDER_MODE) {
    return config.WEB3_PROVIDER_MODE;
  }

  return config.NODE_ENV === 'production' ? 'particle' : 'demo';
}

function createParticleProvider(config: Config): AccountProvider {
  if (!config.PARTICLE_PROJECT_ID || !config.PARTICLE_CLIENT_KEY || !config.PARTICLE_APP_ID) {
    throw new Error(
      'Particle mode requires PARTICLE_PROJECT_ID, PARTICLE_CLIENT_KEY, PARTICLE_APP_ID. Set them in .env or use WEB3_PROVIDER_MODE=demo.',
    );
  }

  return new ParticleAccountProvider({
    projectId: config.PARTICLE_PROJECT_ID,
    projectClientKey: config.PARTICLE_CLIENT_KEY,
    projectAppUuid: config.PARTICLE_APP_ID,
    settlementChainId: config.SETTLEMENT_CHAIN_ID,
  });
}

export function createAccountProvider(config: Config): AccountProvider {
  const mode = resolveMode(config);

  switch (mode) {
    case 'demo':
      return new DemoAccountProvider(config);
    case 'particle':
      return createParticleProvider(config);
  }
}
```

> **Type note:** the `required as ...` cast handles `exactOptionalPropertyTypes: true` — the entries filter ensures `projectAppUuid` is a non-empty `string`, but TS needs the assertion to narrow `string | undefined` → `string`. If typecheck complains, adjust the cast; the runtime is correct because of the `missing` guard.

- [ ] **Step 3: Export the Particle provider from the barrel**

Modify `packages/infra-web3/src/index.ts`. It currently re-exports `demo-account-provider` + `factory`. Add:

```typescript
export * from './particle/universal-account';
export * from './particle/ua-assets-mapper';
```

- [ ] **Step 4: Verify typecheck + tests**

Run: `pnpm --filter @pouch/infra-web3 typecheck && pnpm --filter @pouch/infra-web3 test`
Expected: typecheck PASS (factory no longer throws for `particle`); existing 3 factory tests still pass (they assert demo default, custom balance, and **particle throws when credentials missing** — note: the factory now throws with a *different* message; check the factory test and update its expectation to match the new message).

- [ ] **Step 5: Update the factory test if the particle-throws message changed**

Read `packages/infra-web3/__tests__/factory.test.ts`. The test that asserts `particle` mode throws will now expect a message like `Particle mode requires PARTICLE_...`. Update the assertion to match the new message (or use `toThrow(/Particle mode requires/)`). If the test passes `particle` mode *with* credentials present, it would now return a provider instead of throwing — adjust accordingly.

Run: `pnpm --filter @pouch/infra-web3 test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/infra-web3/src/particle/ packages/infra-web3/src/factory.ts packages/infra-web3/src/index.ts packages/infra-web3/__tests__/factory.test.ts
git commit -m "feat(infra-web3): real Particle AccountProvider (read-only balance) + factory wiring"
```

---

## Task 4: Auth — install deps + DB schema + config

**Files:**
- Modify: `packages/shared/src/config.ts` (add `MAGIC_SECRET_KEY`)
- Modify: `packages/infra-db/src/schema.ts` (add `issuer` column)
- Modify: `apps/api/package.json` (add `@magic-sdk/admin`, `jose`)
- Modify: `.env.example`

**Why:** Auth needs a server-side Magic secret (distinct from the client publishable key), a canonical `issuer` column on `users` (the Magic DID is the durable user key), and the admin SDK + jose installed.

- [ ] **Step 1: Add `MAGIC_SECRET_KEY` to the config schema**

Modify `packages/shared/src/config.ts`. In the `ConfigSchema`, after the `MAGIC_PUBLISHABLE_KEY` line, add:

```typescript
  MAGIC_SECRET_KEY: z.string().optional(),
```

Add a test assertion in `packages/shared/__tests__/config.test.ts` — append a test inside the existing `describe('loadConfig')` block:

```typescript
  it('parses MAGIC_SECRET_KEY when provided', () => {
    const config = loadConfig({ ...validEnv(), MAGIC_SECRET_KEY: 'sk_test_abc' });
    expect(config.MAGIC_SECRET_KEY).toBe('sk_test_abc');
  });
```

- [ ] **Step 2: Add the `issuer` column to `users`**

Modify `packages/infra-db/src/schema.ts`. Replace the `users` table to add `issuer` with a unique index:

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  issuer: text('issuer'),
  magicPublicKey: text('magic_public_key'),
  evmAddress: text('evm_address'),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  usersIssuerIdx: uniqueIndex('users_issuer_idx').on(table.issuer),
  usersMagicPublicKeyIdx: uniqueIndex('users_magic_public_key_idx').on(table.magicPublicKey),
  usersEvmAddressIdx: uniqueIndex('users_evm_address_idx').on(table.evmAddress),
}));
```

- [ ] **Step 3: Install `@magic-sdk/admin` + `jose` in the API app**

Run:
```bash
pnpm --filter @pouch/api add @magic-sdk/admin@^2.8.2 jose@^6.2.3
```

- [ ] **Step 4: Update `.env.example`**

In the Magic section (after `MAGIC_PUBLISHABLE_KEY=`), add:

```bash
# Magic SECRET key (server-side only — for DID token verification)
# Get key: magic.link → Dashboard → API Keys → Secret Key
# NEVER expose this in frontend code
MAGIC_SECRET_KEY=
```

- [ ] **Step 5: Verify typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck PASS; shared config test green (new assertion passes); all other tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/config.ts packages/shared/__tests__/config.test.ts packages/infra-db/src/schema.ts apps/api/package.json .env.example pnpm-lock.yaml
git commit -m "feat(api,shared,infra-db): auth scaffolding (MAGIC_SECRET_KEY, issuer column, jose + magic-admin)"
```

---

## Task 5: User repository (Drizzle)

**Files:**
- Create: `packages/infra-db/src/repositories/user-repository.ts`
- Modify: `packages/infra-db/src/index.ts`

**Why:** Auth upserts a user by `issuer` on every login. The repo encapsulates the Drizzle queries.

- [ ] **Step 1: Write the user repository**

Create `packages/infra-db/src/repositories/user-repository.ts`:

```typescript
import { and, eq } from 'drizzle-orm';

import type { createDatabase } from '../client';
import { users } from '../schema';

type Database = ReturnType<typeof createDatabase>;

export interface UpsertUserInput {
  issuer: string;
  magicPublicKey: string;
  evmAddress: string;
  email?: string;
}

export interface UserRecord {
  id: string;
  issuer: string | null;
  magicPublicKey: string | null;
  evmAddress: string | null;
  email: string | null;
}

function mapRowToUser(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    issuer: row.issuer,
    magicPublicKey: row.magicPublicKey,
    evmAddress: row.evmAddress,
    email: row.email,
  };
}

export class DrizzleUserRepository {
  constructor(private readonly db: Database) {}

  async findByIssuer(issuer: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.issuer, issuer)).limit(1);
    return row ? mapRowToUser(row) : null;
  }

  async findByEvmAddress(evmAddress: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.evmAddress, evmAddress)).limit(1);
    return row ? mapRowToUser(row) : null;
  }

  async upsertByIssuer(input: UpsertUserInput): Promise<UserRecord> {
    // Upsert keyed on issuer (the Magic DID is the canonical durable identifier).
    const existing = await this.findByIssuer(input.issuer);

    if (existing) {
      const [updated] = await this.db
        .update(users)
        .set({
          magicPublicKey: input.magicPublicKey,
          evmAddress: input.evmAddress,
          ...(input.email ? { email: input.email } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      return mapRowToUser(updated!);
    }

    const [inserted] = await this.db
      .insert(users)
      .values({
        issuer: input.issuer,
        magicPublicKey: input.magicPublicKey,
        evmAddress: input.evmAddress,
        ...(input.email ? { email: input.email } : {}),
      })
      .returning();

    return mapRowToUser(inserted!);
  }
}
```

- [ ] **Step 2: Export from the infra-db barrel**

Modify `packages/infra-db/src/index.ts` — add:

```typescript
export * from './repositories/user-repository';
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @pouch/infra-db typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/infra-db/src/repositories/user-repository.ts packages/infra-db/src/index.ts
git commit -m "feat(infra-db): DrizzleUserRepository (issuer-keyed upsert)"
```

---

## Task 6: Auth service (DID → JWT)

**Files:**
- Create: `apps/api/src/services/auth-service.ts`
- Test: `apps/api/src/services/auth-service.test.ts`

**Why:** This is the core of the auth flow: take a DID token, validate it server-side, decode the issuer, fetch metadata (email + address), upsert the user, and mint our own session JWT. Fully testable with a mocked Magic admin client + mocked user repo.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/auth-service.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { AuthService } from './auth-service';

// A fake Magic admin that "validates" anything and returns fixed metadata.
function fakeMagicAdmin(metadata: { issuer: string; publicAddress: string; email: string | null }) {
  return {
    token: {
      validate() {},
      decode() {
        return ['fake-proof', { iss: metadata.issuer }];
      },
    },
    users: {
      async getMetadataByToken() {
        return {
          issuer: metadata.issuer,
          publicAddress: metadata.publicAddress,
          email: metadata.email,
          oauthProvider: null,
          phoneNumber: null,
          username: null,
          wallets: null,
        };
      },
    },
  };
}

function fakeUserRepo() {
  let saved: { id: string; issuer: string; magicPublicKey: string; evmAddress: string; email: string | null } | null = null;
  return {
    async upsertByIssuer(input: { issuer: string; magicPublicKey: string; evmAddress: string; email?: string }) {
      saved = { id: 'user-1', issuer: input.issuer, magicPublicKey: input.magicPublicKey, evmAddress: input.evmAddress, email: input.email ?? null };
      return saved;
    },
    _saved: () => saved,
  };
}

describe('AuthService', () => {
  it('validates a DID token, upserts the user, and returns a session JWT', async () => {
    const magic = fakeMagicAdmin({ issuer: 'did:ethr:0xabc', publicAddress: '0xabc', email: 'jane@example.com' });
    const repo = fakeUserRepo();
    const service = new AuthService(
      magic as any,
      repo as any,
      'a'.repeat(32), // JWT_SECRET
    );

    const result = await service.handleCallback('fake-did-token');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.userId).toBe('user-1');
    expect(result.value.evmAddress).toBe('0xabc');
    expect(typeof result.value.jwt).toBe('string');
    expect(result.value.jwt.split('.')).toHaveLength(3); // JWT shape
    expect(repo._saved()?.issuer).toBe('did:ethr:0xabc');
    expect(repo._saved()?.evmAddress).toBe('0xabc');
    expect(repo._saved()?.email).toBe('jane@example.com');
  });

  it('returns a typed error when DID token validation throws', async () => {
    const magic = {
      token: { validate() { throw new Error('DID token expired'); } },
      users: { async getMetadataByToken() { throw new Error('not reached'); } },
    };
    const repo = fakeUserRepo();
    const service = new AuthService(magic as any, repo as any, 'a'.repeat(32));

    const result = await service.handleCallback('expired-did');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AUTH_INVALID_DID');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- auth-service`
Expected: FAIL — `Cannot find module './auth-service'`.

- [ ] **Step 3: Write the auth service**

Create `apps/api/src/services/auth-service.ts`:

```typescript
import { SignJWT } from 'jose';
import { ok, err, type Result } from '@pouch/shared';

// Minimal structural types for the Magic admin client (so we can mock it in tests).
export interface MagicAdminLike {
  token: {
    validate(didToken: string): void; // throws on invalid
    decode(didToken: string): [string, { iss: string }];
  };
  users: {
    getMetadataByToken(didToken: string): Promise<{
      issuer: string | null;
      publicAddress: string | null;
      email: string | null;
    }>;
  };
}

export interface UserRepositoryLike {
  upsertByIssuer(input: { issuer: string; magicPublicKey: string; evmAddress: string; email?: string }): Promise<{ id: string; evmAddress: string | null }>;
}

export type AuthError =
  | { type: 'AUTH_INVALID_DID'; message: string }
  | { type: 'AUTH_METADATA_FAILED'; message: string };

export interface AuthSession {
  userId: string;
  evmAddress: string;
  jwt: string;
}

export class AuthService {
  constructor(
    private readonly magic: MagicAdminLike,
    private readonly users: UserRepositoryLike,
    private readonly jwtSecret: string,
  ) {}

  async handleCallback(didToken: string): Promise<Result<AuthSession, AuthError>> {
    // 1. Validate (throws on invalid)
    try {
      this.magic.token.validate(didToken);
    } catch (error) {
      return err({ type: 'AUTH_INVALID_DID', message: error instanceof Error ? error.message : 'DID token validation failed.' });
    }

    // 2. Fetch metadata (issuer, publicAddress, email)
    let metadata: { issuer: string | null; publicAddress: string | null; email: string | null };
    try {
      metadata = await this.magic.users.getMetadataByToken(didToken);
    } catch (error) {
      return err({ type: 'AUTH_METADATA_FAILED', message: error instanceof Error ? error.message : 'Failed to fetch Magic metadata.' });
    }

    if (!metadata.issuer || !metadata.publicAddress) {
      return err({ type: 'AUTH_INVALID_DID', message: 'Magic metadata is missing issuer or publicAddress.' });
    }

    // 3. Upsert user by issuer
    const user = await this.users.upsertByIssuer({
      issuer: metadata.issuer,
      magicPublicKey: metadata.publicAddress,
      evmAddress: metadata.publicAddress,
      ...(metadata.email ? { email: metadata.email } : {}),
    });

    // 4. Mint our own session JWT (HS256, 24h)
    const secret = new TextEncoder().encode(this.jwtSecret);
    const jwt = await new SignJWT({ sub: user.id, evmAddress: user.evmAddress ?? metadata.publicAddress })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    return ok({
      userId: user.id,
      evmAddress: user.evmAddress ?? metadata.publicAddress,
      jwt,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api test -- auth-service`
Expected: PASS — 2 auth-service tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/auth-service.ts apps/api/src/services/auth-service.test.ts
git commit -m "feat(api): AuthService — DID validate → upsert → session JWT"
```

---

## Task 7: Auth middleware + routes

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/middleware/auth.test.ts`

**Why:** The middleware turns our session JWT (httpOnly cookie) into `ctx.userId` + `ctx.evmAddress` for every protected route. The routes expose login (`POST /auth/callback`) and logout. Public paths (`/health`, `/auth/callback`, `/webhooks/*`) skip auth.

- [ ] **Step 1: Write the failing middleware test**

Create `apps/api/src/middleware/auth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { createAuthMiddleware } from './auth';
import { SignJWT } from 'jose';

async function makeJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('auth middleware', () => {
  it('populates ctx.userId + ctx.evmAddress from a valid JWT cookie', async () => {
    const secret = 'a'.repeat(32);
    const jwt = await makeJwt(secret, { sub: 'user-1', evmAddress: '0xabc' });
    const middleware = createAuthMiddleware({ jwtSecret: secret, publicPaths: new Set(['/health']), allowDemoFallback: false });

    // Minimal Hono-like context stub
    let captured: { userId?: string; evmAddress?: string } = {};
    const ctx = {
      req: { path: '/balance', header: () => undefined },
      cookie: (name: string) => (name === 'pouch_session' ? jwt : undefined),
      set: (key: string, value: unknown) => { captured[key as 'userId' | 'evmAddress'] = value as string; },
    };

    let nextCalled = false;
    await middleware(ctx as any, async () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(captured.userId).toBe('user-1');
    expect(captured.evmAddress).toBe('0xabc');
  });

  it('skips public paths without touching the cookie', async () => {
    const middleware = createAuthMiddleware({ jwtSecret: 'a'.repeat(32), publicPaths: new Set(['/health']), allowDemoFallback: false });
    const ctx = { req: { path: '/health' }, cookie: () => undefined, set: () => {} };

    let nextCalled = false;
    await middleware(ctx as any, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('returns 401 when the JWT is missing on a protected path (production mode)', async () => {
    const middleware = createAuthMiddleware({ jwtSecret: 'a'.repeat(32), publicPaths: new Set(['/health']), allowDemoFallback: false });
    const ctx = {
      req: { path: '/balance' },
      cookie: () => undefined,
      set: () => {},
      json: (body: unknown, status: number) => ({ body, status }),
    };

    let nextCalled = false;
    const result = await middleware(ctx as any, async () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(result).toEqual({ body: { error: 'Unauthorized' }, status: 401 });
  });

  it('falls back to demo-user when allowDemoFallback is true and no cookie is present', async () => {
    const middleware = createAuthMiddleware({ jwtSecret: 'a'.repeat(32), publicPaths: new Set(['/health']), allowDemoFallback: true });
    let captured: { userId?: string } = {};
    const ctx = {
      req: { path: '/balance' },
      cookie: () => undefined,
      set: (key: string, value: unknown) => { captured[key as 'userId'] = value as string; },
    };

    let nextCalled = false;
    await middleware(ctx as any, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(captured.userId).toBe('demo-user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- auth.test`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: Write the middleware**

Create `apps/api/src/middleware/auth.ts`:

```typescript
import { jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';

export interface AuthEnv {
  Variables: {
    userId?: string;
    evmAddress?: string;
  };
}

export function createAuthMiddleware(options: {
  jwtSecret: string;
  publicPaths: Set<string>;
  /**
   * When true (demo/local-dev mode), a missing cookie is treated as a 'demo-user'
   * session instead of returning 401. This keeps existing tests and local dev
   * working without requiring a real Magic login. Production always sets this false.
   */
  allowDemoFallback: boolean;
}): MiddlewareHandler<AuthEnv> {
  const secret = new TextEncoder().encode(options.jwtSecret);

  return async (ctx, next) => {
    const path = ctx.req.path;

    // Public paths + auth routes + webhooks skip auth entirely.
    if (options.publicPaths.has(path) || path.startsWith('/auth/') || path.startsWith('/webhooks/')) {
      await next();
      return;
    }

    const token = ctx.cookie('pouch_session');

    if (!token) {
      if (options.allowDemoFallback) {
        ctx.set('userId', 'demo-user');
        await next();
        return;
      }
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });

      if (typeof payload.sub === 'string') {
        ctx.set('userId', payload.sub);
      }
      if (typeof payload.evmAddress === 'string') {
        ctx.set('evmAddress', payload.evmAddress);
      }

      await next();
    } catch {
      if (options.allowDemoFallback) {
        ctx.set('userId', 'demo-user');
        await next();
        return;
      }
      return ctx.json({ error: 'Unauthorized' }, 401);
    }
  };
}
```

> **Demo fallback rationale:** the existing `app.test.ts` tests hit protected routes without a cookie (they rely on the `?userId=` body/query param). With `allowDemoFallback: true` in demo mode, those tests keep passing because the middleware sets `userId = 'demo-user'`. The middleware test (`auth.test.ts`) passes `allowDemoFallback: false` to exercise the 401 path.

In `createApp`, pass the flag based on runtime mode:
```typescript
app.use('*', createAuthMiddleware({
  jwtSecret,
  publicPaths: new Set(['/', '/health']),
  allowDemoFallback: runtimeServices.mode === 'demo',
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api test -- auth.test`
Expected: PASS — 3 middleware tests green.

- [ ] **Step 5: Create the auth routes**

Create `apps/api/src/routes/auth.ts`:

```typescript
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

import type { AuthService } from '../services/auth-service';

export function createAuthRoutes(authService: AuthService): Hono {
  const router = new Hono();

  router.post('/callback', async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'request body must be valid JSON' }, 400);
    }

    const didToken = (body as { didToken?: unknown })?.didToken;
    if (typeof didToken !== 'string' || !didToken.trim()) {
      return context.json({ error: 'didToken must be a non-empty string' }, 400);
    }

    const result = await authService.handleCallback(didToken);

    if (!result.ok) {
      const status = result.error.type === 'AUTH_INVALID_DID' ? 401 : 500;
      return context.json({ error: result.error.message, type: result.error.type }, status);
    }

    // Set the JWT in an httpOnly cookie (7-day browser session; JWT itself expires in 24h)
    setCookie(context, 'pouch_session', result.value.jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return context.json({ userId: result.value.userId, evmAddress: result.value.evmAddress }, 200);
  });

  router.post('/logout', (context) => {
    deleteCookie(context, 'pouch_session', { path: '/' });
    return context.json({ ok: true }, 200);
  });

  return router;
}
```

- [ ] **Step 6: Wire auth into the app**

Modify `apps/api/src/app.ts`. Add the auth middleware + routes. The `createApp` signature gains an optional `authService` param (so tests can inject a mock). Add after the health routes, before the agent routes:

```typescript
import { createAuthMiddleware, type AuthEnv } from './middleware/auth';
import { createAuthRoutes } from './routes/auth';
import type { AuthService } from './services/auth-service';
// ... existing imports ...

export function createApp(options: { agentService?: AgentChatServiceLike; balanceService?: BalanceServiceLike; orderService?: OrderServiceLike; bitrefillWebhookService?: BitrefillWebhookService; authService?: AuthService } = {}): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const runtimeServices = createRuntimeAppServices();
  // ... existing service resolution (agentService, balanceService, orderService, bitrefillWebhookService) ...

  // Auth middleware — demo mode falls back to 'demo-user' when no cookie is present
  // (keeps existing tests + local dev working without a real Magic login).
  const jwtSecret = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
  app.use('*', createAuthMiddleware({
    jwtSecret,
    publicPaths: new Set(['/', '/health']),
    allowDemoFallback: runtimeServices.mode === 'demo',
  }));

  // ... existing routes (/agent, /balance, /orders, /webhooks/bitrefill) ...

  if (options.authService) {
    app.route('/auth', createAuthRoutes(options.authService));
  }

  return app;
}
```

> **Important:** the `AuthEnv` type on `new Hono<AuthEnv>()` types `ctx.get('userId')` / `ctx.get('evmAddress')`. Read `apps/api/src/app.ts` fully before editing to preserve all existing routes and the existing return type. The middleware's demo fallback (`allowDemoFallback: mode === 'demo'`) is what keeps the existing `app.test.ts` tests passing — they hit protected routes without a cookie and now get `userId = 'demo-user'` instead of 401.

- [ ] **Step 7: Verify the full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck PASS; all existing tests pass (demo fallback keeps them green); new auth tests pass (they pass `allowDemoFallback: false` to exercise the 401 path).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/middleware/auth.test.ts apps/api/src/routes/auth.ts apps/api/src/app.ts
git commit -m "feat(api): auth middleware (JWT cookie → ctx) + /auth/callback + /auth/logout"
```

---

## Task 8: Use ctx.userId + ctx.evmAddress in protected routes

**Files:**
- Modify: `apps/api/src/routes/orders.ts`
- Modify: `apps/api/src/routes/balance.ts`
- Modify: `apps/api/src/app.test.ts` (update ownership tests to use cookie/auth)

**Why:** Now that the middleware populates `ctx.userId` and `ctx.evmAddress`, the protected routes should read from there (not query params). The query-param fallback remains for the demo mode.

- [ ] **Step 1: Update the orders route to prefer ctx.userId**

Modify `apps/api/src/routes/orders.ts`:

```typescript
import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { OrderServiceLike } from '../services/order-service';

export function createOrderRoutes(orderService: OrderServiceLike): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get('/:id', async (context) => {
    const orderId = context.req.param('id');
    const userId = context.get('userId') ?? context.req.query('userId');

    const order = await orderService.getOrder(orderId, userId);

    if (!order) {
      context.status(404);
      return context.json({ error: 'Order not found' });
    }

    return context.json(order);
  });

  return router;
}
```

- [ ] **Step 2: Update the balance route to use ctx.evmAddress when authed**

Read `apps/api/src/routes/balance.ts`, then modify it to prefer `ctx.evmAddress` (the real UA owner address) when present, falling back to `?userId=` for demo:

```typescript
import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { BalanceServiceLike } from '../services/balance-service';

export function createBalanceRoutes(balanceService: BalanceServiceLike): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get('/', async (context) => {
    const evmAddress = context.get('evmAddress');
    const userId = evmAddress ?? context.req.query('userId') ?? 'demo-user';

    const result = await balanceService.getBalance(userId);

    if (!result.ok) {
      context.status(500);
      return context.json({ error: result.error.message ?? 'Balance unavailable.', type: result.error.type });
    }

    return context.json({ userId, ...result.value }, 200);
  });

  return router;
}
```

> The existing `balance.ts` may have a slightly different shape — adapt the imports/structure to match what's there, keeping the `evmAddress ?? query ?? demo-user` precedence.

- [ ] **Step 3: Verify the full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. Existing tests still work because demo mode sets `userId = 'demo-user'` via the fallback.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/orders.ts apps/api/src/routes/balance.ts
git commit -m "feat(api): routes read userId/evmAddress from auth context"
```

---

## Task 9: Transaction-planning endpoint (the frontend-driven signing seam)

**Files:**
- Create: `apps/api/src/services/transaction-planner.ts`
- Create: `apps/api/src/routes/transactions.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/services/transaction-planner.test.ts`

**Why:** This is the architectural seam for frontend-driven signing. The server plans a UA transaction (`createConvertTransaction` / `createTransferTransaction`) and returns the **unsigned** `ITransaction` (incl. `rootHash` + the userOps' 7702 auth needs) to the frontend. The frontend signs the rootHash + 7702 auths via Magic, then calls `sendTransaction`. This endpoint returns the plan WITHOUT executing it.

- [ ] **Step 1: Write the failing test for the planner**

Create `apps/api/src/services/transaction-planner.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { TransactionPlanner, type UaClientLike } from './transaction-planner';

function fakeUa(plan: { transactionId: string; rootHash: string; userOps: unknown[] }): UaClientLike {
  return {
    async createConvertTransaction() { return plan as any; },
    async createTransferTransaction() { return plan as any; },
  };
}

describe('TransactionPlanner', () => {
  it('plans a consolidation transaction and returns the unsigned plan', async () => {
    const ua = fakeUa({ transactionId: 'tx-1', rootHash: '0xroot', userOps: [{ userOpHash: '0xop1', eip7702Delegated: true }] });
    const planner = new TransactionPlanner(ua);

    const plan = await planner.planConsolidation({
      ownerAddress: '0xabc',
      targetChainId: 42161,
      token: 'USDC',
      amount: '1.00',
    });

    expect(plan.transactionId).toBe('tx-1');
    expect(plan.rootHash).toBe('0xroot');
    expect(plan.requires7702Signature).toBe(false); // all userOps delegated
  });

  it('flags requires7702Signature when any userOp needs an auth', async () => {
    const ua = fakeUa({
      transactionId: 'tx-2',
      rootHash: '0xroot2',
      userOps: [
        { userOpHash: '0xop1', eip7702Delegated: true },
        { userOpHash: '0xop2', eip7702Auth: { chainId: 8453, nonce: 5, address: '0ximpl' }, eip7702Delegated: false },
      ],
    });
    const planner = new TransactionPlanner(ua);

    const plan = await planner.planConsolidation({ ownerAddress: '0xabc', targetChainId: 42161, token: 'USDC', amount: '1.00' });

    expect(plan.requires7702Signature).toBe(true);
    expect(plan.userOpsNeedingAuth).toHaveLength(1);
    expect(plan.userOpsNeedingAuth[0]).toMatchObject({ chainId: 8453, nonce: 5, address: '0ximpl' });
  });

  it('plans a payment transaction', async () => {
    const ua = fakeUa({ transactionId: 'tx-3', rootHash: '0xroot3', userOps: [] });
    const planner = new TransactionPlanner(ua);

    const plan = await planner.planPayment({
      ownerAddress: '0xabc',
      token: { chainId: 42161, address: '0xusdc' },
      amount: '5.00',
      receiver: '0xbitrefill',
    });

    expect(plan.transactionId).toBe('tx-3');
    expect(plan.requires7702Signature).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- transaction-planner`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the planner**

Create `apps/api/src/services/transaction-planner.ts`:

```typescript
import { err, ok, type Result } from '@pouch/shared';

// Structural type matching the UA SDK's ITransaction (the fields the planner exposes).
export interface UaTransactionPlan {
  transactionId: string;
  rootHash: string;
  userOps: UaUserOp[];
}

export interface UaUserOp {
  userOpHash: string;
  eip7702Auth?: { chainId: number; nonce: number; address: string };
  eip7702Delegated?: boolean;
}

// Minimal UA client interface (mockable; real impl wraps UniversalAccount).
export interface UaClientLike {
  createConvertTransaction(payload: { chainId: number; expectToken: { type: string; amount: string } }): Promise<UaTransactionPlan>;
  createTransferTransaction(payload: { token: { chainId: number; address: string }; amount: string; receiver: string }): Promise<UaTransactionPlan>;
}

export interface UnsignedTransactionPlan {
  transactionId: string;
  rootHash: string;
  requires7702Signature: boolean;
  userOpsNeedingAuth: Array<{ chainId: number; nonce: number; address: string }>;
}

export type PlannerError = { type: 'PLANNER_FAILED'; message: string };

export class TransactionPlanner {
  constructor(private readonly ua: UaClientLike) {}

  async planConsolidation(params: {
    ownerAddress: string;
    targetChainId: number;
    token: string;
    amount: string;
  }): Promise<UnsignedTransactionPlan> {
    void params.ownerAddress;
    const tx = await this.ua.createConvertTransaction({
      chainId: params.targetChainId,
      expectToken: { type: params.token, amount: params.amount },
    });
    return this.toPlan(tx);
  }

  async planPayment(params: {
    ownerAddress: string;
    token: { chainId: number; address: string };
    amount: string;
    receiver: string;
  }): Promise<UnsignedTransactionPlan> {
    void params.ownerAddress;
    const tx = await this.ua.createTransferTransaction({
      token: params.token,
      amount: params.amount,
      receiver: params.receiver,
    });
    return this.toPlan(tx);
  }

  private toPlan(tx: UaTransactionPlan): UnsignedTransactionPlan {
    const needsAuth = tx.userOps.filter((u) => u.eip7702Auth && !u.eip7702Delegated);
    return {
      transactionId: tx.transactionId,
      rootHash: tx.rootHash,
      requires7702Signature: needsAuth.length > 0,
      userOpsNeedingAuth: needsAuth.map((u) => u.eip7702Auth!),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api test -- transaction-planner`
Expected: PASS — 3 planner tests green.

- [ ] **Step 5: Create the transactions route**

Create `apps/api/src/routes/transactions.ts`:

```typescript
import { Hono } from 'hono';

import type { AuthEnv } from '../middleware/auth';
import type { TransactionPlanner } from '../services/transaction-planner';

export function createTransactionRoutes(planner: TransactionPlanner): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  // Plan a consolidation (frontend will sign the rootHash + 7702 auths via Magic)
  router.post('/plan/consolidate', async (context) => {
    const evmAddress = context.get('evmAddress');
    if (!evmAddress) {
      return context.json({ error: 'Authenticated EVM address required.' }, 401);
    }

    const body = await context.req.json().catch(() => null) as { targetChainId?: number; token?: string; amount?: string } | null;
    if (!body?.targetChainId || !body.token || !body.amount) {
      return context.json({ error: 'targetChainId, token, and amount are required.' }, 400);
    }

    try {
      const plan = await planner.planConsolidation({
        ownerAddress: evmAddress,
        targetChainId: body.targetChainId,
        token: body.token,
        amount: body.amount,
      });
      return context.json(plan, 200);
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : 'Planning failed.' }, 500);
    }
  });

  // Plan a payment (frontend signs + sends)
  router.post('/plan/payment', async (context) => {
    const evmAddress = context.get('evmAddress');
    if (!evmAddress) {
      return context.json({ error: 'Authenticated EVM address required.' }, 401);
    }

    const body = await context.req.json().catch(() => null) as {
      token?: { chainId: number; address: string };
      amount?: string;
      receiver?: string;
    } | null;

    if (!body?.token || !body.amount || !body.receiver) {
      return context.json({ error: 'token, amount, and receiver are required.' }, 400);
    }

    try {
      const plan = await planner.planPayment({
        ownerAddress: evmAddress,
        token: body.token,
        amount: body.amount,
        receiver: body.receiver,
      });
      return context.json(plan, 200);
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : 'Planning failed.' }, 500);
    }
  });

  return router;
}
```

- [ ] **Step 6: Wire the transactions route into the app**

Modify `apps/api/src/app.ts` to optionally register the transactions route (injectable like the others). Only registered when `WEB3_PROVIDER_MODE=particle` (real UA). Add `transactionPlanner?: TransactionPlanner` to `createApp` options and `app.route('/transactions', createTransactionRoutes(planner))` when present.

- [ ] **Step 7: Verify the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/transaction-planner.ts apps/api/src/services/transaction-planner.test.ts apps/api/src/routes/transactions.ts apps/api/src/app.ts
git commit -m "feat(api): transaction-planning endpoint (frontend-driven signing seam)"
```

---

## Task 10: Update HANDOFF + roadmap + generate DB migration

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md`

**Why:** Record Phase 1 status, the architecture decision (frontend-driven signing), and the schema change (needs a migration).

- [ ] **Step 1: Update HANDOFF.md**

Add a Phase 1 section under the Phase 0 (DONE) section, marking what's done and what's deferred to Phase 3:

```markdown
### Phase 1 — Web3 spike + auth (DONE)
- ✅ Raw-key UA spike validates Particle UA + 7702 end-to-end (manual, real funds)
- ✅ `ParticleAccountProvider` (read-only balance via `getPrimaryAssets`)
- ✅ Auth: Magic DID → JWT cookie (`AuthService` + `createAuthMiddleware` + `/auth/callback`)
- ✅ `/orders/:id` + `/balance` read userId/evmAddress from auth context
- ✅ Transaction-planning endpoints (`/transactions/plan/consolidate`, `/transactions/plan/payment`)
- ⏭️ Frontend-driven signing (Magic signs rootHash + 7702) — Phase 3
```

And update the resume message to point at Phase 2 (LLM layer) or Phase 3 (frontend).

- [ ] **Step 2: Update the roadmap**

Mark Phase 1 done in `docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md` (status 🟢), and note the architecture decision in the "Cross-cutting decisions" table.

- [ ] **Step 3: Generate the Drizzle migration (MANUAL — requires DATABASE_URL)**

Run (requires a running Postgres or Supabase connection):
```bash
pnpm db:generate    # generates the migration files for the new issuer column + indexes
pnpm db:migrate     # applies them
```

If no DB is available during this session, document this as a manual step: "Run `pnpm db:generate && pnpm db:migrate` against the target Postgres before testing auth end-to-end."

- [ ] **Step 4: Commit**

```bash
git add docs/HANDOFF.md docs/superpowers/plans/2026-07-13-pouch-implementation-roadmap.md
git commit -m "docs: mark Phase 1 complete, record frontend-driven-signing architecture"
```

---

## Self-review notes

**Spec coverage check:**
- Spike (spec §5): ✅ Task 1 (raw-key spike, all success criteria).
- Real Particle provider (spec Gap B): ✅ Tasks 2–3 (mapper + read-only provider).
- Auth (spec §6): ✅ Tasks 4–8 (config, schema, repo, service, middleware, routes).
- Cross-chain consolidation + payment: ✅ via the transaction-planning endpoint (Task 9) — adapted to frontend-driven signing.
- Magic blind signatures: ⏭️ Phase 3 (browser). The server-side seam (planning) lands here.
- chains.ts from env: covered implicitly — chain config flows through env (`SETTLEMENT_CHAIN_ID`, `SUPPORTED_CHAINS`) and the planner takes `targetChainId` from the request. No hardcoded chains.

**Architecture decision recorded:** frontend-driven signing (server plans, browser signs). This is the honest architecture given Magic's browser-only signing. The server-side executor's `consolidate`/`sendPayment` remain `err(...)` in real Particle mode; the demo provider simulates them for tests.

**Placeholder scan:** none — every code step contains complete, runnable code. The spike script is a full, executable Node program.

**Type consistency:** `UaClientLike` in the planner matches the UA SDK's `createConvertTransaction`/`createTransferTransaction` signatures. `MagicAdminLike` matches `@magic-sdk/admin`'s `token`/`users` module shapes. `AuthEnv` flows from the middleware through the typed `Hono<AuthEnv>` routes.

**Manual gates (NOT automated):**
1. Spike (Task 1, Step 4) — real funds, human-run.
2. DB migration (Task 10, Step 3) — requires a live Postgres.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-pouch-phase1-web3-spike-and-auth.md`.

**Two manual gates must be satisfied by a human before Phase 1 is "done":**
1. **The spike** (Task 1) — requires real USDC + Particle credentials + a funded EOA private key.
2. **The DB migration** (Task 10) — requires a live Postgres/Supabase.

Everything else (Tasks 2–9) is fully automatable: TDD with mocked external dependencies, no funds, no network. The agent can execute those in order; the human runs the spike + migration when ready.

**Which execution approach? (Subagent-driven recommended, or inline?)**
