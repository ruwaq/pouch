# Architecture — Pouch

> Full technical design. Any agent implementing features MUST read this first.

---

## Design philosophy

**Hexagonal architecture (ports & adapters) applied pragmatically:**

```
                    ┌─────────────────────────┐
                    │   apps/web (Next.js)    │
                    │   apps/api (Hono)       │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   packages/domain       │  ← pure logic, zero deps on SDKs/React/fetch
                    │   (ports defined here)  │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼──────────┐ ┌────────▼─────────┐ ┌──────────▼──────────┐
│ infra-offramp      │ │ infra-web3       │ │ infra-db            │
│ (Bitrefill)        │ │ (Particle, Magic,│ │ (Drizzle, Postgres) │
│  adapters          │ │  Openfort, ZD)   │ │ repositories        │
└────────────────────┘ │ adapters         │ └─────────────────────┘
                       └──────────────────┘
┌──────────────────────────────────────────┐
│ infra-ai (LLM adapters: Gemini)          │
│ Implements IntentParserStrategy from     │
│ domain. Regex fallback always available. │
└──────────────────────────────────────────┘
```

The domain defines **interfaces** (ports). The infra packages implement those interfaces (adapters). The apps wire everything together via dependency injection.

**Why this matters:** If we swap Bitrefill for MoonPay tomorrow, or Particle for another AA provider, the domain logic doesn't change. We write a new adapter and register it.

---

## Domain layer (`packages/domain`)

### Core types

```typescript
// packages/domain/src/types.ts

// ── Off-ramp categories ──
type OffRampCategory = 'giftcard' | 'topup' | 'esim' | 'billpay' | 'bank' | 'card';

// ── Provider interface (the port every off-ramp adapter implements) ──
interface OffRampProvider {
  readonly id: ProviderId;                    // 'bitrefill' | 'reloadly' | 'moonpay' | ...
  readonly name: string;
  readonly categories: OffRampCategory[];

  searchProducts(query: string, opts?: SearchOpts): Promise<Result<Product[]>>;
  getQuote(product: Product, amount: Amount): Promise<Result<Quote>>;
  createOrder(req: OrderRequest): Promise<Result<Order>>;
  getOrderStatus(orderId: string): Promise<Result<OrderStatus>>;
  verifyWebhook(payload: unknown, headers: Record<string, string>): Promise<Result<WebhookEvent>>;
}

// ── Value objects ──
interface Amount {
  value: number;        // in USD
  currency: 'USD';      // extensible later
}

interface Product {
  id: string;           // provider-specific product ID
  providerId: ProviderId;
  name: string;
  category: OffRampCategory;
  brand?: string;
  image?: string;
  denominations?: number[];   // fixed packages
  range?: { min: number; max: number; step?: number };  // flexible amount
}

interface Quote {
  providerId: ProviderId;
  productId: string;
  faceValue: Amount;         // what user receives
  paymentAmount: Amount;     // what user pays (may include fees)
  fee?: Amount;
  estimatedDelivery: string; // 'instant' | '1-5min' | '24h'
}

interface Order {
  id: string;                // internal order ID
  providerOrderId?: string;  // provider's order ID
  providerId: ProviderId;
  product: Product;
  faceValue: Amount;
  payment: {
    address?: string;        // where to send crypto
    amount: Amount;
    chainId: number;
    token: string;           // 'USDC'
    txHash?: string;
  };
  status: OrderStatus;
  redemption?: {             // final delivery (gift card code, etc.)
    code?: string;
    link?: string;
    instructions?: string;
  };
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

type OrderStatus = 'pending' | 'payment_pending' | 'paid' | 'delivered' | 'failed' | 'refunded';

// ── Intent (parsed from user's natural language) ──
interface CashOutIntent {
  action: 'cash_out';
  category: OffRampCategory;
  brand?: string;            // 'amazon', 'netflix', ...
  amount: Amount;
  recipient?: {              // for gifts
    name?: string;
    email?: string;
  };
}
```

### Router

