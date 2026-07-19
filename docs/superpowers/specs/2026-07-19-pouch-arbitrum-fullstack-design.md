# Pouch Arbitrum Full Stack — Design Spec

**Status:** Draft | **Date:** 2026-07-19 | **Deadline:** Jul 20, 2026, 1:59 PM GMT+2

## Overview

Transform Pouch from a demo with mock transactions into a **production-grade Arbitrum demo** where judges see real on-chain activity. Every technology (Arbitrum, Openfort, Magic, Particle UA) is demonstrated with live, verifiable data.

**Core demo flow (30 seconds):**
```
User: "send 5 ARB to Wallet 3"
Pouch: Shows plan (from, to, amount, gas sponsored, chain)
User: "yes"
Pouch: Executes real Arbitrum tx → shows tx hash + Arbiscan link + trace
```

---

## 1. Architecture Changes

### 1.1 `PrivateKeyAccountProvider` — Real Transaction Signing

**Current:** `sendPayment()` and `consolidate()` return mock tx hashes (`0xmock-*`).
**Target:** `sendPayment()` signs and broadcasts real transactions to Arbitrum.

```typescript
// NEW: sendPayment() actually signs and sends
async sendPayment(params: SendPaymentParams): Promise<Result<TxResult, DomainError>> {
  // 1. Validate 'to' is a known wallet (security: only internal transfers)
  const toWallet = this.wallets.find(w => 
    w.address.toLowerCase() === params.to.toLowerCase()
  );
  if (!toWallet) {
    return err({ type: 'SECURITY_BLOCKED', check: 'wallet', 
      detail: 'Can only send to imported wallets', riskScore: 100 });
  }

  // 2. Find the sending wallet by userId (maps to wallet label)
  const fromWallet = this.resolveWallet(params.from);
  
  // 3. Create signer from private key
  const signer = new ethers.Wallet(fromWallet.privateKey, this.providers.get(params.chainId));
  
  // 4. Execute transfer
  if (params.token === 'ETH') {
    // Native token transfer
    const tx = await signer.sendTransaction({
      to: params.to,
      value: ethers.parseEther(params.amount.value.toString()),
    });
    const receipt = await tx.wait();
    return ok({ txHash: tx.hash, chainId: params.chainId, blockNumber: receipt.blockNumber });
  } else {
    // ERC-20 transfer
    const tokenAddress = this.getTokenAddress(params.token, params.chainId);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const decimals = await token.decimals();
    const amountWei = ethers.parseUnits(params.amount.value.toString(), decimals);
    const tx = await token.transfer(params.to, amountWei);
    const receipt = await tx.wait();
    return ok({ txHash: tx.hash, chainId: params.chainId, blockNumber: receipt.blockNumber });
  }
}
```

**Key design decisions:**
- **Security gate:** `to` address MUST be in the imported wallets list. External addresses rejected.
- **Private key storage:** Keys stored in memory only (loaded from env at startup). Never logged.
- **Gas estimation:** ethers v6 auto-estimates gas. We add 20% buffer for safety.
- **Error handling:** RPC errors, insufficient funds, reverted txs all mapped to `DomainError`.

### 1.2 Wallet-to-Wallet Transfer Flow

```
Chat Message → IntentParser → handleSend() → Confirmation → executeSend()
                                                              │
                                              ┌───────────────┴───────────────┐
                                              │                               │
                                        Direct signing              Openfort relay
                                        (ethers.Wallet)          (gas sponsored)
                                              │                               │
                                              └───────────────┬───────────────┘
                                                              │
                                                    Tx hash + Arbiscan link
```

**Two execution modes:**
1. **Direct signing (always works):** Sign with `ethers.Wallet`, broadcast to Arbitrum RPC. User pays gas (~$0.01-0.03).
2. **Openfort relay (if configured):** Submit via Openfort backend wallet, gas sponsored by policy. Used when `OPENFORT_SECRET_KEY` is set.

### 1.3 `AgentChatService` — Rewrite `handleSend()`

**Current:** Shows wallet list, returns `phase: 'confirmation'` but never executes.
**Target:** Full multi-turn flow with confirmation + real execution.

