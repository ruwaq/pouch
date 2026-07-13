# Hackathon Intel — UXmaxx Hackathon

> Competitive intelligence gathered from GitHub research, Discord monitoring, and workshop transcripts.
> Any agent building features should read this to understand what we're up against and where we differentiate.

---

## Hackathon overview

- **Name:** UXmaxx Hackathon — "Pushing Crypto Towards Its Current Potential"
- **Organizer:** Encode Club + Particle Network (7702 Collective)
- **Partners:** Particle Network, Arbitrum, Magic Labs, ZeroDev, Openfort
- **Format:** 100% online, 6 weeks (started Jun 22, 2026)
- **Deadline:** Mon, Jul 20, 2026, 1:59 PM GMT+2 (Final Submissions)
- **Finale:** Jul 30, 2026 (top teams pitch live)

### Total prize pool: $15,500

---

## Bounties & judging criteria

### Universal Accounts Track (main)
- **Prizes:** 1st $2,500 / 2nd $2,000 / 3rd $1,500
- **Requirement:** Must use Universal Accounts SDK in EIP-7702 mode + at least one cross-chain operation
- **Judging:** UX excellence (40%), UA/7702 use (30%), adoption potential (20%), technical quality (10%)
- **Bonus:** Winners may be considered for Particle Network incubation

### General Track (main)
- **Prizes:** 1st $2,000 / 2nd $1,200 / 3rd $800
- **Requirement:** Web3 app with exceptional UX in any domain
- Must choose subtrack: ZeroDev ($500) OR Openfort ($100)

### Arbitrum bounty (independent)
- **Prize:** $2,000 (single winner)
- **Requirement:** Consumer app running primarily on Arbitrum, using chain-abstracted UX patterns
- **Judging:** UX excellence (30%), creativity (30%), adoption potential (20%), execution quality (20%)

### Magic Labs bonus (independent)
- **Prize:** $500 (single winner)
- **Focus:** Best user onboarding and wallet experience using Magic's embedded wallet
- **Judging:** Smooth onboarding, creative use of Magic, UX polish, consumer-ready thinking, technical quality

### ZeroDev subtrack 2 — Smart Routing Address
- **Prize:** $500
- **Focus:** Use ZeroDev SRA (`createSmartRoutingAddress`)

### Openfort subtrack 1
- **Prize:** $100
- **Focus:** Integrate Openfort SDK (embedded wallet, agent wallets, gas sponsorship)

---

## Competitive landscape (from GitHub + Discord research)

> Updated 2026-07-13 with deep research: **23 active projects** identified across
> GitHub repos created Jun-Jul 2026, Twitter demos, and Discord showcases.

### Saturated categories (AVOID — 3+ strong teams)

| Category | Teams | Top competitors |
|----------|-------|-----------------|
| **P2P / social payments** | 6+ | Beam, Universal Pay, mink, PayGram, SagePay, Dogi |
| **Merchant checkout** | 5+ | TapPay, Morva, FirmPay, Chainless Checkout, Dogi |
| **AI payments ("type to pay")** | 4 | Relay, IntentOS, SagePay, Tab |
| **AI agents (general)** | 5+ | Relay, IntentOS, wisp, OneShot, AVUS, Tab |

### Moderate categories (2-3 teams)
- Subscriptions / recurring: 2 (Recurra, Settle)
- Trading / prediction: 1 (OneShot)
- Gaming: 1 (Enigma of Alchemist)
- Content / streaming: 1 (Arbor)

### Empty categories (OUR OPPORTUNITY — 0-1 teams)

| Category | Teams | Why it's open |
|----------|-------|---------------|
| **Off-ramp / cash-out to real value** | **0** | Nobody converts crypto to gift cards/top-ups |
| **Remittances** | 0 | Nobody framing it as cross-border |
| **Loyalty / rewards** | 0 | Listed in hackathon brief, nobody building |
| **Identity / credentials** | 0 | Nothing |
| **Event ticketing** | 0 | Nothing |
| **Payroll / streaming salary** | 0 | Nothing |