```typescript
// packages/domain/src/router.ts

interface RoutingStrategy {
  select(quotes: Quote[], intent: CashOutIntent): Quote;
}

class OffRampRouter {
  constructor(
    private providers: OffRampProvider[],
    private strategy: RoutingStrategy,
  ) {}

  async findBestOption(intent: CashOutIntent): Promise<Result<RoutingDecision>> {
    // 1. Filter providers that support the requested category
    const candidates = this.providers.filter(p => p.categories.includes(intent.category));
    if (candidates.length === 0) {
      return err({ type: 'NO_PROVIDER_AVAILABLE', category: intent.category });
    }

    // 2. Query all candidates in parallel (Promise.allSettled = resilient)
    const results = await Promise.allSettled(
      candidates.map(async p => {
        const products = await p.searchProducts(intent.brand ?? '');
        const product = this.pickBestProduct(products, intent);
        return p.getQuote(product, intent.amount);
      })
    );

    // 3. Collect successful quotes, ignore failures (log them)
    const quotes = results
      .filter(r => r.status === 'fulfilled' && r.value.ok)
      .map(r => (r as PromiseFulfilledResult<Result<Quote>>).value.value);

    if (quotes.length === 0) {
      return err({ type: 'ALL_PROVIDERS_FAILED' });
    }

    // 4. Strategy selects the best
    return ok({ quote: this.strategy.select(quotes, intent) });
  }
}

// Default: cheapest payment amount
class CheapestStrategy implements RoutingStrategy {
  select(quotes: Quote[], intent: CashOutIntent): Quote {
    return quotes.sort((a, b) => a.paymentAmount.value - b.paymentAmount.value)[0];
  }
}
```

### Executor

```typescript
// packages/domain/src/executor.ts

// Ports the executor needs (implemented by infra layer)
interface AccountProvider {
  getUnifiedBalance(userId: UserId): Promise<Result<Balance>>;
  consolidate(userId: UserId, targetChainId: number, targetToken: string): Promise<Result<TxResult>>;
  sendPayment(params: SendPaymentParams): Promise<Result<TxResult>>;
}

interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus, updates?: Partial<Order>): Promise<void>;
}

class CashOutExecutor {
  constructor(
    private router: OffRampRouter,
    private account: AccountProvider,
    private orders: OrderRepository,
    private logger: Logger,
  ) {}

  async execute(intent: CashOutIntent, userId: UserId): Promise<Result<CashOutResult>> {
    // 1. Check funds
    const balance = await this.account.getUnifiedBalance(userId);
    if (!balance.ok) return balance;
    if (balance.value.total < intent.amount.value) {
      return err({ type: 'INSUFFICIENT_FUNDS', available: balance.value.total, required: intent.amount.value });
    }

    // 2. Find best provider
    const routing = await this.router.findBestOption(intent);
    if (!routing.ok) return routing;

    // 3. Create order with provider
    const provider = this.findProvider(routing.value.quote.providerId);
    const order = await provider.createOrder({
      productId: routing.value.quote.productId,
      amount: intent.amount,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!order.ok) return order;

    // 4. Persist order BEFORE paying (so we can recover if payment times out)
    await this.orders.save(order.value);

    // 5. Consolidate multi-chain balance if needed
    if (balance.value.requiresConsolidation) {
      const consolidation = await this.account.consolidate(userId, order.value.payment.chainId, 'USDC');
      if (!consolidation.ok) {
        this.logger.error({ orderId: order.value.id }, 'consolidation failed');
        await this.orders.updateStatus(order.value.id, 'failed');
        return consolidation;
      }
    }

    // 6. Pay
    const payment = await this.account.sendPayment({
      from: userId,
      to: order.value.payment.address!,
      amount: order.value.payment.amount,
      chainId: order.value.payment.chainId,
      token: order.value.payment.token,
    });
    if (!payment.ok) {
      await this.orders.updateStatus(order.value.id, 'failed');
      return payment;
    }

    // 7. Update order with tx hash, status = payment_pending
    await this.orders.updateStatus(order.value.id, 'payment_pending', { paymentTxHash: payment.value.txHash });

    // 8. Delivery happens async via webhook
    return ok({ orderId: order.value.id, status: 'payment_pending' });
  }
}
```

---

## Infra layer: adapter contracts

### LLM adapter (agent intelligence)

The domain defines `IntentParserStrategy`. The `infra-ai` package implements it with Gemini.

