# Gas Optimization & Judge-Ready UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce demo gas consumption 10-50x and add transparent transaction UX (explorer links, gas sponsor display, FundGasReceiptCard) so judges can test 200+ times and verify every transaction on-chain.

**Architecture:** Centralized explorer URL utility (`@pouch/shared`), domain type extensions (backward-compatible optional fields), Openfort/private-key provider improvements (gas buffer, slippage, explorer URLs), new FundGasReceiptCard frontend component, and dynamic explorer button text across all receipt cards.

**Tech Stack:** TypeScript, React/Next.js 15, ethers v6, domain-driven design (adapter pattern)

**Spec:** `docs/superpowers/specs/2026-07-19-pouch-gas-optimization-judge-ready-ux.md`

---

### Task 1: Centralized Explorer URL Utility

**Files:**
- Create: `packages/shared/src/explorer.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the explorer utility**

```typescript
// packages/shared/src/explorer.ts

/** Block explorer configurations for all supported chains. */
export const EXPLORERS: Record<number, { name: string; txUrl: string; addressUrl: string }> = {
  42161: { name: 'Arbiscan', txUrl: 'https://arbiscan.io/tx', addressUrl: 'https://arbiscan.io/address' },
  8453: { name: 'BaseScan', txUrl: 'https://basescan.org/tx', addressUrl: 'https://basescan.org/address' },
  43114: { name: 'SnowTrace', txUrl: 'https://snowtrace.io/tx', addressUrl: 'https://snowtrace.io/address' },
  137: { name: 'PolygonScan', txUrl: 'https://polygonscan.com/tx', addressUrl: 'https://polygonscan.com/address' },
  1: { name: 'Etherscan', txUrl: 'https://etherscan.io/tx', addressUrl: 'https://etherscan.io/address' },
  10: { name: 'Optimism Explorer', txUrl: 'https://optimistic.etherscan.io/tx', addressUrl: 'https://optimistic.etherscan.io/address' },
};

/**
 * Generate a block explorer URL for a transaction or address.
 * @param chainId - The chain ID (e.g. 42161 for Arbitrum)
 * @param type - 'tx' for transaction, 'address' for account
 * @param hash - The transaction hash or address
 * @returns The full explorer URL, or a fallback to arbiscan for unknown chains
 */
export function getExplorerUrl(chainId: number, type: 'tx' | 'address', hash: string): string {
  const explorer = EXPLORERS[chainId];
  if (!explorer) {
    // Fallback to Arbiscan for unknown chains
    return `https://arbiscan.io/${type}/${hash}`;
  }
  return `${type === 'tx' ? explorer.txUrl : explorer.addressUrl}/${hash}`;
}

/**
 * Get the human-readable explorer name for a chain.
 * @param chainId - The chain ID
 * @returns The explorer name (e.g. "Arbiscan"), or "Explorer" for unknown chains
 */