### Bounty-specific competition

| Bounty | Competitors targeting it | Crowded? |
|--------|------------------------|----------|
| UA Track ($1.5-2.5k) | ~15 of 23 | 🔴 VERY |
| Arbitrum ($2k) | ~12 | 🔴 VERY |
| Magic Labs ($500) | ~10 | 🔴 Crowded |
| **ZeroDev SRA ($500)** | **1 (AVUS-RN)** | 🟢 **WIDE OPEN** |
| **Openfort ($100)** | **1 (Recurra)** | 🟢 **WIDE OPEN** |

### Notable competitors (from GitHub research)

| Project | Category | Stack | Polish |
|---------|----------|-------|--------|
| **Beam** (pankaj) | P2P payments by link | Magic+UA+Arbitrum | ✅ Polished, mainnet |
| **Relay** (Chibey-max) | NL payment agent | UA+Arbitrum | ✅ Live, verified contract |
| **TapPay** (scriptLin) | Merchant tap-to-pay | UA+Magic+Arbitrum | ✅ Working demo |
| **Morva** (JamesVictor) | Merchant checkout SDK | UA+Arbitrum | ✅ Live demo |
| **IntentOS** (Mani) | AI intent execution | UA+Arbitrum+Magic+Gemini | ✅ Live demo |
| **mink** (samuel) | Social payments by handle | UA+Magic+Arbitrum | ✅ Audited contract |
| **Recurra** (Rcurra) | Subscriptions | UA+Openfort+Arbitrum | ✅ Detailed README |

**Key insight:** None of these do off-ramp/cash-out. Pouch is the only project in its niche.

---

## Technical patterns everyone repeats (don't just copy)

1. Next.js 15 App Router + TypeScript + Tailwind
2. Magic email/Google OTP → EOA → `UniversalAccount({useEIP7702:true})` → `sign7702Authorization()` → `send7702Transaction()`
3. Settlement on Arbitrum One (chainId 42161), USDC native as output token
4. Cross-chain demo: Base → Arbitrum (most common pair)
5. Env vars: `NEXT_PUBLIC_PARTICLE_PROJECT_ID/CLIENT_KEY/APP_ID` + `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY`
6. EIP-712 for mandates/quotes (the "serious" trick to stand out)
7. Vercel deploy for live demo URL

**Our differentiator:** Provider adapter pattern + multi-provider smart routing + conversational AI + real off-ramp to gift cards. Nobody else has this combination.

---

## Key learnings from workshop transcripts

### Particle Network (Davide Zambiasi, Head of DevRel)
- **EIP-7702 mode is mandatory** for UA Track evaluation
- **Mainnet only** — UA infrastructure too complex for testnets. Test with small real funds.
- **Magic, Dynamic, Privy** support 7702 sign. Particle Auth/Connect do NOT yet.
- SDK: `npm i @particle-network/universal-account-sdk@beta` + `useEIP7702:true` + `universalAccountVersion: V2`
- **Blind signatures** (Magic) = zero popups = best UX improvement available
- Can remove 7702 delegation by signing to zero address

### Magic Labs
- Embedded wallets: email OTP, social login (Google, Apple), Farcaster
- Blind signatures available (auto-sign without popup) — our UX killer feature
- Works with React/Next.js: `magic-sdk` + `@magic-ext/evm`
- ~1-3 hours to integrate email OTP

### ZeroDev (Kunal, Offchain Labs)
- **SRA = Smart Routing Address**: one deposit address that encodes a cross-chain intent
- `createSmartRoutingAddress({owner, destChain, srcTokens, actions, slippage})`
- SRA is **mainnet only** (like Particle UA)
- Session keys (Kernel v3): `@zerodev/permissions` — scope by contract, amount, time
- Gas sponsorship: configure in dashboard, works on testnet (unlike SRA)

