# Real Balances Migration — Spec

**Date:** 2026-07-18  
**Status:** ✅ Complete — real ARB balance live  
**Deadline:** Jul 20, 2026, 1:59 PM GMT+2

---

## Goal

Show real on-chain balances in the Pouch demo. The wallet reads real ARB from Arbitrum mainnet via `PrivateKeyAccountProvider`, while keeping `DEMO_MODE=true` so the rest of the stack (off-ramp, DB) stays simulated.

This is **hybrid mode** — not full production. Production requires DATABASE_URL, JWT_SECRET, and all provider keys set.

---

## Current State

### Wallet
- **Address:** `0xA5fA06d58b0c90A9a3b53725E326BcCbB0BFe3DD`
- **Private Key:** in `.env` (not committed)
- **Arbitrum:** ✅ 119.48 ARB confirmed (~$10.51 at $0.088/ARB)
- **Base:** 0 ETH, 0 USDC (no funds)

### Config (.env)
- `DEMO_MODE=true` — KEPT (hybrid mode, not full production)
- `WEB3_PROVIDER_MODE=private-key` — reads real on-chain balances
- `PRIVATE_KEY` = wallet's private key
- `SUPPORTED_CHAINS=42161,8453` — Polygon (137) removed (no RPC)
- All other keys: Magic, Particle, Openfort, Gemini — already configured

### Code Changes Made
- ✅ `PrivateKeyAccountProvider` supports ARB and USDT tokens (in addition to ETH + USDC)
- ✅ ARB price updated to $0.088 (hardcoded — CoinGecko spot, 2026-07-18)
- ✅ `dotenv` installed in `@pouch/api` — explicit `.env` loading in `server.ts`
- ✅ `server.ts` uses dynamic `await import('./app')` so `.env` loads before runtime init
- ✅ `SUPPORTED_CHAINS` cleaned: 137 (Polygon) removed — no RPC, was causing `JsonRpcProvider` warning
- ✅ TypeScript compiles (8/8)

---

## How It Works (Hybrid Mode)

```
DEMO_MODE=true + PRIVATE_KEY set
  → createRuntimeAppServices detects the combo
  → builds PrivateKeyAccountProvider (real RPC calls to Arbitrum)
  → injects it into createDemoAppServices()
  → balance: real on-chain data
  → off-ramp: simulated (DemoProvider)
  → orders: in-memory (MemoryOrderRepository)
  → LLM: Gemini 3.5 Flash (when GEMINI_API_KEY is set)
  → security: active (DEFAULT_POLICY)
```

### Why NOT remove DEMO_MODE?
Removing `DEMO_MODE` triggers the **full production path**:
- Requires `DATABASE_URL` (Supabase) — configured but not essential for demo
- Requires `JWT_SECRET` — configured
- Requires all provider keys — Magic, Particle, Openfort, Bitrefill
- Bitrefill key is NOT set (too expensive for hackathon)
- Would crash on Vercel without all production env vars

The hybrid mode gives judges **real on-chain balances** without requiring a full production deployment.

---

## Verified Flow (2026-07-18)

```bash
# Balance endpoint — real ARB from Arbitrum mainnet
curl http://localhost:3001/balance?userId=demo-user
# → {"total":10.51, "assets":[{"symbol":"ARB","amount":119.4777,"chainId":42161,"usdValue":10.51}]}

# Chat — Gemini with real balance context
curl -X POST http://localhost:3001/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Show my balance","userId":"demo-user"}'
# → "You have $10.51 in ARB ready to spend. Would you like to cash it out?"

# Cash-out — confirmation flow
curl -X POST http://localhost:3001/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Cash out $5 to Amazon","userId":"demo-user"}'
# → "I can cash out $5.00 to an Amazon gift card — reply 'yes' to confirm!"
# → Security: ALLOW

curl -X POST http://localhost:3001/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"yes","userId":"demo-user"}'
# → "Success! Your $5.00 Amazon gift card is on its way!"
# → 5-step trace: balance → security → provider → order → payment
```

---

## Key Decisions

1. **Hybrid mode (DEMO_MODE=true + PRIVATE_KEY)** — Real balances, simulated off-ramp. Best trade-off for hackathon judging.
2. **No Bitrefill** — Too expensive. Simulated off-ramp with real on-chain balance reading.
3. **ARB token** — User chose ARB over USDC/USDT. Support added to `PrivateKeyAccountProvider`.
4. **Private key mode** — Simpler than Particle UA for balance reading. No Magic login needed.
5. **ARB price hardcoded ($0.088)** — Static, updated manually. Not a price feed. Fine for demo.
6. **consolidate()/sendPayment() simulated** — Returns mock tx hashes. Real settlement would use Openfort.

---

## Wallet Summary

| Wallet | Address | Chain | Balance | Status |
|--------|---------|-------|---------|--------|
| Principal | `0xA5fA06...` | Arbitrum | 119.48 ARB (~$10.51) | ✅ Live |
| Principal | `0xA5fA06...` | Base | 0 ETH, 0 USDC | Empty |

---

## Known Limitations

- **ARB price hardcoded** — `private-key-provider.ts` line 20. Update manually before demo.
- **consolidate()/sendPayment() are simulated** — The `PrivateKeyAccountProvider` returns mock tx hashes. Real settlement would need Openfort agent wallet + on-chain tx.
- **Single chain** — Only Arbitrum has funds. Base has 0 balance. The demo shows multi-chain consolidation when multiple chains have assets.
- **No DB persistence** — Orders go to memory. Lost on restart.
- **dotenv required for local dev** — `tsx` doesn't auto-load `.env`. `server.ts` loads it explicitly.

---

## Files Modified

- `packages/infra-web3/src/private-key/private-key-provider.ts` — ARB price: 0.35→0.088, ARB+USDT token support
- `apps/api/src/server.ts` — dotenv loading + dynamic import of app.ts
- `apps/api/package.json` — Added `dotenv` dependency
- `.env` — SUPPORTED_CHAINS: removed 137 (Polygon), PRIVATE_KEY updated
- `docs/HANDOFF.md` — Updated snapshot
- `docs/superpowers/specs/2026-07-18-real-mode-migration.md` — This file