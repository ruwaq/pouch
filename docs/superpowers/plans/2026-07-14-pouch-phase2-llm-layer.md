# Pouch — Phase 2: LLM Layer (infra-ai + Gemini function-calling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Pouch from a regex-only "agent with a chat skin" to a genuine agent that understands free-form natural language via Gemini function-calling, with the existing regex parser as an always-works fallback.

**Architecture:** A new `packages/infra-ai/` package owns the LLM adapter (domain stays pure, no SDKs). It implements the domain's `IntentParserStrategy` (made async) plus a new `ReplyStrategy` port for conversational replies. The `GeminiProvider` adapts `@google/genai` behind a provider-agnostic `LLMProvider` interface; the `LlmIntentParser` delegates to it and falls back to the regex `IntentParser` on any failure. The API's `createRuntimeAppServices` wires the LLM parser in when `LLM_PROVIDER` is set, else keeps regex. The demo never breaks because of the LLM.

**Tech Stack:** `@google/genai` (Gemini 2.0 Flash, function calling), TypeScript, Vitest, Zod (config already done), monorepo workspace package.

**Spec source of truth:** `docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md` §7 (Agent intelligence / LLM layer).

---

## How this phase fits the roadmap

- **Runs in parallel** with Phase 1's two manual gates (the UA spike + the DB migration). It depends ONLY on Phase 0's `IntentParserStrategy` interface, not on real web3 or a live database.
- **Does NOT** add off-topic multi-turn conversation handling (deferred to Phase 3 frontend). It delivers the two things the demo needs: (1) free-form cash-out parsing, (2) a conversational success reply. The seams for more are left open.
- **Never executes transactions.** The LLM is a parser + reply composer. The deterministic, tested `CashOutExecutor` still owns the flow (spec §7 "What the LLM does NOT do").

---

## File structure (what gets created / modified)

**New package `packages/infra-ai/`:**
- `package.json`, `tsconfig.json` — package definition (mirrors `@pouch/infra-offramp`).
- `src/llm-provider.ts` — `LLMProvider` interface + request/response types (provider-agnostic port).
- `src/gemini-client.ts` — minimal structural type for the `@google/genai` client surface we use (duck-typed so the provider is testable without the SDK).
- `src/llm-tools.ts` — Gemini function declarations (`cash_out`, `check_balance`, `search_products`, `off_topic`) + the `cash_out` arg → `CashOutIntent` mapper.
- `src/system-prompt.ts` — Pouch's system prompt string (spec §7).
- `src/gemini-provider.ts` — `GeminiProvider implements LLMProvider` (adapts the SDK client; never throws — returns `err`).
- `src/llm-intent-parser.ts` — `LlmIntentParser implements IntentParserStrategy` (delegates to `LLMProvider`, falls back to regex).
- `src/llm-reply-strategy.ts` — `LlmReplyStrategy implements ReplyStrategy` (conversational success reply; falls back to template on any failure).
- `src/factory.ts` — `createLlmProvider(config)`, `createIntentParser(config)`, `createReplyStrategy(config, provider)`, `createAgentLlm(config)` (the combined helper the API composition root calls).
- `src/index.ts` — barrel export.
- `__tests__/*.test.ts` — one test file per unit, all with fakes (no real API calls).

**Modified (existing files):**
- `packages/domain/src/intent-parser.ts` — `IntentParserStrategy.parse` becomes **async**; `IntentParser.parse` becomes async. (Necessary: an LLM call is inherently async; a sync interface cannot host it.)
- `packages/domain/src/reply.ts` — **NEW** file. `ReplyStrategy` + `ReplyInput` port (consumer-defined; infra implements).
- `packages/domain/src/index.ts` — re-export `./reply`.
- `apps/api/src/services/agent-chat-service.ts` — `await` the now-async parser; add an optional `replyStrategy?: ReplyStrategy` constructor param that overrides the inline template reply (fallback on any failure). **Preserves the exact current reply string when no strategy is injected.**
- `apps/api/src/bootstrap/create-runtime-app-services.ts` — construct the parser + reply strategy via the infra-ai factory when `LLM_PROVIDER` is set.
- `apps/api/package.json` — add `@pouch/infra-ai: workspace:*` dependency.
- `tsconfig.base.json` — add the `"@pouch/infra-ai"` path alias.
- Root `package.json` — install `@google/genai`.

**Why these boundaries:** Domain owns the ports (`IntentParserStrategy`, `ReplyStrategy`) — it defines the contract, both the app layer (consumer) and infra-ai (implementer) import from domain. infra-ai owns the SDK adapter and never imports from `apps/api`. This is the exact pattern already used for `AccountProvider` (domain) / `ParticleAccountProvider` (infra-web3).

---

## Prerequisites (verify before Task 1)

- [ ] **Step 0: Confirm clean baseline**

Run:
```bash
pnpm typecheck   # 7/7 packages pass
pnpm test        # 56 tests pass
pnpm build       # 7/7 packages pass
```
Expected: all green. If any fail, stop and fix before starting Phase 2 (the HANDOFF records this as the verified baseline).

---

## Task 1: Make `IntentParserStrategy` async

**Why first:** The LLM call is inherently async. The current `parse(message): Result<...>` signature is synchronous and cannot host an async implementation. This is a contained signature change that Phase 0 anticipated ("LLM parser injectable in Phase 2") but could not finalize without the real async dependency. It touches: the interface, the regex impl, the service consumer, and the parser tests.

**Files:**
- Modify: `packages/domain/src/intent-parser.ts:57-92`
- Modify: `apps/api/src/services/agent-chat-service.ts:33-34`
- Modify: `packages/domain/__tests__/intent-parser.test.ts` (add `await`)
- Test: `packages/domain/__tests__/intent-parser.test.ts` (existing) + `apps/api/__tests__` (existing, must stay green)

- [ ] **Step 1: Update the interface + regex impl to async**

In `packages/domain/src/intent-parser.ts`, change the strategy interface and the `IntentParser` class so `parse` is async. Replace the interface declaration:

```typescript
export interface IntentParserStrategy {
  parse(message: string): Promise<Result<CashOutIntent, DomainError>>;
}
```

And change the class method signature (body unchanged — just prepend `async`):

```typescript
export class IntentParser implements IntentParserStrategy {
  async parse(message: string): Promise<Result<CashOutIntent, DomainError>> {
    // ... existing body unchanged ...
  }
}
```

- [ ] **Step 2: Update the consumer to `await`**

In `apps/api/src/services/agent-chat-service.ts`, line ~34, add `await`:

```typescript
    const intent = await this.parser.parse(message);
```

(`handleMessage` is already `async`, so no other change is needed.)

- [ ] **Step 3: Update the parser unit tests to `await`**

In `packages/domain/__tests__/intent-parser.test.ts`, every `parser.parse(...)` call must be awaited and the `it(...)` callbacks must be `async`. For example:

```typescript
  it('parses a gift card cash-out request from natural language', async () => {
    const parser = new IntentParser();

    const result = await parser.parse('Cash out $50 to Amazon');

    expect(result.ok).toBe(true);
    // ... rest unchanged ...
  });
```

Apply the same two changes (`async () =>` callback + `await parser.parse(...)`) to **every** `it(...)` block in that file. There is also an error-path test ("returns a structured error when the amount is missing") — make it `async` and `await` its parse call too.

- [ ] **Step 4: Run tests to verify green**

Run: `pnpm --filter @pouch/domain test && pnpm --filter @pouch/api test`
Expected: PASS (same counts as baseline — 56 tests total). If an API test constructs `AgentChatService` and calls `handleMessage`, that is already async and unaffected.