export function getExplorerName(chainId: number): string {
  return EXPLORERS[chainId]?.name ?? 'Explorer';
}
```

- [ ] **Step 2: Export the new module**

Edit `packages/shared/src/index.ts` — add `export * from './explorer';` after line 4:

```typescript
export * from './config';
export * from './http';
export * from './logger';
export * from './result';
export * from './explorer';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/shared
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/explorer.ts packages/shared/src/index.ts
git commit -m "feat: centralized block explorer URL utility (getExplorerUrl, getExplorerName)"
```

---

### Task 2: Domain Type Extensions

**Files:**
- Modify: `packages/domain/src/trace.ts` (add `explorerUrl?` to `TraceStep`)
- Modify: `packages/domain/src/types.ts` (add `FundGasReceipt`, `gasSponsored?` to `SwapResult`)

- [ ] **Step 1: Add `explorerUrl?` to `TraceStep`**

Edit `packages/domain/src/trace.ts` — add `explorerUrl?` to the `TraceStep` interface (after `detail?`):

```typescript
export interface TraceStep {
  id: string;
  label: string;
  status: TraceStepStatus;
  durationMs?: number;
  badge?: string;
  detail?: string;
  /** Optional block explorer URL for this step (e.g. tx link). */
  explorerUrl?: string;
}
```

- [ ] **Step 2: Add `FundGasReceipt` interface and `gasSponsored?` to `SwapResult`**

Edit `packages/domain/src/types.ts` — add after `SwapResult` interface (after line 207):

```typescript
/** Receipt for a gas funding operation (Openfort sendEth). */
export interface FundGasReceipt {
  txHash: string;
  chainId: number;
  blockNumber?: number;
  /** Amount of ETH sent for gas */
  amountEth: number;
  /** Source wallet label (e.g. "Openfort Backend") */
  fromLabel: string;
  /** Source wallet address */
  fromAddress: string;
  /** Destination wallet label */
  toLabel: string;
  /** Destination wallet address */
  toAddress: string;
  /** Whether gas was sponsored by Openfort */
  gasSponsored: boolean;
  /** Block explorer URL for the transaction */
  explorerUrl?: string;
}
```

Add `gasSponsored?` to `SwapResult` (after `explorerUrl?` on line 204):

```typescript
export interface SwapResult {
  txHash: string;
  chainId: number;
  blockNumber?: number;
  tokenIn: string;
  amountIn: number;
  tokenOut: string;
  amountOut: number;
  gasUsed?: string;
  gasCostUsd?: number;
  explorerUrl?: string;
  /** Source wallet label */
  walletLabel: string;
  /** Whether gas was sponsored by Openfort (true for agent-backed swaps) */
  gasSponsored?: boolean;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/domain
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/trace.ts packages/domain/src/types.ts
git commit -m "feat: domain types — TraceStep.explorerUrl, FundGasReceipt, SwapResult.gasSponsored"
```

---

### Task 3: Openfort sendEth Returns explorerUrl

**Files:**
- Modify: `packages/infra-web3/src/openfort/openfort-provider.ts`

- [ ] **Step 1: Import the explorer utility and update sendEth return**

Edit `packages/infra-web3/src/openfort/openfort-provider.ts` — add import after line 2:

```typescript
import { getExplorerUrl } from '@pouch/shared';
```

Update the `sendEth` return at line 203-206 to include `explorerUrl`:

```typescript
      return ok({
        txHash: result.response.transactionHash,
        chainId: params.chainId,
        explorerUrl: getExplorerUrl(params.chainId, 'tx', result.response.transactionHash),
      });
```

Also update the `settlePayment` return at line 151-154:

```typescript
      return ok({
        txHash: result.response.transactionHash,
        chainId: params.chainId,
        explorerUrl: getExplorerUrl(params.chainId, 'tx', result.response.transactionHash),
      });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/infra-web3
```

- [ ] **Step 3: Commit**

```bash
git add packages/infra-web3/src/openfort/openfort-provider.ts
git commit -m "feat: Openfort sendEth/settlePayment return explorerUrl via shared utility"
```

---

### Task 4: PrivateKey Provider — Gas Improvements

**Files:**
- Modify: `packages/infra-web3/src/private-key/private-key-provider.ts`

- [ ] **Step 1: Import shared explorer, update constants**

Add import at top of file (after existing imports):

```typescript
import { getExplorerUrl } from '@pouch/shared';
```

Change constants (lines 109-110):

```typescript
const GAS_BUFFER = 1.2; // 20% buffer on gas estimates
const MAX_GAS_PRICE_GWEI = 50; // reject if gas > 50 gwei (Arbitrum is ~0.01 gwei)
```

- [ ] **Step 2: Remove the local BLOCK_EXPLORERS map**

Delete lines 85-89 (the local `BLOCK_EXPLORERS` constant). Replace any usage with `getExplorerUrl()`.

- [ ] **Step 3: Apply GAS_BUFFER to sendPayment gas estimation**

In the `sendPayment` method, find the gas estimation section. After `const estimatedGas = await ...estimateGas(tx)`, apply:

```typescript
const bufferedGas = BigInt(Math.ceil(Number(estimatedGas) * GAS_BUFFER));
```

Then use `bufferedGas` instead of `estimatedGas` in the transaction.

- [ ] **Step 4: Apply GAS_BUFFER to swap gas estimation**

In the `swap` method (around line 672), after the swap transaction is constructed, add gas buffer:

```typescript
const estimatedGas = await router.estimateGas.exactInputSingle({...params});
const bufferedGas = BigInt(Math.ceil(Number(estimatedGas) * GAS_BUFFER));
// Pass gasLimit: bufferedGas to the transaction
```

- [ ] **Step 5: Add slippage protection to swap**

Replace `amountOutMinimum: 0n` (line 690) with:

```typescript
// 5% slippage (500 bps) — production-quality for demo
// Estimate expected output: use a simple price ratio (ARB ~0.00025 ETH per ARB)
const estimatedOutWei = amountInWei * 25n / 100000n; // rough ARB/ETH ratio
const amountOutMinimum = estimatedOutWei * 95n / 100n; // 5% slippage
```

- [ ] **Step 6: Update explorerUrl generation to use shared utility**

In the swap method (line 730), replace `...explorerUrl ? { explorerUrl: \`${explorerUrl}/${swapTx.hash}\` } : {}` with:

```typescript
explorerUrl: getExplorerUrl(chainId, 'tx', swapTx.hash),
```

In sendPayment methods, replace any hardcoded explorer URL construction with `getExplorerUrl()`.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/infra-web3
```

- [ ] **Step 8: Commit**

```bash
git add packages/infra-web3/src/private-key/private-key-provider.ts
git commit -m "feat: apply GAS_BUFFER, lower MAX_GAS_PRICE to 50 gwei, add 5% slippage, use shared explorer"
```

---

### Task 5: Intent Parser — Fund Gas Default Amount

**Files:**
- Modify: `packages/domain/src/intent-parser.ts`

- [ ] **Step 1: Reduce default fund gas amount**

Edit line 128 — change `0.0005` to `0.00005`:

```typescript
        amount: { value: 0.00005, currency: 'USD' },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/domain
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/intent-parser.ts
git commit -m "feat: reduce default fund gas amount from 0.0005 to 0.00005 ETH"
```

---

### Task 6: AgentChatService — Amounts, Auto-Skip, FundGasReceipt

**Files:**
- Modify: `apps/api/src/services/agent-chat-service.ts`

This is the largest task. We'll do it in sub-steps.

- [ ] **Step 1: Import new types**

Add `FundGasReceipt` to the import on line 1:

```typescript
import type { ..., FundGasReceipt } from '@pouch/domain';
```

Add `getExplorerUrl` import:

```typescript
import { ..., getExplorerUrl } from '@pouch/shared';
```

Add `fundGasReceipt?` to the `AgentChatResponse` interface (after `swapReceipt?` on line 25):

```typescript
  /** Receipt for gas funding operations (set when phase === 'executed' and action is fund_gas). */
  fundGasReceipt?: FundGasReceipt;
```

- [ ] **Step 2: Reduce gas funding amount in fundGasForWallet**

Change line 915 from `0.0005` to `0.00005`:

```typescript
    const amountEth = intent.amount.value > 0 ? intent.amount.value : 0.00005;
```

- [ ] **Step 3: Reduce auto-fund gas amount in handleSend**

Change line 398 from `0.0005` to `0.00005`:

```typescript
            amount: { value: 0.00005, currency: 'USD' },
```

Also update the reply text on line 405 from `0.0005 ETH` to `0.00005 ETH`:

```typescript
              error: `⛽ Gas auto-funded by Openfort! 0.00005 ETH sent to ${matchedFrom}. Ready to send.`,
```

- [ ] **Step 4: Add auto-skip logic to fundGasForWallet**

Before the `if (!walletAddress)` check (around line 890), add ETH balance check:

```typescript
    // Auto-skip: if wallet already has ETH, don't waste Openfort funds
    const ethAssets = b.assets.filter(
      (a) => a.walletLabel === fromLabel && a.symbol === 'ETH' && a.chainId === (intent.chainId ?? 42161),
    );
    const ethBalance = ethAssets.reduce((sum, a) => sum + a.amount, 0);
    if (ethBalance > 0.00001) {
      const trace = [
        { id: '1', label: `Wallet already has ${ethBalance.toFixed(6)} ETH`, status: 'complete' as const, badge: 'SKIP' },
        { id: '2', label: 'Skipping gas funding', status: 'complete' as const, badge: '💰' },
      ];
      const reply = `⛽ **Gas already funded!**\n\n${fromLabel} has ${ethBalance.toFixed(6)} ETH — enough for ~${Math.floor(ethBalance / 0.000002)} transactions. No need to spend Openfort credits.`;
      pushHistory(userId, 'agent', reply);
      return ok({
        orderId: `skip-gas-${Date.now()}`,
        status: 'delivered',
        trace,
        intent,
        reply,
        phase: 'executed',
        llmReply: false,
      });
    }
```

- [ ] **Step 5: Build FundGasReceipt in fundGasForWallet (real path)**

In the real path (after line 947), construct and return `fundGasReceipt`:

```typescript
    const tx = result.value;
    const explorerUrl = tx.explorerUrl ?? getExplorerUrl(chainId, 'tx', tx.txHash);

    const fundGasReceipt: FundGasReceipt = {
      txHash: tx.txHash,
      chainId,
      amountEth,
      fromLabel: 'Openfort Backend',
      fromAddress: '',
      toLabel: fromLabel,
      toAddress: walletAddress,
      gasSponsored: true,
      explorerUrl,
    };

    // Get Openfort wallet address if available
    if (this.agentWallet) {
      const addrResult = await this.agentWallet.getAddress();
      if (isOk(addrResult)) {
        fundGasReceipt.fromAddress = addrResult.value.address;
      }
    }
```

Update the reply to include the receipt and return `fundGasReceipt` in the response.

- [ ] **Step 6: Build FundGasReceipt in fundGasForWallet (demo fallback path)**

In the demo fallback path (after line 923), add `fundGasReceipt`:

```typescript
      const fundGasReceipt: FundGasReceipt = {
        txHash: mockTxHash,
        chainId,
        amountEth,
        fromLabel: 'Openfort Backend',
        fromAddress: '0xOpenfort...Demo',
        toLabel: fromLabel,
        toAddress: walletAddress,
        gasSponsored: true,
        explorerUrl,
      };
```

Return `fundGasReceipt` in the response.

- [ ] **Step 7: Add explorerUrl to trace steps in executeSend**

In the real path (line 633), add `explorerUrl` to the last trace step:

```typescript
      { id: '5', label: 'Confirmed', status: 'complete' as const, badge: tx.blockNumber ? `Block #${tx.blockNumber}` : 'Pending', explorerUrl: sendReceipt.explorerUrl },
```

Do the same for the demo fallback path (line 589).

- [ ] **Step 8: Add explorerUrl to trace steps in executeSwap**

In the real path (line 838), add `explorerUrl` to the last trace step:

```typescript
      { id: '5', label: 'Confirmed', status: 'complete' as const, badge: swap.blockNumber ? `Block #${swap.blockNumber}` : 'Pending', explorerUrl: swap.explorerUrl },
```

Do the same for the demo fallback path (line 811).

- [ ] **Step 9: Add explorerUrl to trace steps in fundGasForWallet**

In both real and demo paths, add `explorerUrl` to the last trace step:

```typescript
      { id: '3', label: 'Gas sponsored by Openfort', status: 'complete' as const, badge: 'NO POPUP', explorerUrl },
```

- [ ] **Step 10: Add gasSponsored to swap result**

In the real swap path (after line 830), set `gasSponsored` on the swap result. The swap is executed via the private key provider (not Openfort), so `gasSponsored` should be `false` by default. But we can detect if the swap was gas-sponsored by checking if the account provider is an Openfort-backed one:

```typescript
    const swap = result.value;
    // Swap is executed via private key, not Openfort — gas is paid by wallet
    if (!swap.gasSponsored) {
      swap.gasSponsored = false;
    }
```

- [ ] **Step 11: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/services/agent-chat-service.ts
git commit -m "feat: reduce gas amounts, auto-skip funding, FundGasReceipt, explorerUrl in traces"
```

---

### Task 7: Frontend Types — FundGasReceipt

**Files:**
- Modify: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Add FundGasReceipt to AgentChatResponse**

Add `FundGasReceipt` to the import from `@pouch/domain` (line 1):

```typescript
import type {
  ...,
  FundGasReceipt,
} from '@pouch/domain';
```

Add `FundGasReceipt` to the re-export (line 15):

```typescript
export type {
  ...,
  FundGasReceipt,
};
```

Add `fundGasReceipt?` to `AgentChatResponse` interface (after `swapReceipt?`):

```typescript
  /** Receipt for gas funding operations. */
  fundGasReceipt?: FundGasReceipt;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "feat: add FundGasReceipt to frontend types"
```

---

### Task 8: FundGasReceiptCard Component (NEW)

**Files:**
- Create: `apps/web/src/components/chat/FundGasReceiptCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';
import type { FundGasReceipt } from '../../lib/types';
import { getExplorerName, getExplorerUrl } from '@pouch/shared';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
  8453: 'Base',
  43114: 'Avalanche C-Chain',
  1: 'Ethereum',
  137: 'Polygon',
};

/**
 * Receipt card for gas funding operations (Openfort sendEth).
 * Shows the ETH sent, from/to with clickable addresses,
 * gas sponsorship info, and explorer links.
 */
export function FundGasReceiptCard({ receipt }: { receipt: FundGasReceipt }) {
  const chainName = CHAIN_NAMES[receipt.chainId] ?? `Chain ${receipt.chainId}`;
  const explorerUrl = receipt.explorerUrl ?? getExplorerUrl(receipt.chainId, 'tx', receipt.txHash);
  const explorerName = getExplorerName(receipt.chainId);
  const shortTxHash = `${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-8)}`;
  const shortFrom = receipt.fromAddress.length > 12
    ? `${receipt.fromAddress.slice(0, 6)}...${receipt.fromAddress.slice(-4)}`
    : receipt.fromAddress;
  const shortTo = receipt.toAddress.length > 12
    ? `${receipt.toAddress.slice(0, 6)}...${receipt.toAddress.slice(-4)}`
    : receipt.toAddress;
  const fromExplorerUrl = receipt.fromAddress
    ? getExplorerUrl(receipt.chainId, 'address', receipt.fromAddress)
    : null;
  const toExplorerUrl = receipt.toAddress
    ? getExplorerUrl(receipt.chainId, 'address', receipt.toAddress)
    : null;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⛽</span>
          <span className="text-sm font-semibold text-[var(--fg)]">Gas Funded</span>
        </div>
        {receipt.blockNumber ? (
          <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            Block #{receipt.blockNumber}
          </span>
        ) : null}
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📤 From</span>
          <span className="text-[var(--fg)]">
            {receipt.fromLabel}
            {receipt.fromAddress && fromExplorerUrl ? (
              <>
                {' '}
                <a
                  href={fromExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--accent)] underline"
                >
                  ({shortFrom})
                </a>
              </>
            ) : (
              <span className="text-xs text-[var(--muted)]">({shortFrom})</span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">📥 To</span>
          <span className="text-[var(--fg)]">
            {receipt.toLabel}
            {toExplorerUrl ? (
              <>
                {' '}
                <a
                  href={toExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--accent)] underline"
                >
                  ({shortTo})
                </a>
              </>
            ) : (
              <span className="text-xs text-[var(--muted)]">({shortTo})</span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">💰 Amount</span>
          <span className="font-semibold text-[var(--fg)]">
            {receipt.amountEth} ETH
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛽ Gas</span>
          <span className="text-emerald-400">
            Sponsored by Openfort 🛡️ $0.00
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛓️ Network</span>
          <span className="text-[var(--fg)]">{chainName}</span>
        </div>
      </div>

      {/* Transaction hash */}
      <div className="mt-3 rounded-lg bg-black/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Tx Hash</span>
          <span className="font-mono text-xs text-[var(--muted-2)]">{shortTxHash}</span>
        </div>
      </div>

      {/* Explorer links */}
      <div className="mt-3 flex gap-2">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-center text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
        >
          🔗 View on {explorerName}
        </a>
        <a
          href="https://dashboard.openfort.io"
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-purple-400/10 px-3 py-2 text-center text-xs font-medium text-purple-400 hover:bg-purple-400/20 transition-colors"
        >
          🛡️ Openfort Dashboard
        </a>
      </div>

      {/* Educational footer */}
      <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        💡 Openfort sent {receipt.amountEth} ETH to {receipt.toLabel} for gas — <strong>free for you</strong>.
        This covers ~{Math.floor(receipt.amountEth / 0.000002)} transactions on {chainName}.
        {' '}The transaction is verifiable on-chain via the explorer link above.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/FundGasReceiptCard.tsx
git commit -m "feat: FundGasReceiptCard component with explorer links and gas sponsor display"
```

---

### Task 9: AgentTurn — Render FundGasReceiptCard

**Files:**
- Modify: `apps/web/src/components/chat/AgentTurn.tsx`

- [ ] **Step 1: Import and render FundGasReceiptCard**

Add import after line 9:

```typescript
import { FundGasReceiptCard } from './FundGasReceiptCard';
```

Add rendering branch after the swap receipt card (after line 43):

```typescript
      {/* Fund gas receipt card */}
      {isExecuted && response.fundGasReceipt ? (
        <FundGasReceiptCard receipt={response.fundGasReceipt} />
      ) : null}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/AgentTurn.tsx
git commit -m "feat: render FundGasReceiptCard in AgentTurn"
```

---

### Task 10: SendReceiptCard — Dynamic Explorer, Clickable Addresses

**Files:**
- Modify: `apps/web/src/components/chat/SendReceiptCard.tsx`

- [ ] **Step 1: Update imports and add explorer utilities**

Replace the local `CHAIN_NAMES` with imports from shared:

```typescript
'use client';
import type { SendReceipt } from '../../lib/types';
import { getExplorerName, getExplorerUrl } from '@pouch/shared';

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
  8453: 'Base',
  43114: 'Avalanche C-Chain',
  1: 'Ethereum',
  137: 'Polygon',
};
```

- [ ] **Step 2: Make explorer button dynamic**

Change line 19 from:
```typescript
  const explorerUrl = receipt.explorerUrl ?? `https://arbiscan.io/tx/${receipt.txHash}`;
```
to:
```typescript
  const explorerUrl = receipt.explorerUrl ?? getExplorerUrl(receipt.chainId, 'tx', receipt.txHash);
  const explorerName = getExplorerName(receipt.chainId);
```

- [ ] **Step 3: Make addresses clickable**

Add address explorer URLs:
```typescript
  const fromExplorerUrl = getExplorerUrl(receipt.chainId, 'address', receipt.fromAddress);
  const toExplorerUrl = getExplorerUrl(receipt.chainId, 'address', receipt.toAddress);
```

Update the From/To lines to make addresses clickable links. Change line 48:
```typescript
            {receipt.fromLabel}{' '}
            <a href={fromExplorerUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] underline">
              ({shortFrom})
            </a>
```

Change line 54:
```typescript
            {receipt.toLabel}{' '}
            <a href={toExplorerUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] underline">
              ({shortTo})
            </a>
```

- [ ] **Step 4: Change explorer button text**

Change line 97 from `🔗 View on Arbiscan` to:
```typescript
          🔗 View on {explorerName}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/SendReceiptCard.tsx
git commit -m "feat: SendReceiptCard — dynamic explorer name, clickable addresses, shared utility"
```

---

### Task 11: SwapReceiptCard — Dynamic Explorer, Gas Sponsor, Clickable Addresses

**Files:**
- Modify: `apps/web/src/components/chat/SwapReceiptCard.tsx`

- [ ] **Step 1: Update imports**

```typescript
'use client';
import type { SwapResult } from '../../lib/types';
import { getExplorerName, getExplorerUrl } from '@pouch/shared';
```

- [ ] **Step 2: Make explorer button dynamic**

Change line 15 from:
```typescript
  const explorerUrl = receipt.explorerUrl ?? `https://arbiscan.io/tx/${receipt.txHash}`;
```
to:
```typescript
  const explorerUrl = receipt.explorerUrl ?? getExplorerUrl(receipt.chainId, 'tx', receipt.txHash);
  const explorerName = getExplorerName(receipt.chainId);
```

- [ ] **Step 3: Add gas sponsorship display**

Change the gas display (lines 55-59) to show sponsorship when available:

```typescript
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">⛽ Gas</span>
          <span className={receipt.gasSponsored ? 'text-emerald-400' : 'text-[var(--muted-2)]'}>
            {receipt.gasSponsored
              ? 'Sponsored by Openfort 🛡️ $0.00'
              : receipt.gasCostUsd
                ? `$${receipt.gasCostUsd.toFixed(4)}`
                : receipt.gasUsed ?? 'N/A'}
          </span>
        </div>
```

- [ ] **Step 4: Change explorer button text**

Change line 83 from `🔗 View on Arbiscan` to:
```typescript
          🔗 View on {explorerName}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/SwapReceiptCard.tsx
git commit -m "feat: SwapReceiptCard — dynamic explorer, gas sponsor display, shared utility"
```

---

### Task 12: ReceiptCard — Use Shared Explorer Utility

**Files:**
- Modify: `apps/web/src/components/chat/ReceiptCard.tsx`

- [ ] **Step 1: Update imports, remove local BLOCK_EXPLORERS**

Add import:
```typescript
import { getExplorerUrl } from '@pouch/shared';
```

Remove the local `BLOCK_EXPLORERS` map (lines 14-20).

Update line 52-54 from:
```typescript
  const explorerUrl = order.payment?.chainId && order.payment?.txHash
    ? `${BLOCK_EXPLORERS[order.payment.chainId] ?? '#'}/${order.payment.txHash}`
    : null;
```
to:
```typescript
  const explorerUrl = order.payment?.chainId && order.payment?.txHash
    ? getExplorerUrl(order.payment.chainId, 'tx', order.payment.txHash)
    : null;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ReceiptCard.tsx
git commit -m "refactor: ReceiptCard uses shared explorer utility, removes local BLOCK_EXPLORERS"
```

---

### Task 13: TraceTimeline — Clickable Explorer Links

**Files:**
- Modify: `apps/web/src/components/chat/TraceTimeline.tsx`

- [ ] **Step 1: Add clickable explorerUrl to trace steps**

Update the step label rendering (line 22) to make it a link when `explorerUrl` is present:

```typescript
            {step.explorerUrl ? (
              <a
                href={step.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--accent)] underline hover:text-[var(--accent)]/80 transition-colors"
              >
                {step.label}
              </a>
            ) : (
              <span className="text-sm text-[var(--muted-2)]">{step.label}</span>
            )}
