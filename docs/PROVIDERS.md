# Providers — API Reference for Agents

> Exact API details for every external service Pouch integrates with.
> Any agent implementing an adapter MUST read the relevant section here first.
> All details verified against official docs as of Jul 2026.

---

## 1. Bitrefill (off-ramp: gift cards, top-ups, eSIM)

**Status:** ✅ Verified. Primary off-ramp provider.
**Base URL:** `https://api.bitrefill.com/v2`
**Auth:** Bearer token (Personal API). Self-service, no KYC. Get key at bitrefill.com → Account > Developers.
**Setup time:** ~5 minutes.
**Docs:** https://docs.bitrefill.com (append `.md` to any page URL for markdown version)
**LLM index:** https://docs.bitrefill.com/llms.txt

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ping` | Verify auth. Returns `{ data: { message: "pong" } }`. Rate: 1 req/3s |
| GET | `/accounts/balance` | Account balance |
| GET | `/products?limit=50&country=US&type=gift_card&include_test_products=true` | List products |
| GET | `/products/{id}` | Product detail (packages or range) |
| GET | `/products/search?q=amazon&include_test_products=true` | Search |
| POST | `/invoices` | Create order (the key endpoint) |
| GET | `/invoices/{id}` | Invoice status |
| POST | `/invoices/{id}/pay` | Pay from balance (only `payment_method=balance`) |
| GET | `/orders/{id}` | Get redemption code/link |

### POST /invoices body

```json
{
  "products": [
    {
      "product_id": "amazon-us",
      "quantity": 1,
      "package_id": "amazon-us<&>50",
      "value": 75.50
    }
  ],
  "payment_method": "usdc_arbitrum",
  "refund_address": "0x...",
  "webhook_url": "https://app.com/api/webhooks/bitrefill",
  "auto_pay": true,
  "email": "user@example.com",
  "send_email": false
}
```

- `package_id` separator is literal `<&>` (e.g., `amazon-us<&>50`)
- Use `value` for flexible-amount products, `package_id` for fixed packages
- `auto_pay: true` ONLY works with `payment_method: "balance"`

### POST /invoices response

```json
{
  "data": {
    "id": "c2b27180-...",
    "status": "unpaid",
    "payment": {
      "method": "usdc_arbitrum",
      "address": "0x...",
      "price": 50.00,
      "currency": "USD",
      "status": "unpaid"
    },
    "orders": [
      { "id": "615b35e2...", "status": "created" }
    ]
  }
}
```

**Critical:** Send EXACT amount of `payment.price` in USDC to `payment.address`. Underpayment = lost funds.

### Test products (FREE, no real money needed)

| Product ID | Returns |
|------------|---------|
| `test-gift-card-link` | redemption link |
| `test-gift-card-code` | redemption code |
| `test-phone-refill` | simulates top-up |
| `test-gift-card-link-fail` | always fails (test error handling) |
| `test-gift-card-code-fail` | always fails |

**Demo flow (zero cost, instant):**
```json
POST /invoices {
  "products": [{ "product_id": "test-gift-card-code", "value": 10, "quantity": 1 }],
  "payment_method": "balance",
  "auto_pay": true
}
```
Returns `status: "complete"` immediately. Then `GET /orders/{id}` for the code.

### Crypto payment methods supported
`balance`, `bitcoin`, `lightning`, `ethereum`, `eth_base`, `eth_arbitrum`, `usdc_erc20`, `usdc_polygon`, `usdc_solana`, `usdc_base`, `usdc_arbitrum`, `usdt_trc20`, `usdt_erc20`, `usdt_polygon`, `usdt_solana`, `usdt_bsc`, `usdt_arbitrum`, `dogecoin`, `dash`, `litecoin`, `solana`, `ton`

### Confirmation times
- Lightning: instant
- L2 (Arbitrum, Base): 1-5 min
- Bitcoin: 10-60 min

### Webhooks
- Set `webhook_url` in POST /invoices body (no dashboard config needed)
- POST to your URL with full invoice object on status: `complete`, `denied`, `payment_error`
- **MUST respond 200 OK within 5 seconds**
- **MUST be idempotent** (store `invoice.id`, deduplicate)
- Check each `order.status` (`delivered`/`failed`/`refunded`) — invoice complete ≠ all orders delivered
- No HMAC signature documented; validate by fetching `GET /invoices/{id}` to confirm

### Rate limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/ping` | 1 | 3s |
| `/accounts/balance` | 60 | 10 min |
| `/products`, search | 60 | 1 min |
| Products aggregate | 1000 | 1 hour |
| `/invoices` list, `/orders` list | 20 | 1 min |
| `/invoices/{id}`, `/orders/{id}` | 60 | 10 min |
| `POST /invoices`, `POST /invoices/{id}/pay` | 60 | 10 min |

Headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Cache products for 15-30 min.

---

## 2. Reloadly (off-ramp: top-ups, eSIM, gift cards)

**Status:** ⏸️ CUT from hackathon scope (2026-07-13). Not a direct bounty; smart routing demonstrated within Bitrefill product comparison. Adapter code remains for future use.
**Base URL:** `https://topups.reloadly.com` (top-ups), `https://giftcards.reloadly.com` (gift cards), `https://esims.reloadly.com` (eSIM)
**Auth:** OAuth 2.0 client_credentials. POST to `https://auth.reloadly.com/oauth/token`.
**Setup time:** ~30 minutes.
**Docs:** https://docs.reloadly.com

### Auth
```bash
POST https://auth.reloadly.com/oauth/token
{
  "client_id": "...",
  "client_secret": "...",
  "grant_type": "client_credentials",
  "audience": "https://topups.reloadly.com"
}
# → { "access_token": "...", "expires_in": 15552000 }
```
Use different `audience` per API (topups / giftcards / esims).

### Key endpoints
- `GET /operators` — list mobile operators
- `GET /operators/fx-rate?operatorId=X&amount=10` — FX rate
- `POST /topups` — execute mobile top-up
- `GET /countries` — supported countries (+145)

### Important notes
- **Fiat-based, not crypto-native.** Account is pre-funded in USD. The agent does crypto→fiat swap internally.
- Sandbox available with test credentials.
- For the hackathon: this gives us the "multi-provider routing" story (compare Bitrefill vs Reloadly prices).

---

## 3. Magic Labs (embedded wallet)

**Status:** ✅ Verified. Core auth + UX layer.
**Docs:** https://magic.link/docs
**SDK:** `magic-sdk` + `@magic-ext/evm`
**Setup time:** 1-3 hours for email OTP.

### Key methods
```typescript
import { Magic } from 'magic-sdk';
import { Extension } from '@magic-ext/evm';

const magic = new Magic(PUBLISHABLE_KEY, {
  extensions: [new Extension()],
  network: { rpcUrl: ARBITRUM_RPC, chainId: 42161 },
});

// Login
await magic.auth.loginWithEmailOTP({ email: "user@example.com" });

// Get signer (for Particle UA EIP-7702)
const provider = new ethers.BrowserProvider(magic.rpcProvider);
const signer = await provider.getSigner();

// Sign EIP-7702 authorization (for Particle UA)
// Magic supports this — confirmed by Davide (Particle DevRel)
```

### Blind signatures
Magic defaults to blind signing — transactions are signed automatically **without showing a popup to the user**. This is our UX killer feature. The user never sees "approve transaction" dialogs.

### Gotchas
- In Next.js App Router: use `'use client'` and guard instance from re-initialization.
- Google login requires Google Cloud client ID + server credentials.
- Test keys (`pk_test_`) work on `localhost`. Live keys (`pk_live_`) needed for production.
- React Native has a separate SDK.

---

## 4. Particle Network — Universal Accounts + EIP-7702

**Status:** ✅ Verified. MANDATORY for UA Track.
**Docs:** https://developers.particle.network/universal-accounts/overview
**SDK:** `@particle-network/universal-account-sdk@beta` (MUST be beta version)
**Dashboard:** https://dashboard.particle.network
**Setup time:** ~1 day for full integration.

### SDK install
```bash
npm i @particle-network/universal-account-sdk@beta
```
**CRITICAL:** The production version does NOT work. Must be `@beta`.