- [ ] **Step 5: Run full quality gate**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/intent-parser.ts packages/domain/__tests__/intent-parser.test.ts apps/api/src/services/agent-chat-service.ts
git commit -m "refactor(domain): make IntentParserStrategy async to host the LLM parser (Phase 2 prep)"
```

---

## Task 2: Scaffold the `infra-ai` package

**Files:**
- Create: `packages/infra-ai/package.json`
- Create: `packages/infra-ai/tsconfig.json`
- Create: `packages/infra-ai/src/index.ts` (empty barrel for now)
- Modify: `tsconfig.base.json:20-26` (add path alias)

- [ ] **Step 1: Create `packages/infra-ai/package.json`**

```json
{
  "name": "@pouch/infra-ai",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@pouch/domain": "workspace:*",
    "@pouch/shared": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.20.3"
  }
}
```

- [ ] **Step 2: Create `packages/infra-ai/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "__tests__/**/*.ts", "__tests__/**/*.tsx"]
}
```

- [ ] **Step 3: Create an empty barrel `packages/infra-ai/src/index.ts`**

```typescript
// @pouch/infra-ai — LLM adapter layer (Gemini + function calling).
// Populated across Tasks 3–9.
export {};
```

- [ ] **Step 4: Register the path alias in `tsconfig.base.json`**

In the `paths` block, add the `@pouch/infra-ai` entry. The block becomes:

```json
    "paths": {
      "@pouch/shared": ["packages/shared/src/index.ts"],
      "@pouch/domain": ["packages/domain/src/index.ts"],
      "@pouch/infra-offramp": ["packages/infra-offramp/src/index.ts"],
      "@pouch/infra-web3": ["packages/infra-web3/src/index.ts"],
      "@pouch/infra-db": ["packages/infra-db/src/index.ts"],
      "@pouch/infra-ai": ["packages/infra-ai/src/index.ts"]
    }
```

- [ ] **Step 5: Install + verify it compiles**

Run: `pnpm install`
Expected: workspace links resolve; `@pouch/infra-ai` recognized.

Run: `pnpm --filter @pouch/infra-ai typecheck`
Expected: PASS (empty module typechecks).

- [ ] **Step 6: Commit**

```bash
git add packages/infra-ai tsconfig.base.json pnpm-lock.yaml
git commit -m "feat(infra-ai): scaffold @pouch/infra-ai package + path alias"
```

---

## Task 3: `LLMProvider` interface + types

The provider-agnostic port. Any future LLM (OpenAI, Anthropic, Groq) implements this one interface; the domain and the parser never see which SDK is behind it.

**Files:**
- Create: `packages/infra-ai/src/llm-provider.ts`

- [ ] **Step 1: Write the interface**

Create `packages/infra-ai/src/llm-provider.ts`:

```typescript
import type { DomainError } from '@pouch/domain';
import type { Result } from '@pouch/shared';

/**
 * A function call returned by the LLM (e.g. Gemini function-calling).
 * `args` is an untyped record — the caller validates/maps it.
 */
export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider-agnostic tool declaration. The `parameters` shape is intentionally
 * `unknown` because each provider's schema dialect differs (Gemini uses
 * `Type.OBJECT`-style descriptors). The concrete provider casts as needed.
 */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

export interface LlmToolRequest {
  message: string;
  systemInstruction: string;
  tools: ToolDeclaration[];
}

export interface LlmToolResponse {
  /** Present when the model chose a function to call. */
  functionCall?: FunctionCall;
  /** Present when the model replied in natural language (no function chosen). */
  text?: string;
}

export interface LlmTextRequest {
  systemInstruction: string;
  message: string;
}

/**
 * Provider-agnostic LLM port. Implementations MUST NOT throw on transient
 * failures (network, auth, rate limit) — they return `err(...)` so callers can
 * fall back. Reserved for truly unexpected thrown errors, callers `try/catch`.
 */
export interface LLMProvider {
  /** Function-calling request: the model either calls a tool or replies as text. */
  generateWithTools(request: LlmToolRequest): Promise<Result<LlmToolResponse, DomainError>>;

  /** Plain text generation (used for conversational replies). */
  generateText(request: LlmTextRequest): Promise<Result<string, DomainError>>;
}
```

- [ ] **Step 2: Re-export from the barrel**

Replace the body of `packages/infra-ai/src/index.ts` with:

```typescript
export * from './llm-provider';
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @pouch/infra-ai typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/infra-ai/src/llm-provider.ts packages/infra-ai/src/index.ts
git commit -m "feat(infra-ai): add provider-agnostic LLMProvider interface"
```

---

## Task 4: Function declarations, system prompt, and the `cash_out` mapper

Pure data + a pure mapper. No SDK, no I/O — fully unit-testable. This is the function-calling contract from spec §7.

**Files:**
- Create: `packages/infra-ai/src/system-prompt.ts`
- Create: `packages/infra-ai/src/llm-tools.ts`
- Test: `packages/infra-ai/__tests__/llm-tools.test.ts`

- [ ] **Step 1: Write the system prompt**

Create `packages/infra-ai/src/system-prompt.ts`:

```typescript
/**
 * Pouch's role definition, sent as the system instruction to the LLM.
 * Mirrors spec §7. The LLM never sees wallets, keys, or chain details — it only
 * parses intent and (optionally) composes a friendly reply.
 */
export const POUCH_SYSTEM_PROMPT = `You are Pouch, an AI agent that converts the user's crypto into real-world value (gift cards, mobile top-ups, eSIM). You understand the user's intent from natural language and call the appropriate function. You never expose wallet addresses, chain IDs, gas, or signing details to the user. You are concise and friendly. If the user's request is not about cashing out or checking balance, respond conversationally and gently steer back to what you can do.

When the user wants to cash out, call the cash_out function with: category (giftcard, topup, esim, billpay, bank, or card), brand (lowercase, e.g. "amazon", "steam"), and amount (a positive USD number). Infer the brand and category from context when possible. If the user does not state an amount, still call cash_out but set amount to 0.`;
```

- [ ] **Step 2: Write the failing test for the mapper**

Create `packages/infra-ai/__tests__/llm-tools.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { mapCashOutArgs, POUCH_TOOL_DECLARATIONS } from '../src/llm-tools';