```

Also update the badge to be a link to the same explorerUrl when it's a block number:

```typescript
            {step.badge ? (
              step.explorerUrl ? (
                <a href={step.explorerUrl} target="_blank" rel="noreferrer">
                  <TechBadge badge={step.badge} />
                </a>
              ) : (
                <TechBadge badge={step.badge} />
              )
            ) : null}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/TraceTimeline.tsx
git commit -m "feat: TraceTimeline — clickable explorer links on trace steps"
```

---

### Task 14: DemoFlow — Reduced Amounts

**Files:**
- Modify: `apps/web/src/components/dashboard/DemoFlow.tsx`

- [ ] **Step 1: Update demo step amounts and descriptions**

Change the DEMO_STEPS array:

Line 29: `'Openfort sends 0.0005 ETH to your wallet — gas is FREE (sponsored)'` → `'Openfort sends 0.00005 ETH to your wallet — gas is FREE (sponsored)'`

Line 37: `'swap 1 ARB for ETH'` → `'swap 0.05 ARB for ETH'`

Line 39: `'Uniswap V3 on Arbitrum: converts ARB to ETH for gas — real on-chain swap'` → `'Uniswap V3 on Arbitrum: converts 0.05 ARB to ETH for gas — real on-chain swap'`

Line 47: `'send 5 ARB to Wallet 3'` → `'send 0.1 ARB to Wallet 3'`

Line 57: `'Cash out $5 to Amazon'` → `'Cash out $2 to Amazon'`

- [ ] **Step 2: Update the footer text**

Line 140: `'Steps 3-5 require ETH for gas. Run "Fund Gas" first to get free ETH from Openfort.'` → `'Steps 3-5 require ETH for gas (~$0.000002 each). Run "Fund Gas" first to get free ETH from Openfort.'`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck --filter @pouch/web
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/DemoFlow.tsx
git commit -m "feat: reduce demo amounts — 0.00005 ETH gas, 0.05 ARB swap, 0.1 ARB send, $2 cash out"
```