### Initialization (EIP-7702 mode)
```typescript
import { UniversalAccount, CHAIN_ID, UniversalAccountVersion } from '@particle-network/universal-account-sdk';

const ua = new UniversalAccount({
  projectId: PARTICLE_PROJECT_ID,
  clientKey: PARTICLE_CLIENT_KEY,
  appId: PARTICLE_APP_ID,
  ownerAddress: eoaAddress,  // from Magic wallet
  smartAccountOptions: {
    useEIP7702: true,          // MANDATORY
    universalAccountVersion: UniversalAccountVersion.V2,  // MANDATORY
  },
});

// Get unified balance
const assets = await ua.getPrimaryAssets();
// → { total: 55.00, breakdown: [{ ETH: { Base: 12, Arbitrum: 0.5 } }, { USDC: {...} }] }

// Convert cross-chain (e.g., multi-chain → USDC on Arbitrum)
const tx = await ua.createConvertTransaction({
  source: 'any',  // takes most efficient assets
  target: { token: 'USDC', chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, amount: 50 },
});

// Sign root hash + add 7702 authorizations
const auths = await ua.getEIP7702Auth([CHAIN_ID.ARBITRUM_MAINNET_ONE]);
// Sign each auth with Magic: magic.wallet.sign7702Authorization(...)
tx.addAuthorizations(auths);

// Send
const result = await ua.sendTransaction(tx);
```