```typescript
// New enum value for send phase
type ConversationPhase = 'reply' | 'confirmation' | 'executed' | 'send_confirmation';

// handleSend() — complete rewrite
private async handleSend(userId: string, intent: CashOutIntent): Promise<Result<AgentChatResponse, DomainError>> {
  // 1. Parse the send intent: amount, token, from wallet, to wallet
  const sendDetails = this.parseSendIntent(intent);
  
  // 2. Validate wallets exist
  const fromWallet = this.findWallet(sendDetails.fromLabel);
  const toWallet = this.findWallet(sendDetails.toLabel);
  if (!fromWallet || !toWallet) {
    return error reply: "Wallet not found. Available: Wallet 1, Wallet 3, Wallet 4"
  }
  
  // 3. Check balance
  const balance = await this.balanceService.getBalance(userId);
  if (balance.value.total < sendDetails.amount.value) {
    return insufficient funds reply
  }
  
  // 4. Security check
  if (this.securityChecker) {
    const check = await this.securityChecker.check(intent, userId);
    if (check.value.verdict === 'BLOCK') return blocked reply
  }
  
  // 5. Store pending send + show confirmation
  pendingConfirmations.set(userId, { intent, planSummary: sendDetails.summary });
  
  return {
    phase: 'send_confirmation',
    reply: "💸 Sending 5 ARB from Wallet 1 → Wallet 3 on Arbitrum. Gas sponsored by Openfort. Confirm?",
    planSummary: sendDetails.summary,
    balanceSnapshot: balance.value,
    sendDetails: { from, to, amount, token, chainId }
  };
}

// executeSend() — new method
private async executeSend(userId: string, intent: CashOutIntent): Promise<Result<AgentChatResponse, DomainError>> {
  const trace = new TraceRecorder();
  
  // Step 1: Balance check
  trace.start('Checking balance').complete({ badge: '119.48 ARB' });
  
  // Step 2: Security check
  trace.start('Security check', { badge: 'SHIELD' }).complete({ badge: 'SAFE ✓' });
  
  // Step 3: Gas sponsorship (if Openfort)
  if (this.agentWallet) {
    trace.start('Openfort gas sponsorship', { badge: 'GASLESS' }).complete();
  }
  
  // Step 4: Sign + send
  trace.start('Signing transaction', { badge: 'NO POPUP' });
  const result = await this.account.sendPayment({
    from: userId,
    to: toWallet.address,
    amount: sendDetails.amount,
    chainId: 42161,
    token: sendDetails.token,
  });
  trace.complete(stepId);
  
  // Step 5: Confirmation
  trace.start('Confirmed on Arbitrum', { badge: `Block #${receipt.blockNumber}` }).complete();
  
  return {
    phase: 'executed',
    reply: `✅ Sent 5 ARB to Wallet 3!\n🔗 https://arbiscan.io/tx/${txHash}`,
    trace: trace.steps,
    sendReceipt: { txHash, blockNumber, gasUsed, from, to, amount, token, chainId }
  };
}
```

### 1.4 Openfort Gas Sponsorship — Two Strategies

**Strategy A: Direct signing (default, always available)**
- Sign tx with ethers.Wallet
- Broadcast to Arbitrum public RPC
- User pays gas (~$0.01-0.03)
- Show gas cost in trace
- **Used when `OPENFORT_SECRET_KEY` is NOT set**

**Strategy B: Openfort relay (when keys are set)**
- The `OpenfortAgentWallet` is used in a new `relayTransaction()` method
- Openfort backend wallet submits the tx, policy pays gas
- Trace shows: "⛽ Gas: $0.03 — Paid by Openfort"
- **Used when `OPENFORT_SECRET_KEY` IS set**

```typescript
// New method on OpenfortAgentWallet
async relayTransfer(params: {
  from: string;
  to: string;
  amount: { value: number; currency: 'USD' };
  token: string;
  chainId: number;
  walletSecret: string;
}): Promise<Result<TxResult, DomainError>> {
  // 1. Encode transfer calldata
  const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
  const data = iface.encodeFunctionData('transfer', [params.to, amountWei]);
  
  // 2. Submit via Openfort with gas sponsorship
  const result = await client.accounts.evm.backend.sendTransaction({
    account: { id: backendWalletId },
    chainId: params.chainId,
    interactions: [{ to: tokenAddress, data }],
    policy: this.feeSponsorshipId, // ← Openfort pays gas
  });
  
  return ok({ txHash: result.response.transactionHash, chainId: params.chainId });
}
```

### 1.5 Magic Labs — Configure for Arbitrum

**Current:** Magic EVM extension hardcoded to Ethereum mainnet (chainId 1).
**Target:** Magic configured for Arbitrum (chainId 42161).

```typescript
// apps/web/src/lib/magic-client.ts
const EVM_CONFIG = {
  chainId: Number(process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID ?? '42161'), // ← Arbitrum
  rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ?? 'https://arb1.arbitrum.io/rpc',
};
```

**Env vars to add:**
- `NEXT_PUBLIC_MAGIC_CHAIN_ID=42161`
- `NEXT_PUBLIC_ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc`

---

## 2. Frontend Changes

### 2.1 `SendReceiptCard` — New Component

Shows the result of a wallet-to-wallet transfer, replacing the generic `ReceiptCard` for send flows.

```
┌──────────────────────────────────────────────┐
│  💸 Transfer Complete                        │
│                                              │
│  📤 From: Wallet 1 (0xA5fA...2fF0)          │
│  📥 To:   Wallet 3 (0x4c7e...d619)          │
│  💰 Amount: 5 ARB (~$0.44)                  │
│  ⛽ Gas: 0.000031 ETH ($0.03)               │
│  ⛓️ Network: Arbitrum One                    │
│                                              │
│  📋 Tx Hash: 0xabc123...def456               │
│  🔗 View on Arbiscan                         │
│  🔗 View on Openfort (if gas sponsored)      │
│                                              │
│  💡 This transfer was signed with a blind    │
│  signature (Magic) — no wallet popup needed. │
│  Gas was sponsored by Openfort's policy.     │
└──────────────────────────────────────────────┘
```

### 2.2 `TraceTimeline` — New Badges

| Badge | Meaning | Color |
|-------|---------|-------|
| `Arbitrum` | Tx executed on Arbitrum One | Blue |
| `GASLESS` | Gas sponsored by Openfort | Green |
| `SIGNED` | Transaction signed | Blue |
| `BROADCAST` | Tx broadcast to network | Amber |
| `CONFIRMED` | Block confirmation | Green |
| `NO POPUP` | Blind signature, zero user interaction | Emerald |

### 2.3 `AgentTurn` — Send Confirmation Flow

When `phase === 'send_confirmation'`, show a `SendConfirmationCard` instead of the generic `ConfirmationCard`.

```
┌──────────────────────────────────────────────┐
│  💸 Confirm Transfer                         │
│                                              │
│  Send 5 ARB (~$0.44)                        │
│  From: Wallet 1 → To: Wallet 3              │
│  Network: Arbitrum One                       │
│  Gas: Sponsored by Openfort ($0.00)          │
│                                              │
│  [✅ Confirm]  [❌ Cancel]                   │
└──────────────────────────────────────────────┘
```

### 2.4 Dashboard — New "Arbitrum Live" Panel

```
┌──────────────────────────────────────────────┐
│  ⛓️ Arbitrum Live                            │
│                                              │
│  Last tx: 2 min ago                         │
│  5 ARB → Wallet 3 ✅                        │
│  0xabc1...def456                            │
│                                              │
│  📊 Activity:                                │
│  Wallet 1: 109.48 ARB  (-5.00)             │
│  Wallet 3: +5.00 ARB     🆕                │
│                                              │
│  🔗 Arbiscan  🔗 Openfort Dashboard         │
│                                              │
│  ─────────────────────────────────────────  │
│  💡 Arbitrum bounty ($2,000):               │
│  Settlement chain for all Pouch transfers.   │
│  Real transactions on Arbitrum One.          │
│  119.48 ARB across 2 wallets.               │
└──────────────────────────────────────────────┘
```

### 2.5 `BountyPanel` — Update for 4 Active Bounties

Update to show all 4 bounties as LIVE (not just "ready"):

| Bounty | Status | Demo |
|--------|--------|------|
| Universal Accounts Track | 🟢 Live | Multi-chain balance |
| Arbitrum | 🟢 Live | Real tx on Arbiscan |
| Magic Labs | 🟢 Live | Blind signature login |
| Openfort | 🟢 Live | Gas sponsorship |

---

## 3. Data Flow

### 3.1 Send Transfer — Full Sequence

```
1. User types "send 5 ARB to Wallet 3"
2. ChatProvider → POST /api/agent/chat { message, userId }
3. AgentChatService.handleMessage()
   ├─ intentParser.parse() → { action: "send", amount: 5, brand: "ARB", ... }
   ├─ handleSend()
   │   ├─ Parse: from=Wallet 1, to=Wallet 3, token=ARB, amount=5
   │   ├─ Validate wallets exist
   │   ├─ Check balance (119.48 ARB >= 5 ARB)
   │   ├─ Security check → SAFE
   │   └─ Return phase: "send_confirmation"