```typescript
// packages/infra-ai/src/llm-provider.ts (interface)
interface LLMProvider {
  parseIntent(message: string): Promise<Result<CashOutIntent | { action: 'off_topic' }, DomainError>>;
  buildResponse(executionResult: CashOutResult): Promise<string>;
}

// packages/infra-ai/src/gemini-provider.ts (implementation)
class GeminiProvider implements LLMProvider {
  // Uses @google/genai with function calling:
  // - declares cash_out, check_balance, search_products functions
  // - Gemini decides which to call based on user message
  // - returns structured intent OR off_topic
}
```

**Fallback chain:** `LLM_PROVIDER` configured → Gemini → (on API failure) → Regex IntentParser → (always works). The demo never breaks because of the LLM.

**Configuration:** Admin supplies their own API key + model via env (`LLM_PROVIDER`, `GEMINI_API_KEY`, `LLM_MODEL`). Free tier: `gemini-2.0-flash` = 1,500 req/day.

### Auth flow (Magic DID → JWT)

```
1. Frontend: Magic login → DID token
2. POST /auth/callback { didToken }
3. API: magic.token.validate(didToken) → extract wallet address + email
4. API: upsert user in DB (users: magic_public_key, evm_address, email)
5. API: issue JWT (jose, signed with JWT_SECRET) → httpOnly cookie
6. Subsequent: auth middleware reads cookie → ctx.userId
7. /orders/:id filters by userId (ownership check)
```

### Off-ramp adapter (example: Bitrefill)

```typescript
// packages/infra-offramp/src/bitrefill/adapter.ts
class BitrefillAdapter implements OffRampProvider {
  readonly id = 'bitrefill' as const;
  readonly name = 'Bitrefill';
  readonly categories = ['giftcard', 'topup', 'esim', 'billpay'] as const;

  constructor(private client: BitrefillClient, private mapper: BitrefillMapper) {}

  async searchProducts(query: string): Promise<Result<Product[]>> {
    // call client, map DTO → domain Product, handle errors
  }

  async createOrder(req: OrderRequest): Promise<Result<Order>> {
    // POST /invoices, map response → domain Order
  }

  async verifyWebhook(payload: unknown, headers): Promise<Result<WebhookEvent>> {
    // verify signature (if available), check idempotency
  }
}
```

### Provider registry (dynamic, env-driven)

```typescript
// packages/infra-offramp/src/index.ts
function buildOffRampProviders(config: Config): OffRampProvider[] {
  const providers: OffRampProvider[] = [];

  if (config.OFFRAMP_PROVIDERS.includes('bitrefill') && config.BITREFILL_API_KEY) {
    providers.push(new BitrefillAdapter(
      new BitrefillClient(config.BITREFILL_API_KEY, config.BITREFILL_BASE_URL),
      new BitrefillMapper(),
    ));
  }
  if (config.OFFRAMP_PROVIDERS.includes('reloadly') && config.RELOADLY_CLIENT_ID) {
    providers.push(new ReloadlyAdapter(/* ... */));
  }

  if (providers.length === 0) {
    throw new Error('No off-ramp providers configured. Check OFFRAMP_PROVIDERS env var.');
  }
  return providers;
}
```

### Web3 adapter (example: Particle UA)

```typescript
// packages/infra-web3/src/particle/universal-account.ts
class ParticleAccountProvider implements AccountProvider {
  async getUnifiedBalance(userId: UserId): Promise<Result<Balance>> {
    // init UniversalAccount with useEIP7702: true
    // call getPrimaryAssets()
    // map → domain Balance
  }

  async consolidate(userId, targetChainId, token): Promise<Result<TxResult>> {
    // createConvertTransaction() → user's assets across chains → target chain USDC
  }
}
```

---

## Data flow: complete cash-out

