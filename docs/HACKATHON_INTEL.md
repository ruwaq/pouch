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

### Tier A — Strong competitors (beware)

| Project | Category | What they do | Threat level |
|---------|----------|-------------|-------------|
| **OneLink Pay** | Payments + AI/x402 | Spend policy firewall for UA: EIP-12 mandates with caps + merchant + revoke. Cross-chain USDC Base→Arbitrum. ~100 commits, contracts verified on Arbiscan. | 🔴 High |
| **FirmPay** | Checkout | Quote-locked checkout (price can't move against buyer). Research paper with A/B test N=1500 (+17.7% conversion). | 🔴 High |
| **Selip** | Gift by link | "Slip someone a gift" — send crypto gift via link. 64 commits, 6 weeks, ZeroDev session keys. | 🟡 Medium |
| **Beam** (Discord) | Send money by link | MVP complete on mainnet, Google login, Arbitrum settlement. No public repo. | 🟡 Medium |

### Tier B — Medium competitors

| Project | Category | Notes |
|---------|----------|-------|
| **Conviction** | Social trading + AI | Chain-abstracted social trading + AI concierge. MCP server. |
| **Universal Pay** | Payments (Venmo-style) | Pay/split/request + Aave yield. |
| **Dogi** | Creator payments | Buy-me-a-coffee cross-chain + payment links. |

### Tier C — Low threat (incomplete)

Tab, AuraPay, CampusPots, Wisp (specs without builds)

---

## Saturated categories (AVOID direct competition)

1. **Payments / checkout consumer** — 9 of 10 projects. Default mental model.
2. **Payments by link / gift** — Selip + Dogi + Beam overlap.
3. **AI agents + x402 with spend caps** — OneLink already nailed it.
4. **The canonical template pattern** (Email OTP → Magic → 7702 → convert USDC Arbitrum) — everyone repeats it.

## Empty categories (OUR OPPORTUNITY)

- **Off-ramp / cash-out** — ZERO projects. The #1 crypto friction, completely unaddressed.
- **Multi-provider routing** — Nobody aggregates providers (Bitrefill, Reloadly, etc.).
- **Conversational AI agent for finance** — Conviction does trading; nobody does cash-out.
- **Cross-chain consolidation for spending** — Nobody combines UA + real-world utility.

**Pouch's wedge:** We're the ONLY project combining AI agent + chain abstraction + multi-provider off-ramp. No direct competitor.

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

1. **Unique category:** Off-ramp is unaddressed by all 10+ competitors. We're the only "cash out" product.
2. **Multi-provider = real scalability:** Provider adapter pattern means "today 4, tomorrow 40" — judges love this for adoption potential.
3. **7702 is intrinsic:** Cross-chain consolidation REQUIRES EIP-7702. It's not bolted on; it's fundamental to the flow.
4. **UX is genuinely invisible:** Blind signatures + chat interface = the user never sees a wallet, gas, chain, or signature popup.
5. **Real-world utility:** Gift cards, top-ups, eSIM = things non-crypto users understand immediately.

### Bounty coverage matrix

| Bounty | How we cover it | Competition | Win likelihood |
|--------|----------------|-------------|----------------|
| UA Track ($2.5k) | Cross-chain consolidation + chat UX | High (OneLink, FirmPay) | 🟡 Compete for 2nd/3rd |
| Arbitrum ($2k) | Settlement on Arbitrum + chain abstracted | Medium | 🟡 Medium |
| Magic ($500) | Blind signatures = best onboarding | Low | 🟢 High |
| ZeroDev SRA ($500) | `createSmartRoutingAddress()` implemented | **ZERO** | 🟢🟢 Very high |
| Openfort ($100) | Agent wallet + gas sponsorship | **ZERO** | 🟢🟢 Very high |

**Realistic outcome:** $1,100-$4,600+ depending on how the main track judging goes, plus potential incubation.

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