describe('mapCashOutArgs', () => {
  it('maps a complete cash_out argument object into a CashOutIntent', () => {
    const result = mapCashOutArgs({ category: 'giftcard', brand: 'amazon', amount: 50 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({
      action: 'cash_out',
      category: 'giftcard',
      brand: 'amazon',
      amount: { value: 50, currency: 'USD' },
    });
  });

  it('defaults category to giftcard when missing or unrecognized', () => {
    const result = mapCashOutArgs({ amount: 25 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('giftcard');
    expect(result.value.brand).toBeUndefined();
  });

  it('lowercases and trims the brand', () => {
    const result = mapCashOutArgs({ category: 'giftcard', brand: '  Steam ', amount: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brand).toBe('steam');
  });

  it('returns INVALID_INTENT_AMOUNT when amount is missing or non-positive', () => {
    const missing = mapCashOutArgs({ category: 'giftcard' });
    const zero = mapCashOutArgs({ category: 'giftcard', amount: 0 });
    const negative = mapCashOutArgs({ category: 'giftcard', amount: -5 });

    expect(missing.ok).toBe(false);
    expect(zero.ok).toBe(false);
    expect(negative.ok).toBe(false);
  });

  it('rounds fractional amounts to 2 decimals', () => {
    const result = mapCashOutArgs({ amount: 12.345 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount.value).toBe(12.35);
  });
});

describe('POUCH_TOOL_DECLARATIONS', () => {
  it('declares the four Pouch functions', () => {
    const names = POUCH_TOOL_DECLARATIONS.map((t) => t.name);
    expect(names).toEqual(['cash_out', 'check_balance', 'search_products', 'off_topic']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: FAIL — `mapCashOutArgs` / `POUCH_TOOL_DECLARATIONS` not defined (module not found).

- [ ] **Step 4: Implement `llm-tools.ts`**

Create `packages/infra-ai/src/llm-tools.ts`:

```typescript
import { err, ok, type Result } from '@pouch/shared';
import type { CashOutIntent, DomainError, OffRampCategory } from '@pouch/domain';

import type { ToolDeclaration } from './llm-provider';

const VALID_CATEGORIES: readonly OffRampCategory[] = [
  'giftcard',
  'topup',
  'esim',
  'billpay',
  'bank',
  'card',
];

/**
 * Maps the raw `cash_out` function-call args (from the LLM) into a domain
 * CashOutIntent. Pure; returns a DomainError on bad input so the caller can
 * decide to fall back to the regex parser.
 */
export function mapCashOutArgs(args: Record<string, unknown>): Result<CashOutIntent, DomainError> {
  const rawCategory = typeof args.category === 'string' ? args.category.toLowerCase() : 'giftcard';
  const category: OffRampCategory = (
    VALID_CATEGORIES as readonly string[]
  ).includes(rawCategory)
    ? (rawCategory as OffRampCategory)
    : 'giftcard';

  const rawAmount = args.amount;
  const amountNumber = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);

  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return err({
      type: 'INVALID_INTENT_AMOUNT',
      message: 'Could not determine a positive USD amount to cash out.',
    });
  }

  const intent: CashOutIntent = {
    action: 'cash_out',
    category,
    amount: {
      value: Math.round(amountNumber * 100) / 100,
      currency: 'USD',
    },
  };

  const rawBrand = typeof args.brand === 'string' ? args.brand.trim().toLowerCase() : '';
  if (rawBrand) {
    intent.brand = rawBrand;
  }

  return ok(intent);
}

/**
 * The Gemini function declarations for Pouch (spec §7). The `parameters` use
 * Gemini's schema dialect (`Type.OBJECT` etc.); `Type` is imported lazily inside
 * the factory so this module stays free of the SDK at import time for callers
 * that only need `mapCashOutArgs`. Here we construct the descriptors via a
 * numeric enum mirror to avoid importing the SDK in this pure module.
 *
 * Gemini `Type` values: OBJECT=5, STRING=3, NUMBER=2, ARRAY=4, ENUM=6 (string
 * enums reuse type STRING + `enum` field).
 */
const T = { NUMBER: 2, STRING: 3, OBJECT: 5 } as const;

export const POUCH_TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'cash_out',
    description:
      "Convert the user's crypto into a gift card, mobile top-up, or eSIM. Call this whenever the user wants to cash out.",
    parameters: {
      type: T.OBJECT,
      properties: {
        category: {
          type: T.STRING,
          description: 'What the user wants: giftcard, topup, esim, billpay, bank, or card.',
        },
        brand: {
          type: T.STRING,
          description: 'Target brand in lowercase, e.g. "amazon", "steam", "t-mobile".',
        },
        amount: {
          type: T.NUMBER,
          description: 'USD amount to cash out. Must be a positive number.',
        },
      },
      required: ['category', 'amount'],
    },
  },
  {
    name: 'check_balance',
    description: 'The user is asking how much crypto/value they hold. Call this for balance questions.',
    parameters: { type: T.OBJECT, properties: {} },
  },
  {
    name: 'search_products',
    description:
      'The user wants to browse what they can get for an amount, without purchasing yet.',
    parameters: {
      type: T.OBJECT,
      properties: {
        amount: { type: T.NUMBER, description: 'USD budget to browse for.' },
      },
    },
  },
  {
    name: 'off_topic',
    description:
      'The user message is a greeting or not related to cashing out. Call this to reply conversationally.',
    parameters: { type: T.OBJECT, properties: {} },
  },
];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: PASS (all 6 assertions).

- [ ] **Step 6: Re-export from the barrel**

Update `packages/infra-ai/src/index.ts`:

```typescript
export * from './llm-provider';
export * from './llm-tools';
export { POUCH_SYSTEM_PROMPT } from './system-prompt';
```

- [ ] **Step 7: Commit**

```bash
git add packages/infra-ai/src/llm-tools.ts packages/infra-ai/src/system-prompt.ts packages/infra-ai/__tests__/llm-tools.test.ts packages/infra-ai/src/index.ts
git commit -m "feat(infra-ai): add cash_out mapper, tool declarations, system prompt"
```

---

## Task 5: `GeminiProvider` (adapts `@google/genai`)

The adapter. It depends on a **structural** client type (`GeminiClient`) so it can be tested with a fake — the real `GoogleGenAI` instance is only constructed in the factory (Task 9). It never throws on transient failures: it returns `err`.

**Files:**
- Create: `packages/infra-ai/src/gemini-client.ts`
- Create: `packages/infra-ai/src/gemini-provider.ts`
- Test: `packages/infra-ai/__tests__/gemini-provider.test.ts`

- [ ] **Step 1: Define the structural client type**

Create `packages/infra-ai/src/gemini-client.ts`:

```typescript
/**
 * Minimal structural view of the @google/genai `GoogleGenAI` surface we use.
 * The real client (constructed in factory.ts) satisfies this by duck-typing,
 * and tests pass a fake. This keeps the provider decoupled + unit-testable
 * without the SDK installed.
 */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResponse {
  /** Convenience accessor provided by @google/genai: all function-call parts. */
  functionCalls?: GeminiFunctionCall[];
  /** Convenience text accessor. */
  text?: string;
}

export interface GeminiRequest {
  model: string;
  contents: string;
  config?: {
    systemInstruction?: string;
    tools?: Array<{ functionDeclarations: unknown[] }>;
  };
}

export interface GeminiClient {
  models: {
    generateContent(request: GeminiRequest): Promise<GeminiResponse>;
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/infra-ai/__tests__/gemini-provider.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { GeminiProvider } from '../src/gemini-provider';
import type { GeminiClient, GeminiResponse } from '../src/gemini-client';
import { POUCH_SYSTEM_PROMPT, POUCH_TOOL_DECLARATIONS } from '../src/index';

function fakeClient(respond: (req: { tools?: unknown }) => GeminiResponse): GeminiClient & {
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        return respond(request);
      },
    },
  };
}

describe('GeminiProvider.generateWithTools', () => {
  it('returns the first function call when the model calls a tool', async () => {
    const client = fakeClient(() => ({
      functionCalls: [{ name: 'cash_out', args: { amount: 50, brand: 'amazon' } }],
    }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateWithTools({
      message: 'cash out $50 to amazon',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.functionCall).toEqual({ name: 'cash_out', args: { amount: 50, brand: 'amazon' } });
  });

  it('returns text when the model replies without a function call', async () => {
    const client = fakeClient(() => ({ text: 'Sure — how much would you like to cash out?' }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateWithTools({
      message: 'hi',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.functionCall).toBeUndefined();
    expect(result.value.text).toContain('how much');
  });

  it('passes the system instruction, tools, and model to the client', async () => {
    const client = fakeClient(() => ({ functionCalls: [] }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    await provider.generateWithTools({
      message: 'cash out $10',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    const sent = (client as { calls: unknown[] }).calls[0] as {
      model: string;
      contents: string;
      config?: { systemInstruction?: string; tools?: unknown[] };
    };
    expect(sent.model).toBe('gemini-2.0-flash');
    expect(sent.contents).toBe('cash out $10');
    expect(sent.config?.systemInstruction).toBe(POUCH_SYSTEM_PROMPT);
    expect(sent.config?.tools).toHaveLength(1);
  });

  it('returns err (never throws) when the client rejects', async () => {
    const client: GeminiClient = {
      models: {
        async generateContent() {
          throw new Error('network down');
        },
      },
    };
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateWithTools({
      message: 'cash out $10',
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: POUCH_TOOL_DECLARATIONS,
    });

    expect(result.ok).toBe(false);
  });
});

describe('GeminiProvider.generateText', () => {
  it('returns the generated text', async () => {
    const client = fakeClient(() => ({ text: 'Done! Your Amazon card is ready.' }));
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateText({
      systemInstruction: 'You are Pouch.',
      message: 'Say done',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('Done! Your Amazon card is ready.');
  });

  it('returns err when the client throws', async () => {
    const client: GeminiClient = {
      models: {
        async generateContent() {
          throw new Error('401');
        },
      },
    };
    const provider = new GeminiProvider(client, 'gemini-2.0-flash');

    const result = await provider.generateText({ systemInstruction: '', message: 'x' });

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: FAIL — `GeminiProvider` not defined.

- [ ] **Step 4: Implement `GeminiProvider`**

Create `packages/infra-ai/src/gemini-provider.ts`:

```typescript
import { toUnknownDomainError } from '@pouch/domain';
import { err, ok, type Result } from '@pouch/shared';

import type { GeminiClient } from './gemini-client';
import type {
  LLMProvider,
  LlmTextRequest,
  LlmToolRequest,
  LlmToolResponse,
  ToolDeclaration,
} from './llm-provider';

/**
 * Adapts @google/genai to the provider-agnostic LLMProvider port.
 *
 * The SDK client is injected (duck-typed via GeminiClient) so this class is
 * unit-testable without the SDK installed, and so a different client can be
 * substituted. It NEVER throws on transient failures — it returns err(...) so
 * the caller (LlmIntentParser) can fall back to regex.
 */
export class GeminiProvider implements LLMProvider {
  constructor(
    private readonly client: GeminiClient,
    private readonly model: string,
  ) {}

  async generateWithTools(request: LlmToolRequest): Promise<Result<LlmToolResponse, ReturnType<typeof toUnknownDomainError>>> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.message,
        config: {
          systemInstruction: request.systemInstruction,
          tools: [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }],
        },
      });

      const fc = response.functionCalls?.[0];
      const out: LlmToolResponse = {};
      if (fc) {
        out.functionCall = { name: fc.name, args: fc.args ?? {} };
      } else if (typeof response.text === 'string') {
        out.text = response.text;
      }
      return ok(out);
    } catch (error) {
      return err(toUnknownDomainError(`Gemini generateWithTools failed: ${describeError(error)}`));
    }
  }

  async generateText(request: LlmTextRequest): Promise<Result<string, ReturnType<typeof toUnknownDomainError>>> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.message,
        config: { systemInstruction: request.systemInstruction },
      });
      return ok(typeof response.text === 'string' ? response.text : '');
    } catch (error) {
      return err(toUnknownDomainError(`Gemini generateText failed: ${describeError(error)}`));
    }
  }
}

function toFunctionDeclaration(tool: ToolDeclaration): unknown {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: PASS (all gemini-provider + llm-tools assertions).

- [ ] **Step 6: Re-export from the barrel**

Update `packages/infra-ai/src/index.ts`:

```typescript
export * from './llm-provider';
export * from './llm-tools';
export { POUCH_SYSTEM_PROMPT } from './system-prompt';
export * from './gemini-client';
export { GeminiProvider } from './gemini-provider';
```

- [ ] **Step 7: Commit**

```bash
git add packages/infra-ai/src/gemini-client.ts packages/infra-ai/src/gemini-provider.ts packages/infra-ai/__tests__/gemini-provider.test.ts packages/infra-ai/src/index.ts
git commit -m "feat(infra-ai): add GeminiProvider adapter (function-calling + text, never throws)"
```

---

## Task 6: `LlmIntentParser` (implements `IntentParserStrategy`, regex fallback)

The core upgrade. It asks the LLM to classify the message via function-calling; if the LLM returns `cash_out`, it maps the args; **on any failure or non-cash_out result it falls back to the regex parser.** This is the resilience guarantee (spec §7 fallback chain: Gemini → regex).

**Files:**
- Create: `packages/infra-ai/src/llm-intent-parser.ts`
- Test: `packages/infra-ai/__tests__/llm-intent-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/infra-ai/__tests__/llm-intent-parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { IntentParser } from '@pouch/domain';

import { LlmIntentParser } from '../src/llm-intent-parser';
import { POUCH_TOOL_DECLARATIONS } from '../src/llm-tools';
import type { LLMProvider } from '../src/llm-provider';

function fakeProvider(respond: () => ReturnType<LLMProvider['generateWithTools']>): LLMProvider & {
  calledWith: string[];
} {
  const calledWith: string[] = [];
  return {
    calledWith,
    async generateWithTools(req) {
      calledWith.push(req.message);
      return respond();
    },
    async generateText() {
      throw new Error('not used');
    },
  };
}

describe('LlmIntentParser', () => {
  it('returns a CashOutIntent when the LLM calls cash_out', async () => {
    const provider = fakeProvider(async () => {
      const { ok } = await import('@pouch/shared');
      return ok({
        functionCall: { name: 'cash_out', args: { category: 'giftcard', brand: 'steam', amount: 20 } },
      });
    });
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('turn my leftover ETH into steam credit');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      action: 'cash_out',
      category: 'giftcard',
      brand: 'steam',
      amount: { value: 20, currency: 'USD' },
    });
  });

  it('falls back to regex when the LLM returns a non-cash_out function', async () => {
    const provider = fakeProvider(async () => {
      const { ok } = await import('@pouch/shared');
      return ok({ functionCall: { name: 'off_topic', args: {} } });
    });
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    // regex parser handles the canonical phrasing even though the LLM said off_topic
    const result = await parser.parse('cash out $50 to amazon');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brand).toBe('amazon');
  });

  it('falls back to regex when the LLM returns plain text (no function call)', async () => {
    const provider = fakeProvider(async () => {
      const { ok } = await import('@pouch/shared');
      return ok({ text: 'Hello! How can I help?' });
    });
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('cash out $50 to amazon');

    expect(result.ok).toBe(true);
  });

  it('falls back to regex when the LLM provider returns an error', async () => {
    const provider = fakeProvider(async () => {
      const { err } = await import('@pouch/shared');
      const { toUnknownDomainError } = await import('@pouch/domain');
      return err(toUnknownDomainError('network down'));
    });
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('cash out $50 to amazon');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brand).toBe('amazon');
  });

  it('returns the regex error when neither LLM nor regex can parse', async () => {
    const provider = fakeProvider(async () => {
      const { ok } = await import('@pouch/shared');
      return ok({ text: 'hi there' });
    });
    const parser = new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);

    const result = await parser.parse('just saying hello');

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: FAIL — `LlmIntentParser` not defined.

- [ ] **Step 3: Implement `LlmIntentParser`**

Create `packages/infra-ai/src/llm-intent-parser.ts`:

```typescript
import type { CashOutIntent, DomainError, IntentParserStrategy } from '@pouch/domain';
import { isOk, type Result } from '@pouch/shared';

import type { LLMProvider, ToolDeclaration } from './llm-provider';
import { mapCashOutArgs } from './llm-tools';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * IntentParserStrategy backed by an LLM (function-calling), with a deterministic
 * regex parser as the final fallback. Resilience rule (spec §7): on ANY LLM
 * failure — provider error, non-cash_out function, plain-text reply, or bad
 * cash_out args — we fall back to the regex parser. The demo never breaks
 * because of the LLM.
 */
export class LlmIntentParser implements IntentParserStrategy {
  constructor(
    private readonly llm: LLMProvider,
    private readonly fallback: IntentParserStrategy,
    private readonly tools: ToolDeclaration[],
  ) {}

  async parse(message: string): Promise<Result<CashOutIntent, DomainError>> {
    const result = await this.llm.generateWithTools({
      message,
      systemInstruction: POUCH_SYSTEM_PROMPT,
      tools: this.tools,
    });

    if (!isOk(result)) {
      return this.fallback.parse(message);
    }

    const fc = result.value.functionCall;
    if (!fc || fc.name !== 'cash_out') {
      return this.fallback.parse(message);
    }

    const mapped = mapCashOutArgs(fc.args);
    if (!isOk(mapped)) {
      return this.fallback.parse(message);
    }

    return mapped;
  }
}
```

The tool list is a constructor dependency (not imported inline) so the parser is injectable and unit-testable in isolation — the test passes `POUCH_TOOL_DECLARATIONS` explicitly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: PASS (all LlmIntentParser cases + earlier suites).

- [ ] **Step 5: Re-export from the barrel**

Update `packages/infra-ai/src/index.ts` (add the line):

```typescript
export { LlmIntentParser } from './llm-intent-parser';
```

- [ ] **Step 6: Commit**

```bash
git add packages/infra-ai/src/llm-intent-parser.ts packages/infra-ai/__tests__/llm-intent-parser.test.ts packages/infra-ai/src/index.ts
git commit -m "feat(infra-ai): add LlmIntentParser with regex fallback on any LLM failure"
```

---

## Task 7: `ReplyStrategy` domain port + wire the optional seam into `AgentChatService`

Adds the conversational-reply seam. The **domain** owns the port; `AgentChatService` gets an optional override and **keeps its exact current template reply** as the default/fallback (so existing tests stay green). The LLM implementation lands in Task 8.

**Files:**
- Create: `packages/domain/src/reply.ts`
- Modify: `packages/domain/src/index.ts` (re-export)
- Modify: `apps/api/src/services/agent-chat-service.ts` (optional `replyStrategy?: ReplyStrategy`)

- [ ] **Step 1: Define the port in domain**

Create `packages/domain/src/reply.ts`:

```typescript
import type { CashOutIntent } from './types';
import type { CashOutResult } from './types';
import type { Order } from './types';

export interface ReplyInput {
  intent: CashOutIntent;
  result: CashOutResult;
  order: Order | null;
}

/**
 * Composes the agent's chat reply for a completed cash-out. The default
 * (template) implementation lives inline in AgentChatService; an LLM-backed
 * implementation (infra-ai) can be injected for conversational replies.
 * Implementations SHOULD be resilient — never throw; on failure the caller
 * falls back to its template.
 */
export interface ReplyStrategy {
  buildReply(input: ReplyInput): Promise<string>;
}
```

- [ ] **Step 2: Re-export from the domain barrel**

In `packages/domain/src/index.ts`, add:

```typescript
export * from './reply';
```

- [ ] **Step 3: Refactor `AgentChatService` to use an optional `ReplyStrategy`**

In `apps/api/src/services/agent-chat-service.ts`, add the import and the optional constructor parameter, and route the reply through it with a template fallback. The full updated file:

```typescript
import { isOk, ok, type Result } from '@pouch/shared';
import type { CashOutExecutor, CashOutIntent, CashOutResult, DomainError, IntentParserStrategy, OrderRepository, ReplyStrategy } from '@pouch/domain';

export interface AgentChatResponse extends CashOutResult {
  intent: CashOutIntent;
  reply: string;
  trace: CashOutResult['trace'];
}

export interface AgentChatServiceLike {
  handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>>;
}

function toDisplayBrand(brand: string | undefined): string {
  if (!brand) {
    return 'your selected product';
  }

  return brand
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

export class AgentChatService implements AgentChatServiceLike {
  constructor(
    private readonly parser: IntentParserStrategy,
    private readonly executor: CashOutExecutor,
    private readonly orders: OrderRepository,
    private readonly replyStrategy?: ReplyStrategy,
  ) {}

  async handleMessage(message: string, userId: string): Promise<Result<AgentChatResponse, DomainError>> {
    const intent = await this.parser.parse(message);

    if (!isOk(intent)) {
      return intent;
    }

    const execution = await this.executor.execute(intent.value, userId);

    if (!isOk(execution)) {
      return execution;
    }

    const persistedOrder = await this.orders.findById(execution.value.orderId);

    const reply = await this.composeReply(intent.value, execution.value, persistedOrder);

    return ok({
      ...execution.value,
      intent: intent.value,
      reply,
    });
  }

  private async composeReply(
    intent: CashOutIntent,
    result: CashOutResult,
    order: { product: { brand?: string } } | null,
  ): Promise<string> {
    const template = (): string => {
      const displayBrand = toDisplayBrand(order?.product.brand ?? intent.brand);
      return `Starting your ${displayBrand} cash-out for $${intent.amount.value.toFixed(2)}. Order ${result.orderId} is now ${result.status}.`;
    };

    if (!this.replyStrategy) {
      return template();
    }

    try {
      return await this.replyStrategy.buildReply({
        intent,
        result,
        order: order as Parameters<ReplyStrategy['buildReply']>[0]['order'],
      });
    } catch {
      return template();
    }
  }
}
```

> The template string is **byte-identical** to the previous inline reply, so any existing test that asserts on `reply` continues to pass when no `replyStrategy` is injected.

- [ ] **Step 4: Verify nothing regressed**

Run: `pnpm typecheck && pnpm --filter @pouch/domain test && pnpm --filter @pouch/api test`
Expected: PASS. If an API test asserts the exact `reply` string, it still matches (template unchanged). If any test directly instantiates `AgentChatService` with positional args and breaks, add `undefined` is NOT needed — the new param is optional and last.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/reply.ts packages/domain/src/index.ts apps/api/src/services/agent-chat-service.ts
git commit -m "feat(domain): add ReplyStrategy port; AgentChatService gains optional reply override (template fallback preserved)"
```

---

## Task 8: `LlmReplyStrategy` (conversational success reply)

Composes a friendly, brand-aware reply from the execution result via a plain text generation call. Falls back to a deterministic template on any failure (resilience). It is the `ReplyStrategy` implementation that `createRuntimeAppServices` will inject when an LLM is configured.

**Files:**
- Create: `packages/infra-ai/src/llm-reply-strategy.ts`
- Test: `packages/infra-ai/__tests__/llm-reply-strategy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/infra-ai/__tests__/llm-reply-strategy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { CashOutIntent, CashOutResult, Order } from '@pouch/domain';

import { LlmReplyStrategy } from '../src/llm-reply-strategy';
import type { LLMProvider } from '../src/llm-provider';

function fakeIntent(overrides: Partial<CashOutIntent> = {}): CashOutIntent {
  return {
    action: 'cash_out',
    category: 'giftcard',
    brand: 'amazon',
    amount: { value: 50, currency: 'USD' },
    ...overrides,
  } as CashOutIntent;
}

function fakeResult(): CashOutResult {
  return { orderId: 'order-123', status: 'payment_pending', trace: [] };
}

function fakeOrder(): Order {
  return {
    id: 'order-123',
    providerId: 'bitrefill',
    product: { id: 'amazon', providerId: 'bitrefill', name: 'Amazon', category: 'giftcard', brand: 'amazon' },
    faceValue: { value: 50, currency: 'USD' },
    payment: { amount: { value: 50, currency: 'USD' }, chainId: 42161, token: 'USDC' },
    status: 'payment_pending',
    idempotencyKey: 'k1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Order;
}

describe('LlmReplyStrategy', () => {
  it('returns the LLM-generated text on success', async () => {
    const provider: LLMProvider = {
      async generateText() {
        const { ok } = await import('@pouch/shared');
        return ok('Done! Your $50 Amazon card is on the way. 🎉');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

    expect(reply).toBe('Done! Your $50 Amazon card is on the way. 🎉');
  });

  it('passes brand, amount, status, and orderId context to the LLM prompt', async () => {
    let seen = '';
    const provider: LLMProvider = {
      async generateText(req) {
        const { ok } = await import('@pouch/shared');
        seen = req.message;
        return ok('ok');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    await strategy.buildReply({
      intent: fakeIntent({ brand: 'steam' }),
      result: { orderId: 'order-999', status: 'delivered', trace: [] },
      order: fakeOrder(),
    });

    expect(seen).toContain('steam');
    expect(seen).toContain('order-999');
    expect(seen).toContain('delivered');
  });

  it('falls back to a deterministic template when the LLM fails', async () => {
    const provider: LLMProvider = {
      async generateText() {
        const { err } = await import('@pouch/shared');
        const { toUnknownDomainError } = await import('@pouch/domain');
        return err(toUnknownDomainError('down'));
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

    expect(reply).toContain('Amazon');
    expect(reply).toContain('order-123');
    expect(reply).toContain('50');
  });

  it('falls back when the provider throws', async () => {
    const provider: LLMProvider = {
      async generateText() {
        throw new Error('boom');
      },
      async generateWithTools() {
        throw new Error('not used');
      },
    };
    const strategy = new LlmReplyStrategy(provider);

    const reply = await strategy.buildReply({ intent: fakeIntent(), result: fakeResult(), order: fakeOrder() });

    expect(reply).toContain('Amazon');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: FAIL — `LlmReplyStrategy` not defined.

- [ ] **Step 3: Implement `LlmReplyStrategy`**

Create `packages/infra-ai/src/llm-reply-strategy.ts`:

```typescript
import type { ReplyInput, ReplyStrategy } from '@pouch/domain';
import { isOk } from '@pouch/shared';

import type { LLMProvider } from './llm-provider';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * Composes a conversational success reply via the LLM. On ANY failure it falls
 * back to a deterministic, brand-aware template so the agent always responds.
 */
export class LlmReplyStrategy implements ReplyStrategy {
  constructor(private readonly llm: LLMProvider) {}

  async buildReply(input: ReplyInput): Promise<string> {
    const fallback = () => templateReply(input);

    try {
      const result = await this.llm.generateText({
        systemInstruction: POUCH_SYSTEM_PROMPT,
        message: replyPrompt(input),
      });

      if (!isOk(result) || !result.value.trim()) {
        return fallback();
      }
      return result.value.trim();
    } catch {
      return fallback();
    }
  }
}

function replyPrompt(input: ReplyInput): string {
  const { intent, result, order } = input;
  const brand = (order?.product.brand ?? intent.brand ?? 'your selected product').toString();
  const amount = intent.amount.value.toFixed(2);
  const orderId = result.orderId;
  const status = result.status;
  return [
    `The cash-out just completed successfully. Write a single short, friendly sentence to the user confirming it.`,
    `Details — brand: ${brand}; amount: $${amount}; order id: ${orderId}; status: ${status}.`,
    `Do not invent a gift card code. Do not mention wallets, chains, or gas. Address the user directly.`,
  ].join(' ');
}

function templateReply(input: ReplyInput): string {
  const { intent, result, order } = input;
  const rawBrand = order?.product.brand ?? intent.brand;
  const displayBrand = rawBrand
    ? rawBrand
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0]?.toUpperCase() + w.slice(1))
        .join(' ')
    : 'your selected product';
  return `Done — your ${displayBrand} cash-out for $${intent.amount.value.toFixed(2)} is ${result.status} (order ${result.orderId}).`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: PASS (all suites).

- [ ] **Step 5: Re-export from the barrel**

Update `packages/infra-ai/src/index.ts` (add):

```typescript
export { LlmReplyStrategy } from './llm-reply-strategy';
```

- [ ] **Step 6: Commit**

```bash
git add packages/infra-ai/src/llm-reply-strategy.ts packages/infra-ai/__tests__/llm-reply-strategy.test.ts packages/infra-ai/src/index.ts
git commit -m "feat(infra-ai): add LlmReplyStrategy (conversational reply, template fallback)"
```

---

## Task 9: Factory (`createLlmProvider` / `createIntentParser` / `createReplyStrategy`) + `index.ts`

The composition root for the package. It reads config, constructs the real `GoogleGenAI` client only when `LLM_PROVIDER` is set, and exposes injectable parsers/strategies. This is the **only** place that imports `@google/genai`, so the SDK is a peer of configuration, not of the pure units.

**Files:**
- Create: `packages/infra-ai/src/factory.ts`
- Modify: `packages/infra-ai/src/index.ts` (final barrel)
- Modify: `packages/infra-ai/package.json` (add `@google/genai` dependency)

- [ ] **Step 1: Add the SDK dependency**

In `packages/infra-ai/package.json`, add to `dependencies`:

```json
    "@google/genai": "^1.27.0"
```

(The `@google/genai` unified SDK; pin a `^1.x` minor. If install resolves a newer 1.x, that is fine.)

Run: `pnpm install`
Expected: `@google/genai` installed into `packages/infra-ai/node_modules`.

- [ ] **Step 2: Write the failing test for the factory**

Create `packages/infra-ai/__tests__/factory.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { Config } from '@pouch/shared';
import type { IntentParserStrategy, ReplyStrategy } from '@pouch/domain';

import { createAgentLlm, createIntentParser, createLlmProvider, createReplyStrategy } from '../src/factory';

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    SETTLEMENT_CHAIN_ID: 42161,
    SUPPORTED_CHAINS: [42161, 8453],
    OFFRAMP_PROVIDERS: ['bitrefill'],
    BITREFILL_BASE_URL: 'https://api.bitrefill.com/v2',
    RELOADLY_TOPUPS_BASE_URL: 'https://topups.reloadly.com',
    RELOADLY_GIFTCARDS_BASE_URL: 'https://giftcards.reloadly.com',
    RELOADLY_ESIMS_BASE_URL: 'https://esims.reloadly.com',
    RELOADLY_AUTH_URL: 'https://auth.reloadly.com/oauth/token',
    DEMO_USER_BALANCE_USD: 150,
    DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
    JWT_SECRET: 'a'.repeat(40),
    WEBHOOK_SECRET: 'b'.repeat(40),
    ...overrides,
  } as unknown as Config;
}

describe('createLlmProvider', () => {
  it('returns undefined when no provider configured', () => {
    expect(createLlmProvider(baseConfig())).toBeUndefined();
  });

  it('returns undefined when provider set but key missing', () => {
    expect(createLlmProvider(baseConfig({ LLM_PROVIDER: 'gemini' }))).toBeUndefined();
  });

  it('returns a provider when configured', () => {
    const provider = createLlmProvider(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key' }),
    );
    expect(provider).toBeDefined();
  });
});

describe('createIntentParser', () => {
  it('returns a parser with an async parse when LLM_PROVIDER=gemini + key present', () => {
    const parser = createIntentParser(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key', LLM_MODEL: 'gemini-2.0-flash' }),
    );
    expect(typeof (parser as IntentParserStrategy).parse).toBe('function');
  });

  it('still returns a parser when the LLM key is missing (regex fallback)', () => {
    const parser = createIntentParser(baseConfig({ LLM_PROVIDER: 'gemini' }));
    expect(typeof (parser as IntentParserStrategy).parse).toBe('function');
  });
});

describe('createReplyStrategy', () => {
  it('returns undefined when no LLM provider is given', () => {
    expect(createReplyStrategy(baseConfig(), undefined)).toBeUndefined();
  });

  it('returns an LlmReplyStrategy when a provider is supplied', () => {
    const provider = createLlmProvider(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key' }),
    );
    const strategy = createReplyStrategy(baseConfig(), provider);
    expect(strategy).toBeDefined();
    expect(typeof (strategy as ReplyStrategy | undefined)?.buildReply).toBe('function');
  });
});

describe('createAgentLlm', () => {
  it('returns the regex parser + undefined strategy when not configured', () => {
    const { intentParser, replyStrategy } = createAgentLlm(baseConfig());
    expect(typeof (intentParser as IntentParserStrategy).parse).toBe('function');
    expect(replyStrategy).toBeUndefined();
  });

  it('returns an LLM parser + reply strategy sharing one provider when configured', () => {
    const { intentParser, replyStrategy } = createAgentLlm(
      baseConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'fake-key' }),
    );
    expect(typeof (intentParser as IntentParserStrategy).parse).toBe('function');
    expect(replyStrategy).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: FAIL — `createLlmProvider` etc. not exported.

- [ ] **Step 4: Implement the factory**

Create `packages/infra-ai/src/factory.ts`:

```typescript
import { GoogleGenAI } from '@google/genai';
import { IntentParser, type IntentParserStrategy, type ReplyStrategy } from '@pouch/domain';
import type { Config } from '@pouch/shared';

import type { GeminiClient } from './gemini-client';
import { GeminiProvider } from './gemini-provider';
import { LlmIntentParser } from './llm-intent-parser';
import { LlmReplyStrategy } from './llm-reply-strategy';
import type { LLMProvider } from './llm-provider';
import { POUCH_TOOL_DECLARATIONS } from './llm-tools';

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Constructs the LLMProvider when configuration is complete and valid.
 * Returns undefined when: no provider set, OR provider set but its key is
 * missing. Callers then fall back to the regex parser. This is the ONLY file
 * that imports @google/genai — the SDK never reaches the pure units.
 */
export function createLlmProvider(config: Config): LLMProvider | undefined {
  if (config.LLM_PROVIDER !== 'gemini') {
    return undefined;
  }
  if (!config.GEMINI_API_KEY) {
    return undefined;
  }

  const client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }) as GeminiClient;
  const model = config.LLM_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return new GeminiProvider(client, model);
}

/**
 * Returns the parser to use: LLM-backed when fully configured, else regex.
 * The regex parser is the always-works fallback (spec §7).
 */
export function createIntentParser(config: Config): IntentParserStrategy {
  const provider = createLlmProvider(config);
  if (!provider) {
    return new IntentParser();
  }
  return new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);
}

/**
 * Returns the reply strategy when an LLM provider exists, else undefined
 * (the AgentChatService then uses its inline template).
 */
export function createReplyStrategy(_config: Config, provider: LLMProvider | undefined): ReplyStrategy | undefined {
  if (!provider) {
    return undefined;
  }
  return new LlmReplyStrategy(provider);
}

/**
 * Builds the parser + reply strategy together, sharing ONE LLMProvider
 * instance (avoids constructing two SDK clients). This is what the API's
 * composition root calls. Returns the regex parser + undefined strategy when
 * the LLM is not configured, so the caller can pass them through unchanged.
 */
export function createAgentLlm(
  config: Config,
): { intentParser: IntentParserStrategy; replyStrategy: ReplyStrategy | undefined } {
  const provider = createLlmProvider(config);
  if (!provider) {
    return { intentParser: new IntentParser(), replyStrategy: undefined };
  }
  return {
    intentParser: new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS),
    replyStrategy: new LlmReplyStrategy(provider),
  };
}
```

> **Note on the static import:** `packages/infra-ai` is `"type": "module"`, so `require()` does not work — a top-level ESM `import` is the correct form. The SDK module is only *evaluated* when `createLlmProvider` runs (which the composition root calls conditionally), so the regex-only demo path pays nothing at boot.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @pouch/infra-ai test`
Expected: PASS (factory tests + all prior suites).

- [ ] **Step 6: Finalize the barrel**

Replace `packages/infra-ai/src/index.ts` with:

```typescript
export * from './llm-provider';
export * from './llm-tools';
export { POUCH_SYSTEM_PROMPT } from './system-prompt';
export * from './gemini-client';
export { GeminiProvider } from './gemini-provider';
export { LlmIntentParser } from './llm-intent-parser';
export { LlmReplyStrategy } from './llm-reply-strategy';
export { createLlmProvider, createIntentParser, createReplyStrategy, createAgentLlm } from './factory';
```

- [ ] **Step 7: Commit**

```bash
git add packages/infra-ai/src/factory.ts packages/infra-ai/__tests__/factory.test.ts packages/infra-ai/src/index.ts packages/infra-ai/package.json pnpm-lock.yaml
git commit -m "feat(infra-ai): add factory (createLlmProvider/IntentParser/ReplyStrategy/AgentLlm) + wire @google/genai"
```

---

## Task 10: Wire the LLM layer into `createRuntimeAppServices`

The integration point. When `LLM_PROVIDER` is configured, the runtime builds the LLM parser + reply strategy and passes them to `AgentChatService`. When not configured (or demo mode), behavior is unchanged (regex + template). This is the line that makes the agent "genuine" in configured mode while leaving the demo untouched.

**Files:**
- Modify: `apps/api/package.json` (add `@pouch/infra-ai` dependency)
- Modify: `apps/api/src/bootstrap/create-runtime-app-services.ts`

- [ ] **Step 1: Add the workspace dependency to the API**

In `apps/api/package.json`, add to `dependencies`:

```json
    "@pouch/infra-ai": "workspace:*",
```

Run: `pnpm install`
Expected: `@pouch/infra-ai` linked into the API.

- [ ] **Step 2: Add an integration test for the wiring**

Create `apps/api/__tests__/runtime-llm-wiring.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { createRuntimeAppServices } from '../src/bootstrap/create-runtime-app-services';

function baseEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    SETTLEMENT_CHAIN_ID: '42161',
    SUPPORTED_CHAINS: '42161,8453',
    OFFRAMP_PROVIDERS: 'bitrefill',
    WEB3_PROVIDER_MODE: 'demo',
    DEMO_USER_BALANCE_USD: '150',
    DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
    JWT_SECRET: 'a'.repeat(40),
    WEBHOOK_SECRET: 'b'.repeat(40),
    ...overrides,
  };
}

describe('createRuntimeAppServices — LLM wiring', () => {
  it('boots in configured (demo provider) mode without an LLM and still answers', async () => {
    const services = createRuntimeAppServices({
      env: baseEnv(),
      dependencies: {
        // keep DB/providers inert so it boots into the demo/configured path
        createDatabase: () => ({}),
        createOrderRepository: () => ({
          async save() {},
          async findById() {
            return null;
          },
          async findByProviderOrderId() {
            return null;
          },
          async updateStatus() {},
        }),
        createWebhookEventStore: () => ({
          async has() {
            return true;
          },
          async record() {},
        }),
        createAccountProvider: () => ({
          async getUnifiedBalance() {
            return { ok: true, value: { total: 0, assets: [], requiresConsolidation: false } };
          },
          async consolidate() {
            return { ok: true, value: { txHash: '0x0' } };
          },
          async sendPayment() {
            return { ok: true, value: { txHash: '0x0' } };
          },
        }),
      },
    });

    // It must always return a usable agent service, with or without an LLM.
    expect(services.agentService).toBeDefined();
    expect(typeof services.agentService.handleMessage).toBe('function');
  });

  it('boots with LLM_PROVIDER=gemini but no key and still returns a working agent service', () => {
    const services = createRuntimeAppServices({
      env: baseEnv({ LLM_PROVIDER: 'gemini' }),
      dependencies: {
        createDatabase: () => ({}),
        createOrderRepository: () => ({
          async save() {},
          async findById() {
            return null;
          },
          async findByProviderOrderId() {
            return null;
          },
          async updateStatus() {},
        }),
        createWebhookEventStore: () => ({
          async has() {
            return true;
          },
          async record() {},
        }),
        createAccountProvider: () => ({
          async getUnifiedBalance() {
            return { ok: true, value: { total: 0, assets: [], requiresConsolidation: false } };
          },
          async consolidate() {
            return { ok: true, value: { txHash: '0x0' } };
          },
          async sendPayment() {
            return { ok: true, value: { txHash: '0x0' } };
          },
        }),
      },
    });

    expect(services.agentService).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails (or passes if wiring already inert)**

Run: `pnpm --filter @pouch/api test`
Expected: it should at minimum compile and run. (The wiring change in Step 4 makes the LLM path live.)

- [ ] **Step 4: Wire the factory into `createRuntimeAppServices`**

In `apps/api/src/bootstrap/create-runtime-app-services.ts`, add the import at the top (with the other `@pouch/infra-*` imports):

```typescript
import { createAgentLlm } from '@pouch/infra-ai';
```

Then, in the `try` block, replace the current `return` statement (the one that constructs `agentService: new AgentChatService(new IntentParser(), executor, orderRepository)`) with:

```typescript
    const { intentParser, replyStrategy } = createAgentLlm(config);
    const agentService = replyStrategy
      ? new AgentChatService(intentParser, executor, orderRepository, replyStrategy)
      : new AgentChatService(intentParser, executor, orderRepository);

    return {
      mode: 'configured',
      agentService,
      balanceService: new BalanceService(accountProvider),
      orderService: new OrderService(orderRepository),
      ...(bitrefillWebhookService ? { bitrefillWebhookService } : {}),
    };
```

> The demo path (`createDemoAppServices`) is **untouched** — it keeps `new IntentParser()` and no reply strategy, so dev/tests without a DB or LLM behave exactly as before.

- [ ] **Step 5: Run the wiring test + full API suite**

Run: `pnpm --filter @pouch/api test`
Expected: PASS (new wiring tests + all existing API tests).

- [ ] **Step 6: Run the full quality gate**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green across all 8 packages (the 7 existing + `@pouch/infra-ai`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/bootstrap/create-runtime-app-services.ts apps/api/__tests__/runtime-llm-wiring.test.ts packages/infra-ai/src/factory.ts packages/infra-ai/src/index.ts pnpm-lock.yaml
git commit -m "feat(api): wire infra-ai LLM parser + reply strategy into the runtime composition root"
```

---

## Task 11: End-to-end verification + docs sync

Final gate. No new code beyond a smoke check and doc updates. Confirms the whole monorepo is green and the HANDOFF reflects Phase 2 status.

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `AGENTS.md` (status line only)

- [ ] **Step 1: Run the complete quality gate**

Run:
```bash
pnpm install
pnpm typecheck   # expect 8/8 packages
pnpm test        # expect all green (baseline 56 + new infra-ai + wiring tests)
pnpm build       # expect 8/8 packages
```
Expected: all green. Record the actual test count.

- [ ] **Step 2: Smoke-check the regex fallback path (no real API key)**

With `LLM_PROVIDER` unset (or `GEMINI_API_KEY` empty), hit the chat endpoint locally and confirm a cash-out still works end-to-end via regex:

```bash
pnpm dev:api &
sleep 3
curl -s -X POST http://localhost:3000/agent/chat \
  -H 'content-type: application/json' \
  -d '{"message":"cash out $50 to amazon"}' | head -c 400
kill %1
```
Expected: a 200 JSON body containing `reply`, `intent.action === "cash_out"`, and a `trace` array. (Exact port may differ if the API listens elsewhere — check `apps/api/src/server.ts`. If the port is different, adjust.)

- [ ] **Step 3: Confirm the LLM path loads without crashing (key present, no network needed for boot)**

```bash
GEMINI_API_KEY=fake-but-present LLM_PROVIDER=gemini pnpm dev:api &
sleep 3
# boot reaching "listening" proves the SDK + factory wire up; we do NOT call the network here
kill %1
```
Expected: the server boots without throwing (the real Gemini call only happens on a chat message, and would fall back to regex if the fake key is rejected).

- [ ] **Step 4: Update `docs/HANDOFF.md`**

In the "Phase status" section, mark Phase 2 as code-complete:

```markdown
### Phase 2 — LLM layer (DONE — code complete; real API key optional)
- ✅ `packages/infra-ai/` — LLMProvider interface + GeminiProvider (@google/genai function-calling)
- ✅ LlmIntentParser (implements IntentParserStrategy) with regex fallback on any failure
- ✅ ReplyStrategy port (domain) + LlmReplyStrategy (conversational reply, template fallback)
- ✅ Factory + wired into createRuntimeAppServices (LLM when configured, regex + template otherwise)
- ✅ IntentParserStrategy made async (required to host the async LLM call)
- ⏭️ Real GEMINI_API_KEY supplied by admin at demo time (regex always works without it)
```

And under "Implemented API surface", no new route (same `/agent/chat`, now smarter).

- [ ] **Step 5: Update `AGENTS.md` status line**

Change the top status line to reflect Phase 2 done:

```markdown
> Last updated: 2026-07-14. Project status: **Phase 2 — LLM layer (code complete); Phase 3 — Frontend (next)**.
```

And in the "Current phase & status" checklist, tick the LLM line:

```markdown
- [x] LLM layer — Phase 2 (infra-ai + Gemini function-calling + regex fallback + ReplyStrategy)
```

- [ ] **Step 6: Commit**

```bash
git add docs/HANDOFF.md AGENTS.md
git commit -m "docs: mark Phase 2 (LLM layer) code-complete; Phase 3 frontend is next"
```

---

## Self-review notes (designer's checklist, for the implementer's awareness)

- **Spec coverage (§7):**
  - Function-calling contract (`cash_out`, `check_balance`, `search_products`, `off_topic`) → declared in Task 4. Only `cash_out` is mapped to an executable intent in Phase 2; the others trigger regex fallback. This is deliberate Phase 2 scope (off-topic multi-turn conversation is a Phase 3 frontend concern). The seam is open.
  - Regex fallback chain (Gemini → regex) → Task 6 (parser) + Task 8 (reply). Resilience on every failure mode.
  - System prompt → Task 4.
  - Provider-agnostic interface (add OpenAI/Anthropic = one file) → Task 3 + Task 5.
  - Domain isolation preserved (no SDK in domain) → SDK imported only in Task 9 factory.
  - Config (`LLM_PROVIDER` / `GEMINI_API_KEY` / `LLM_MODEL`) already in Zod (Phase 0) — no schema change needed; the factory treats a missing key as "use regex".

- **Type consistency:** `IntentParserStrategy.parse` is `Promise<Result<CashOutIntent, DomainError>>` everywhere after Task 1. `ReplyStrategy.buildReply(input: ReplyInput): Promise<string>`. `LLMProvider` returns `Result<_, DomainError>`. `GeminiClient` is structural; the real `GoogleGenAI` satisfies it.

- **Risks & mitigations:**
  - **`@google/genai` SDK surface assumptions:** `GeminiClient` (Task 5) is a structural duck-type for `client.models.generateContent({ model, contents, config })` returning `{ functionCalls?: [...], text? }` — the convenience accessors the unified SDK documents. If the installed `^1.x` version exposes a different shape (e.g. `response.candidates[0].content.parts[0].functionCall`), `GeminiProvider` must read from that path instead. Keep `GeminiClient` as the single place that shape is declared so the fix is localized. Verify by running Task 11 Step 3 (boot with a fake key) — if it throws on module load, the response-shape adapter is the place to look.
  - **`exactOptionalPropertyTypes: true`** is on. The optional `replyStrategy?: ReplyStrategy` must never be passed as an explicit `undefined`. The runtime wiring in Task 10 Step 4 handles this with a conditional `agentService` construction. Verify with `pnpm typecheck`.
  - **Test count:** baseline is 56. After Phase 2 it will be higher (llm-tools ~6, gemini-provider ~6, llm-intent-parser ~5, llm-reply-strategy ~4, factory ~6, runtime-wiring ~2). Record the real number in Task 11 Step 1.