### EIP-7702 delegation flow (with Magic)
1. User logs in with Magic → gets EOA
2. `ua.getEIP7702Auth([chainIds])` → returns authorization objects
3. `magic.wallet.sign7702Authorization(auth)` → Magic signs (blind, no popup)
4. Add signed auths to transaction → `sendTransaction()`
5. EOA is now upgraded to Universal Account on those chains
6. **First delegation requires gas on the specific chain** (subsequent ones don't)

### Remove delegation (recovery UX)
```typescript
// Sign authorization to zero address instead of UA contract
const removeAuth = { ...auth, contractAddress: '0x0000000000000000000000000000000000000000' };
```

### Important constraints
- **Mainnet ONLY.** No testnet. Test with small real funds ($5-10 USDC).
- Particle's own Auth/Connect wallets do NOT support 7702 sign yet. Use Magic/Dynamic/Privy.
- Solana supported natively (UA includes a Solana address).
- After delegation, EOA address == Universal Account address (same address, upgraded capabilities).

---

## 5. ZeroDev — Smart Routing Address (SRA)

**Status:** ⚠️ Verified API, but **no documented free tier** (~$500/mo production). Need hackathon credits from ZeroDev Discord, or pivot SRA feature to Particle deposit address. Bounty: ZeroDev subtrack 2 ($500). Only 1 known competitor (AVUS-RN).
**Docs:** https://docs.zerodev.app/onramp/smart-routing-address/quickstart
**SDK:** `@zerodev/smart-routing-address@0.2.5`
**Setup time:** ~1 day.

### What SRA does
An address that encodes a cross-chain intent. When someone sends funds to it (from any chain), an action executes automatically on a destination chain. Non-custodial.

### Create SRA
```typescript
import { createSmartRoutingAddress, createCall, FLEX } from '@zerodev/smart-routing-address';
import { erc20Abi } from 'viem';
import { base, arbitrum, mainnet, optimism } from 'viem/chains';

const owner = '0xUserAddress...';
const destChain = base;

const { smartRoutingAddress, estimatedFees } = await createSmartRoutingAddress({
  owner,                  // who can recover funds if action fails
  destChain,              // where actions execute
  srcTokens: [            // what tokens/chains the SRA accepts
    { tokenType: 'ERC20', chain: arbitrum },
    { tokenType: 'USDC', chain: optimism },
    { tokenType: 'NATIVE', chain: mainnet },
  ],
  actions: {
    'USDC': { action: [/* calls */], fallBack: [/* calls */] },
    'NATIVE': { action: [/* calls */], fallBack: [/* calls */] },
  },
  slippage: 5000,         // 1 = 0.01%, so 5000 = 50%
  config: { baseUrl: `${SMART_ROUTING_ADDRESS_SERVER_URL}/${ZERODEV_PROJECT_ID}` },
});
// → smartRoutingAddress is a deposit address. Display it with a QR code.
```

### Check status
```typescript
const status = await getSmartRoutingAddressStatus({ smartRoutingAddress });
// → { deposits: [{ deposit, bridge, execution }], totalCount, totalPages }
```

### Supported chains (mainnet ONLY)
Ethereum, Optimism, Arbitrum, Base, BSC, Polygon, HyperEVM, World Chain, Unichain, Linea, Mode, Scroll, Blast, Zora, Soneium, Monad, Tempo.

### Token types
`ERC20`, `NATIVE`, `USDC`, `USDT`, `WETH`, `WRAPPED_NATIVE`, `DAI`, `WBTC`.

---

## 6. ZeroDev — Session Keys (permissions)

**Status:** ⏸️ CUT from hackathon scope (2026-07-13). Complexity vs limited time. The "zero popup" narrative is covered by Magic blind signatures.
**Docs:** https://docs.zerodev.app/smart-accounts/permissions/intro
**SDK:** `@zerodev/permissions@5.6.3` (Kernel v3 — do NOT use old `@zerodev/session-key`)

### Create session key (agent pattern)
```typescript
import { toPermissionValidator } from '@zerodev/permissions';
import { toECDSASigner } from '@zerodev/permissions/signers';
import { toCallPolicy, toGasPolicy, toTimestampPolicy } from '@zerodev/permissions/policies';

// Agent generates key
const sessionPrivateKey = generatePrivateKey();
const sessionKeySigner = await toECDSASigner({ signer: privateKeyToAccount(sessionPrivateKey) });

// Owner approves with scoped policies
const callPolicy = toCallPolicy({
  permissions: [{
    target: contractAddress,
    valueLimit: BigInt(0),
    abi: contractABI,
    functionName: 'transfer',
    args: [{ condition: ParamCondition.EQUAL, value: recipientAddress }],
  }],
});

const gasPolicy = toGasPolicy({ allowed: parseEther('0.1') });
const timestampPolicy = toTimestampPolicy({ validUntil: 1735707599 });
```

### Use in React
Package: `@zerodev/waas` (v0.2.2). Hooks: `useCreateSession`, `useSendTransactionWithSession`.

---

## 7. Openfort (agent wallet + gas sponsorship)

**Status:** ✅ Verified. Bounty: Openfort subtrack 1 ($100).
**Docs:** https://docs.openfort.xyz (limited — also see GitHub `openfort-xyz/recipes-hub`)
**SDK:** `@openfort/openfort-node@0.10.8`
**Setup time:** ~0.5 day.

### Create backend wallet (for agent)
```typescript
import Openfort from '@openfort/openfort-node';
const openfort = new Openfort('sk_test_...',', { walletSecret: process.env.OPENFORT_WALLET_SECRET });

const account = await openfort.accounts.evm.backend.create();
// → { id: 'acc_...', address: '0x...' }
```

### Upgrade to Calibur (for gas sponsorship)
Backend wallets must be upgraded to "Delegated Account" (Calibur EIP-7702) per chain to use gas sponsorship.
```typescript
await openfort.accounts.evm.update(account.id, { implementationType: 'Calibur' });
```

### Gas sponsorship policy
```typescript
// 1. Create policy with criteria
const policy = await openfort.policies.create({
  scope: 'project',
  rules: [{
    action: 'accept',
    operation: 'sponsorEvmTransaction',
    criteria: [{ type: 'evmNetwork', operator: 'in', chainIds: [84532] }],
  }],
});

// 2. Create sponsorship linked to policy
const sponsorship = await openfort.feeSponsorship.create({
  name: 'Gas Sponsorship',
  strategy: { sponsorSchema: 'pay_for_user' },
  policyId: policy.id,
});
// sponsorship.id = 'pol_...' → use as FEE_SPONSORSHIP_ID
```

### x402 payments — ⚠️ DO NOT USE (confirmed bug)
A hackathon participant (Da Bright Shado) confirmed x402/EIP-3009 **reverts in UA 7702 mode**: the UA account has code (7702), so USDC's EIP-3009 `isValidSignature` check fails ("FiatTokenV2: invalid signature"). Particle DevRel was unsure if it works. **We use gas sponsorship policy only, NOT x402.**

### Important
- **Calibur EIP-7702 ≠ Particle EIP-7702.** Different implementations, NOT compatible on same wallet.
- **Architecture:** User = Particle UA (Magic sign). Agent = Openfort backend wallet (Calibur). They communicate via on-chain USDC transfers, not API.
- Test keys (`sk_test_`) and live keys (`sk_live_`) are isolated universes.

---

## Provider comparison matrix

| Provider | Category | Crypto-native? | Test mode | Setup | Chains |
|----------|----------|---------------|-----------|-------|--------|
| Bitrefill | Gift cards, top-up, eSIM, bill pay | ✅ USDC Arb/Base | ✅ test products (free) | 5 min | Global |
| ~~Reloadly~~ | ~~Top-up, eSIM, gift cards~~ | ❌ Fiat | ✅ sandbox | 30 min | +145 countries |
| Magic | Auth/wallet | ✅ | ✅ pk_test | 1-3h | EVM + Solana |
| Particle | Chain abstraction | ✅ | ❌ Mainnet only | 1 day | EVM + Solana |
| ZeroDev SRA | Cross-chain deposits | ✅ | ❌ Mainnet only ⚠️ no free tier | 1 day | 17+ EVM chains |
| ~~ZeroDev Permissions~~ | ~~Session keys~~ | ✅ | ✅ testnet OK | 1.5 days | EVM |
| Openfort | Agent wallet, gas (policy only) | ✅ | ✅ sk_test, 2k ops/mo free | 0.5 day | EVM + Solana |
| Gemini | LLM (intent parsing + chat) | N/A | ✅ 1,500 req/day free | 10 min | N/A |

> ~~Strikethrough~~ = cut from hackathon scope. See design spec for rationale.

---

## 8. Gemini (AI / LLM — agent intelligence layer)

**Status:** ✅ Verified. Agent intelligence layer.
**Docs:** https://ai.google.dev/gemini-api/docs/function-calling
**SDK:** `@google/genai`
**Setup time:** ~10 minutes.

### Configuration
```bash
# .env — admin supplies their own key
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
LLM_MODEL=gemini-2.0-flash   # 1,500 req/day free
```

### Free tier limits (2026-07)
| Model | Free tier | Notes |
|-------|-----------|-------|
| `gemini-2.0-flash` | **1,500 req/day, 10 RPM** | ✅ Primary — generous for demos |
| `gemini-2.5-flash-lite` | 1,000 RPD, 15 RPM | Alternative |
| `gemini-2.5-flash` | 20 RPD (was 250, cut 92%) | ❌ Unusable |
| `gemini-2.5-pro` | Free tier removed | ❌ Dead |

⚠️ Google changes limits without warning. Pin the model version. Fallbacks: Groq (Llama 3.3 70B free) → Cloudflare Workers AI (10k Neurons/day).

### Function calling contract
Gemini decides which action to take via function calling:
- `cash_out` → returns `CashOutIntent` (domain executor handles)
- `check_balance` → triggers balance read
- `search_products` → triggers product search
- `off_topic` → conversational response, no action

The LLM is a parser + conversational layer. It does NOT execute transactions (domain executor is deterministic). Regex is always the final fallback if the API fails.

---

## Future providers (post-hackathon, adapter-ready)

| Provider | Category | Notes |
|----------|----------|-------|
| MoonPay | Bank off-ramp | Widget SDK, sandbox self-service |
| Transak | Bank off-ramp | Strong in emerging markets |
| Ramp Network | Bank off-ramp | Good EU coverage |
| Lithic | Virtual card issuing | Sandbox card-issuing self-service |
| Coinbase Pay | Off-ramp (Base ecosystem) | Self-service |
| Bidali | Gift cards, bill pay | Requires partner registration |
| Airalo | eSIM | Partner API required |

Adding any of these = 1 new adapter file implementing `OffRampProvider`. Zero changes to domain/router/executor.