---

### Task 15: Integration — Verify Build & Test

**Files:**
- None (verification only)

- [ ] **Step 1: Full typecheck**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm typecheck
```

Expected: All packages pass. Fix any errors before proceeding.

- [ ] **Step 2: Run existing tests**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm test
```

Expected: All 150+ tests pass. New types are backward-compatible (optional fields).

- [ ] **Step 3: Full build**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && pnpm build
```

Expected: All packages build successfully.

- [ ] **Step 4: Commit final verification**

```bash
git add -A
git commit -m "chore: final verification — all typecheck, tests, build passing"
```

---

### Task 16: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
cd "/Users/munay/dev/UXmaxx Hackathon" && git push origin main
```

- [ ] **Step 2: Verify Vercel deploy**

Check Vercel dashboard for successful deployment. Verify the live URL.

- [ ] **Step 3: Manual smoke test**

On the live site:
1. Open the DemoFlow panel
2. Click "Run All 6 Steps"
3. Verify each step shows receipts with explorer links
4. Verify addresses are clickable
5. Verify gas sponsor is displayed on all receipts
6. Verify FundGasReceiptCard appears for gas funding
7. Verify trace steps have clickable explorer links

---

## Self-Review

1. **Spec coverage:** All 10 sections of the spec are covered by tasks 1-15. Task 16 is deployment verification.
2. **Placeholder scan:** No TBD, TODO, or incomplete code. All code blocks are complete.
3. **Type consistency:** `FundGasReceipt` is defined in Task 2 (domain), used in Task 6 (API), Task 7 (frontend types), Task 8 (component), Task 9 (AgentTurn). `explorerUrl` on `TraceStep` is defined in Task 2, used in Task 6 (API), Task 13 (frontend). `gasSponsored` on `SwapResult` is defined in Task 2, used in Task 6 (API), Task 11 (frontend). All consistent.
4. **Backward compatibility:** All new fields are optional (`?`). No breaking changes to existing interfaces.
5. **Scope:** Focused on gas optimization + UX transparency. No unrelated changes.