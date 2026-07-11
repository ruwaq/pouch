# Handoff — Current Snapshot

Last updated: 2026-07-12

## Verified state

The workspace currently passes:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Implemented backend surface

- `POST /agent/chat`
- `GET /balance`
- `GET /orders/:id`
- `POST /webhooks/bitrefill`

## What is real vs demo

### Real / production-shaped

- Monorepo + package boundaries
- Domain router / executor / typed errors / intent parser
- Bitrefill adapter with:
  - quote pricing from catalog data
  - canonical `package_id`
  - canonical invoice verification on webhook
  - redemption fetch through `GET /orders/{id}`
- Drizzle-backed repository contracts:
  - order repository
  - webhook event store
- Runtime bootstrap with env-driven provider loading and fail-fast behavior

### Demo / temporary

- `infra-web3` currently uses `WEB3_PROVIDER_MODE=demo`
- No real Particle UA, Magic auth, JWT middleware, or real transfer execution yet
- Frontend is still a scaffold landing page, not a connected chat UI

## Key files to continue from

### Runtime composition

- `apps/api/src/bootstrap/create-runtime-app-services.ts`
- `apps/api/src/app.ts`

### API routes

- `apps/api/src/routes/agent.ts`
- `apps/api/src/routes/balance.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/webhooks/bitrefill.ts`

### Services

- `apps/api/src/services/agent-chat-service.ts`
- `apps/api/src/services/balance-service.ts`
- `apps/api/src/services/order-service.ts`
- `apps/api/src/services/bitrefill-webhook-service.ts`

### Infra

- `packages/infra-offramp/src/bitrefill/*`
- `packages/infra-db/src/repositories/*`
- `packages/infra-web3/src/factory.ts`
- `packages/infra-web3/src/demo-account-provider.ts`

## Recommended next section

The highest-value continuation point is:

1. Implement real `particle` account provider wiring in `packages/infra-web3`
2. Add auth/JWT foundation in `apps/api`
3. Replace demo runtime path for `/agent/chat` and `/balance`
4. Connect frontend chat + balance + order polling to the API

## Suggested next tasks

### Phase 2 completion

- `infra-web3/particle/universal-account.ts`
- `infra-web3/chains.ts`
- `api/routes/auth.ts`
- `api/middleware/auth.ts`

### Then Phase 3 polish

- real end-to-end balance/consolidation/payment path
- persist redemption fields from Bitrefill in a real DB migration
- frontend chat window + balance card + order status UI

## Notes for the next session

- The backend already exposes the right shapes for a demo UI.
- Webhook delivery now persists `redemption.code` / `redemption.link` when available.
- If you move from demo to real web3, do it through `createAccountProvider(config)` instead of adding logic directly in `apps/api`.
- The repo has no historical commits before this point, so this handoff should be treated as the initial implementation baseline.