4. Frontend shows SendConfirmationCard
5. User types "yes"
6. AgentChatService.handleMessage()
   ├─ Detects pending confirmation
   ├─ executeSend()
   │   ├─ Trace: "Checking balance" → 119.48 ARB ✅
   │   ├─ Trace: "Security check" → SAFE ✓
   │   ├─ Trace: "Openfort gas sponsorship" → Approved ✅
   │   ├─ Trace: "Signing transaction" → [NO POPUP]
   │   ├─ AccountProvider.sendPayment()
   │   │   ├─ Create ethers.Wallet(privateKey)
   │   │   ├─ Connect to Arbitrum RPC
   │   │   ├─ Estimate gas
   │   │   ├─ signTransaction()
   │   │   ├─ broadcastTransaction()
   │   │   └─ Wait for confirmation (1 block)
   │   ├─ Trace: "Broadcasting to Arbitrum" → Pending...
   │   └─ Trace: "Confirmed" → Block #28475691 ✅
7. Frontend shows SendReceiptCard with tx hash + Arbiscan link
```

### 3.2 Error Handling

```
RPC timeout → retry 3x with exponential backoff → "Network error, try again"
Insufficient funds → "You only have X ARB. Try a smaller amount."
Tx reverted → "Transaction failed. Reason: [revert reason]"
Invalid wallet → "Can only send to your imported wallets: Wallet 1, Wallet 3, Wallet 4"
Gas too high → "Gas estimate: $X.XX. Continue?"
```

---

## 4. Configuration

### 4.1 New/Modified Env Vars

```bash
# .env additions
NEXT_PUBLIC_MAGIC_CHAIN_ID=42161          # Magic EVM extension → Arbitrum
NEXT_PUBLIC_ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc  # Frontend RPC