### Openfort (Joan, co-founder)
- **Explicitly asked for AI agent projects** — gave 4 concrete ideas
- Backend/agent wallets: `openfort.accounts.evm.backend.create()` — server-side, gasless
- x402 payments: pay-per-request via HTTP 402, EIP-3009 TransferWithAuthorization
- Gas sponsorship: 3-layer model (Policy → Sponsorship → Transaction)
- Calibur EIP-7702 (Openfort's own, different from Particle's — NOT compatible)
- Recipes available: `recipes-hub` (x402, agent-permissions, usdc, morpho, aave, lifi)

### Arbitrum
- "Build a consumer app where Arbitrum powers the experience behind the scenes"
- Use chain-abstracted UX: embedded wallets, social login, gas abstraction, invisible bridging
- "The best projects will feel less like crypto apps and more like normal consumer products"
- Strong submissions can apply for Founder House London (incubation)

---

## Our winning strategy

### What makes Pouch win where others don't:

1. **Unique category:** Off-ramp is unaddressed by all 23 competitors. We're the only "cash out" product.
2. **Chain abstraction on the INPUT:** Our differentiator vs global incumbents (Bitrefill, Coinbase AgentKit, Cryptorefills x402). Nobody lets you pay with ANY token on ANY chain — they're all single-chain USDC.
3. **7702 is intrinsic:** Cross-chain consolidation REQUIRES EIP-7702. It's not bolted on; it's fundamental to the flow.
4. **"Agent scratchpad" transparency:** The inline trace shows the agent's reasoning in real time — the "show your work" pattern. No competitor does this. x402 is invisible; we make the work visible.
5. **UX is genuinely invisible:** Blind signatures + chat = user never sees wallet, gas, chain, or popup.
6. **Real-world utility:** Gift cards, top-ups, eSIM = things non-crypto users understand immediately. $1.4T gift card market.

### Bounty coverage matrix

| Bounty | How we cover it | Competition | Win likelihood |
|--------|----------------|-------------|----------------|
| UA Track ($1.5-2.5k) | Cross-chain consolidation + chat UX | High (~15 teams) | 🟡 Compete for 2nd/3rd |
| Arbitrum ($2k) | Settlement on Arbitrum + chain abstracted | High (~12 teams) | 🟡 Medium |
| Magic ($500) | Blind signatures = best onboarding | Medium (~10 teams) | 🟢 Good |
| ZeroDev SRA ($500) | `createSmartRoutingAddress()` deposit page | Very low (1 team) | 🟢🟢 Very high ⚠️ pricing risk |
| Openfort ($100) | Agent wallet + gas sponsorship (policy) | Very low (1 team) | 🟢🟢 Very high |

### UX differentiation (research-confirmed white space)

| Capability | Bitrefill | Cryptorefills x402 | Coinbase AgentKit | **Pouch** |
|---|---|---|---|---|
| Consumer chat UX | No | No (M2M) | Partial | **Yes** |
| Gift-card catalog | Yes | Yes | No | **Yes** |
| Any token / any chain | No | No (USDC/Base) | No | **Yes (UA)** |
| Shows agent reasoning | No | No (invisible) | Partial | **Yes (scratchpad)** |
| Zero popup signing | No (handoff) | No | Confirmation step | **Yes (Magic)** |

**Realistic outcome:** $1,100-$5,600+ depending on UA Track placement, plus potential incubation.

---

## Research sources

- Hackathon page: https://www.encodeclub.com/programmes/uxmaxx-hackathon
- Particle blog: https://blog.particle.network/join-the-uxmaxx-hackathon-15-5k-for-grabs-100-online/
- UniversalX case study: https://blog.particle.network/universalx-2/
- Particle docs: https://developers.particle.network/universal-accounts/overview
- Magic docs: https://magic.link/docs
- ZeroDev docs: https://docs.zerodev.app/
- Openfort docs: https://docs.openfort.xyz/
- Workshop demos: https://github.com/Particle-Network/ua-7702-magic-demo
- Competitor repos researched via GitHub `gh` API (OneLink, FirmPay, Selip, Conviction, etc.)