```
User types: "Cash out $50 to Amazon"
       │
       ▼
[1] API: POST /agent/chat { message }
       │
       ▼
[2] IntentParser.parse("Cash out $50 to Amazon")
    → { action:'cash_out', category:'giftcard', brand:'amazon', amount:{value:50,currency:'USD'} }
       │
       ▼
[3] Executor.execute(intent, userId)
       │
       ├─[3a] AccountProvider.getUnifiedBalance(userId)
       │      → Particle UA getPrimaryAssets()
       │      → { total: 55.00, chains: [Base:12, Arbitrum:25, Solana:18] }
       │
       ├─[3b] Router.findBestOption(intent)
       │      ├─ BitrefillAdapter.getQuote() → $50.00
       │      └─ ReloadlyAdapter.getQuote()  → $50.50
       │      → Best: Bitrefill $50.00
       │
       ├─[3c] BitrefillAdapter.createOrder()
       │      → POST /invoices { product_id:'amazon-us', payment_method:'usdc_arbitrum' }
       │      → { payment: { address:'0x...', price:50.00, chainId:42161 } }
       │
       ├─[3d] OrderRepository.save(order) ← PERSIST BEFORE PAYING
       │
       ├─[3e] AccountProvider.consolidate(userId, 42161, 'USDC')
       │      → Particle UA createConvertTransaction()
       │      → multi-chain assets → USDC on Arbitrum
       │
       ├─[3f] AccountProvider.sendPayment({ to: payment.address, amount: 50, chainId: 42161 })
       │      → ERC-20 transfer USDC
       │
       └─[3g] OrderRepository.updateStatus(orderId, 'payment_pending', { txHash })
       │
       ▼
[4] API returns { orderId, status: 'payment_pending' }
       │
       ▼ (async, 1-5 min later)
[5] Bitrefill webhook → POST /api/webhooks/bitrefill
       │
       ▼
[6] BitrefillAdapter.verifyWebhook(payload)
    → idempotency check (event ID in webhook_events table)
    → order status: 'delivered'
    → GET /orders/{id} → redemption_info.code = 'AMZN-XXXX-XXXX'
       │
       ▼
[7] OrderRepository.updateStatus(orderId, 'delivered', { redemptionCode })
       │
       ▼
[8] User sees in chat: "✅ Amazon gift card: [AMZN-XXXX-XXXX]"
```

---

## Database schema

See `packages/infra-db/src/schema.ts` for the full Drizzle schema. Key tables:

- **users** — id, magic_public_key, evm_address, email, created_at
- **orders** — id, user_id, provider_id, provider_order_id, category, product (jsonb), amount_usd, payment_address, payment_chain_id, payment_tx_hash, status, redemption_code, idempotency_key, timestamps
- **balance_snapshots** — cached unified balances (refreshed periodically)
- **agent_rules** — recurring cash-out rules (post-hackathon)
- **webhook_events** — id, provider_id, event_id (UNIQUE for idempotency), payload, processed_at

---

## Config & env validation

```typescript
// packages/shared/src/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  APP_URL: z.string().url(),

  SETTLEMENT_CHAIN_ID: z.coerce.number(),
  SUPPORTED_CHAINS: z.string().transform(s => s.split(',').map(Number)),

  OFFRAMP_PROVIDERS: z.string().transform(s => s.split(',')),
  BITREFILL_API_KEY: z.string().optional(),
  RELOADLY_CLIENT_ID: z.string().optional(),
  RELOADLY_CLIENT_SECRET: z.string().optional(),

  MAGIC_PUBLISHABLE_KEY: z.string(),
  PARTICLE_PROJECT_ID: z.string(),
  PARTICLE_CLIENT_KEY: z.string(),
  PARTICLE_APP_ID: z.string(),
  OPENFORT_SECRET_KEY: z.string().optional(),
  ZERODEV_PROJECT_ID: z.string().optional(),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(32),
});

// Fail-fast: if a required env is missing, the app crashes on boot with a clear message.
export const config = ConfigSchema.parse(process.env);
```

---

## Testing strategy

| Layer | What we test | How |
|-------|-------------|-----|
| **domain** | Router logic, executor flow, intent parsing | Vitest + MockProvider (implements OffRampProvider) |
| **infra-offramp** | Adapter mappers, error handling | Vitest + recorded API responses |
| **infra-web3** | UA delegation, balance mapping | Vitest + small real funds (mainnet) |
| **api** | Route handlers, auth, webhook idempotency | Vitest + supertest |

**Priority:** domain tests are mandatory (they're fast and cover the core logic). Other tests are best-effort given the 10-day timeline.

---

## Extensibility: adding a new provider

To add MoonPay as a 4th off-ramp provider:

1. Create `packages/infra-offramp/src/moonpay/` with `client.ts`, `adapter.ts`, `mapper.ts`
2. Implement `OffRampProvider` interface
3. Add `MOONPAY_API_KEY` to `config.ts` (Zod schema)
4. Register in `infra-offramp/src/index.ts` registry
5. Add to `.env.example`

**Zero changes needed in:** domain, router, executor, API, frontend. This is the adapter pattern's payoff.