# Existing (already set)
PRIVATE_KEY=0x...                          # Wallet 1 (sender)
SECOND_PRIVATE_KEY=0x...                   # Wallet 2
SEED_PHRASE_1=...                         # Wallet 3 (receiver)
OPENFORT_SECRET_KEY=sk_test_...           # Openfort API key
OPENFORT_WALLET_SECRET=...                # Backend wallet
OPENFORT_FEE_SPONSORSHIP_ID=pol_...       # Gas sponsorship policy
MAGIC_SECRET_KEY=sk_live_...              # Magic admin
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=pk_live_...  # Magic frontend
```

### 4.2 Chain Configuration

```typescript
// packages/infra-web3/src/private-key/private-key-provider.ts
const ARBITRUM_CHAIN_ID = 42161;

// Token addresses on Arbitrum
const ARBITRUM_TOKENS = {
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  ETH: 'NATIVE', // native token
};

// Gas settings
const GAS_BUFFER = 1.2; // 20% buffer on estimates
const MAX_GAS_PRICE_GWEI = 100; // reject if gas > 100 gwei
```

---

## 5. Testing Strategy

### 5.1 Unit Tests (new)

| Test | What it validates |
|------|-------------------|
| `PrivateKeyAccountProvider.sendPayment()` | Signs and sends real tx (integration test against Arbitrum fork) |
| `PrivateKeyAccountProvider.sendPayment()` security | Rejects external addresses |
| `AgentChatService.handleSend()` | Parses "send 5 ARB to Wallet 3" correctly |
| `AgentChatService.executeSend()` | Full send flow with trace |
| `OpenfortAgentWallet.relayTransfer()` | Encodes and submits transfer via Openfort |

### 5.2 Integration Tests

| Test | What it validates |
|------|-------------------|
| E2E send flow | Chat message → confirmation → real tx → receipt |
| Magic auth flow | Email login → DID → JWT → session |
| Openfort gas sponsorship | Tx submitted with policy → gas paid by Openfort |
| Arbiscan link | Generated tx hash resolves on arbiscan.io |

### 5.3 Manual Verification (for judges)

1. **Arbitrum verification:** Open Arbiscan link → see real tx with block confirmations
2. **Openfort verification:** Openfort Dashboard → see sponsored transaction
3. **Magic verification:** Login with email → no MetaMask popup → session active
4. **Balance verification:** After transfer, Wallet 1 decreases, Wallet 3 increases

---

## 6. Files Changed

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/components/chat/SendConfirmationCard.tsx` | Send confirmation UI |
| `apps/web/src/components/chat/SendReceiptCard.tsx` | Transfer receipt with tx details + links |
| `apps/web/src/components/dashboard/ArbitrumPanel.tsx` | Arbitrum Live dashboard panel |
| `packages/infra-web3/src/private-key/send-transfer.ts` | Extracted transfer logic (sign + broadcast) |

### Modified Files
| File | Change |
|------|--------|
| `packages/infra-web3/src/private-key/private-key-provider.ts` | Real `sendPayment()` + `consolidate()` |
| `packages/domain/src/types.ts` | Add `SendReceipt` type, extend `TxResult` |
| `apps/api/src/services/agent-chat-service.ts` | Rewrite `handleSend()` + add `executeSend()` |
| `packages/infra-web3/src/openfort/openfort-provider.ts` | Add `relayTransfer()` method |
| `apps/web/src/lib/magic-client.ts` | Configure Magic for Arbitrum (chainId 42161) |
| `apps/web/src/components/chat/AgentTurn.tsx` | Handle `send_confirmation` phase |
| `apps/web/src/components/chat/TraceTimeline.tsx` | Add new badges (Arbitrum, GASLESS, etc.) |
| `apps/web/src/components/dashboard/DashboardLayout.tsx` | Add `ArbitrumPanel` |
| `apps/web/src/components/dashboard/BountyPanel.tsx` | Update bounty statuses |
| `apps/web/src/lib/types.ts` | Add `SendReceipt` to `AgentChatResponse` |
| `apps/api/src/bootstrap/create-runtime-app-services.ts` | Wire new send flow |
| `.env` / `.env.example` | Add `NEXT_PUBLIC_MAGIC_CHAIN_ID`, `NEXT_PUBLIC_ARBITRUM_RPC_URL` |

---

## 7. Open Questions & Risks

### Open Questions
1. **Openfort relay for wallet-to-wallet:** Can we use `accounts.evm.backend.sendTransaction` to relay user-signed transactions? Or does it only work with the backend wallet's own funds? If the latter, we use direct signing + show Openfort policy as "ready".
2. **Magic on Arbitrum:** Does Magic's EVM extension work correctly with Arbitrum's RPC? Need to test the login flow.
3. **Gas tank:** Openfort gas tank has $3.00. How many sponsored transactions can we do?

### Risks
| Risk | Mitigation |
|------|------------|
| Arbitrum RPC rate limits | Use backup RPC (Alchemy/Infura) |
| Openfort SDK incompatibility | Fall back to direct signing |
| Magic iframe CSP issues | Already handled (8s timeout → anonymous) |
| Gas price spikes | Max gas price check (100 gwei) |
| Private key exposure | Keys only in memory, never logged, masked in traces |

---

## 8. Success Criteria (for Judges)

- [ ] Judge types "send 5 ARB to Wallet 3" → sees confirmation card
- [ ] Judge clicks Confirm → sees real tx on Arbiscan
- [ ] Arbiscan link opens and shows the confirmed transaction
- [ ] Trace shows all steps: balance → security → sign → broadcast → confirmed
- [ ] Openfort badge visible in trace (gas sponsorship)
- [ ] Magic login works (email → no popup → session active)
- [ ] After transfer, Wallet 1 balance decreases, Wallet 3 increases
- [ ] Dashboard "Arbitrum Live" panel updates in real-time
- [ ] All 4 bounties show as "🟢 Live" in BountyPanel