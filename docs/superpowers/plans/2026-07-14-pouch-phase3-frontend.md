# Pouch — Phase 3: Frontend (Magic login + chat UI + agent trace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static landing placeholder in `apps/web` with a real conversational cash-out UI: Magic embedded-wallet login (zero-popup blind signatures), a chat interface that talks to `/agent/chat`, live agent-trace rendering, balance display, and an order/receipt view — all styled with Tailwind on the existing dark-navy identity, working against the API's demo mode out of the box.

**Architecture:** Next.js 15 App Router, single route `/` with a Magic modal → authenticated chat view (lazy-gated on session). A React Context owns session + chat state; a thin typed fetch wrapper proxies to the API via `next.config.ts` rewrites (same-origin, so the httpOnly `pouch_session` cookie flows without CORS). The signing seam (UA 7702) is deferred to a final optional sub-phase — the chat works end-to-end in demo mode first, exactly as the backend already supports. Domain types are imported from `@pouch/domain` so the frontend is typed against the same contracts as the API.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, `magic-sdk` + `@magic-ext/evm` (client login + 7702 signing seam), `@pouch/domain` + `@pouch/shared` (types, `Result`), TypeScript (strict).

**Spec source of truth:** `docs/superpowers/specs/2026-07-13-pouch-offramp-agent-design.md` (demo script + UX), `docs/HANDOFF.md` (verified API surface + auth seam).

---

## How this phase fits the roadmap

- **Depends on:** Phase 0 (domain types / `TraceStep`), Phase 1 (auth `/auth/callback` + `/transactions/plan/*` seam), Phase 2 (LLM conversational replies in `/agent/chat`). All are merged to `main`.
- **Runtime prerequisite satisfied:** the Phase 1 runtime blocker is FIXED — `pnpm dev:api` boots. The frontend can develop against a live API.
- **Demo-first sequencing (user-confirmed):** Tasks 1–13 deliver a working chat against API demo mode (no real signing). Task 14 (UA 7702 signing) is the optional final sub-phase, gated on Manual Gate 1 (the UA spike) being run.
- **Hackathon deadline:** Jul 20, 2026. UX excellence is 40% of the UA Track score — this phase is where that score is won or lost.
- **English-only UI** (judges are international). Comments/docs may be bilingual.

---

## Design decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Styling | Tailwind CSS v4 | Atomic utilities, fast iteration, no CSS-in-JS; migrate the inline landing styles |
| Signing depth | Demo-first, UA 7702 signing last | Working chat ASAP; signing gated on the manual UA spike |
| Auth UX | Landing → Magic modal → chat on `/` | One route, demo-centric, simplest for judges |
| State | React hooks + Context | No extra deps; sufficient for chat + few endpoints |

---

## File structure (what gets created / modified)

**`apps/web/` — config & infra:**
- `package.json` — add `magic-sdk`, `@magic-ext/evm`, `tailwindcss` (+ `@tailwindcss/postcss`). *(ethers added only in Task 14.)*
- `postcss.config.mjs` — PostCSS with the Tailwind plugin.
- `src/app/globals.css` — Tailwind import + design tokens (CSS vars for the navy palette).
- `next.config.ts` — add `rewrites()` proxying `/api/*` → `http://localhost:3001/*` (same-origin cookie flow).
- `.env.local` (gitignored; `.env.example` updated) — `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_BASE_URL` (defaults to `/api` via the proxy).

**`apps/web/src/lib/` — typed API client + Magic:**
- `api-client.ts` — thin `fetch` wrapper: `apiPost(path, body)`, `apiGet(path)`. Returns `Promise<T>`; throws `ApiError` with `{ status, message, type? }`. All calls use `credentials: 'include'`.
- `magic-client.ts` — singleton `Magic` instance (lazy, client-only, gated on `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY`). Exposes `getMagic()`, `loginWithEmail(email)`, `isLoggedIn()`, `getEvmAddress()`, `logout()`.
- `types.ts` — re-export + narrow the frontend-facing shapes from `@pouch/domain` (`AgentChatResponse`, `TraceStep`, `Balance`, `Order`, `CashOutIntent`).

**`apps/web/src/context/` — session + chat state:**
- `session-context.tsx` — `SessionProvider` + `useSession()`. Holds `{ status: 'loading'|'anonymous'|'authenticated', userId?, evmAddress? }`. On mount, checks Magic `isLoggedIn()` and calls `/auth/callback` with the DID if a Magic session exists; else anonymous. Provides `login(email)` + `logout()`.
- `chat-context.tsx` — `ChatProvider` + `useChat()`. Holds `messages: ChatMessage[]` (user + agent turns, each agent turn carrying the `AgentChatResponse`), `sendMessage(text)`, `isSending`, `error`. `sendMessage` posts to `/agent/chat` via the API client and appends the response.

**`apps/web/src/components/` — UI (Tailwind, server/client split):**
- `landing/Landing.tsx` — server component. Public hero (migrated from current `page.tsx` content) + a "Connect wallet" button that opens the Magic modal.
- `landing/MagicLoginModal.tsx` — client. Email input → `loginWithEmail` → spinner → error. Calls `session.login`.
- `chat/ChatView.tsx` — client. The authenticated experience: header (logo + balance pill + logout), `MessageList`, `ChatInput`. Orchestrates `useSession` + `useChat`.
- `chat/MessageList.tsx` — client. Renders the conversation; user bubbles vs agent bubbles; renders the trace + receipt inside the agent turn.
- `chat/AgentTurn.tsx` — client. For a given agent message: the `reply` text, the inline `TraceTimeline`, and (if delivered) the `ReceiptCard`.
- `chat/TraceTimeline.tsx` — client. Maps `TraceStep[]` to a vertical timeline with status icons (pending/active/complete/error) + badges (`cheapest`, `UA 7702`, `NO POPUP`).
- `chat/ReceiptCard.tsx` — client. Shows the order outcome: face value, provider, redemption code/link (when present). Polls `GET /orders/:id` to refresh status after a webhook.
- `chat/ChatInput.tsx` — client. Textarea + send button; Enter to send, Shift+Enter newline; disabled while `isSending`.
- `chat/BalancePill.tsx` — client. Fetches `GET /balance` on mount + after each successful cash-out; shows `$total` + asset count; click expands the asset breakdown.
- `ui/` — small primitives: `Button.tsx`, `Spinner.tsx`, `ErrorMessage.tsx` (Tailwind-styled, reused across the above).

**`apps/web/src/app/` — routes:**
- `page.tsx` — server component shell: reads session status via a cookie/header check; renders `<Landing/>` if anonymous or `<ChatView/>` if authenticated. (Client `SessionGate` handles the switch reactively after hydration.)
- `layout.tsx` — wraps children in `<SessionProvider>`; imports `globals.css`.
- `loading.tsx` — Next streaming fallback (centered spinner).

**Optional signing sub-phase (Task 14):**
- `apps/web/src/lib/ua-signer.ts` — wraps the `/transactions/plan/*` → Magic `sign7702Authorization` → `sendTransaction` flow. `ethers@^6` added to `package.json` here, not before.

---

## API contract reference (verified, from the live API)

The frontend talks to these (all via the `/api` same-origin proxy, `credentials: 'include'`):

| Endpoint | Method | Body | Response | Auth |
|----------|--------|------|----------|------|
| `/api/agent/chat` | POST | `{ message: string, userId?: string }` | `AgentChatResponse` (`{ orderId, status, trace, intent, reply }`) | cookie (demo-fallback) |
| `/api/balance` | GET | — | `Balance & { userId }` | cookie (demo-fallback) |
| `/api/orders/:id` | GET | — | `Order` | cookie (demo-fallback) |
| `/api/auth/callback` | POST | `{ didToken: string }` | `{ userId, evmAddress }` + sets `pouch_session` | public |
| `/api/auth/logout` | POST | — | `{ ok: true }` | public |

`TraceStep` shape: `{ id, label, status: 'pending'|'active'|'complete'|'error', durationMs?, badge?, detail? }`.

Full types live in `packages/domain/src/{types,trace}.ts` and are re-exported from `@pouch/domain`. Import them — do not redefine.

---

## Task 1: Install Tailwind v4 + design tokens

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add Tailwind dependencies**

Run from repo root:
```bash
pnpm --filter @pouch/web add tailwindcss@^4 @tailwindcss/postcss@^4
```
Expected: `tailwindcss` + `@tailwindcss/postcss` added under `apps/web/package.json` dependencies.

- [ ] **Step 2: Create PostCSS config**

Create `apps/web/postcss.config.mjs`:
```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
export default config;
```

- [ ] **Step 3: Create globals.css with tokens + Tailwind import**

Create `apps/web/src/app/globals.css`:
```css
@import 'tailwindcss';

:root {
  --bg: #0b1020;
  --fg: #f5f7ff;
  --accent: #264fff;
  --muted: #9db0ff;
  --muted-2: #d8deff;
  --card: rgba(38, 79, 255, 0.08);
  --border: rgba(157, 176, 255, 0.18);
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: Inter, system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 4: Import globals.css in the layout**

Modify `apps/web/src/app/layout.tsx` — add this import at the top (keep all existing layout code, just add the import):
```tsx
import './globals.css';
```

- [ ] **Step 5: Verify the dev server compiles with Tailwind**

Run:
```bash
pnpm --filter @pouch/web dev
```
Expected: Next dev server starts on `:3000` without PostCSS/Tailwind errors. Open `http://localhost:3000` — the existing page should still render (inline styles still apply; Tailwind is loaded but unused so far). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/postcss.config.mjs apps/web/src/app/globals.css apps/web/src/app/layout.tsx pnpm-lock.yaml
git commit -m "feat(web): add Tailwind v4 + design tokens (globals.css)"
```

---

## Task 2: Same-origin API proxy + env wiring

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `.env.example` (repo root)
- Create: `apps/web/.env.local.example`

- [ ] **Step 1: Add rewrites() proxy to next.config.ts**

Read the current `apps/web/next.config.ts` first. Then modify it to:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL ?? 'http://localhost:3001'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```
Note: the destination uses the server-side `API_BASE_URL` (no `NEXT_PUBLIC_` prefix) because rewrites run server-side in Next. The browser always calls `/api/*` (same-origin → cookie flows).

- [ ] **Step 2: Add env vars to .env.example**

In repo-root `.env.example`, append (after the existing `MAGIC_*` lines):
```
# Frontend (apps/web) — client-exposed
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=
# Used by next.config.ts rewrites (server-side only)
API_BASE_URL=http://localhost:3001
```

- [ ] **Step 3: Create a local env example for the web app**

Create `apps/web/.env.local.example`:
```
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=pk_live_your_magic_publishable_key
```
(The rewrite target `API_BASE_URL` belongs at the repo root since `next.config.ts` reads it from the repo-root env when turbo runs. Document this in a comment if helpful.)

- [ ] **Step 4: Verify the proxy routes**

Start the API in one terminal:
```bash
pnpm dev:api   # expect "Pouch API listening on http://localhost:3001"
```
In another terminal:
```bash
pnpm --filter @pouch/web dev
```
Open `http://localhost:3000/api/health` in a browser. Expected: JSON `{ ok: true, service: 'api', mode: 'demo' }`. (This proves the proxy + cookie path work.) Stop both servers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts apps/web/.env.local.example .env.example
git commit -m "feat(web): add same-origin /api proxy rewrites + env wiring"
```

---

## Task 3: Typed API client

**Files:**
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Create the frontend-facing type re-exports**

Create `apps/web/src/lib/types.ts`:
```ts
import type {
  AgentChatResponse,
  Balance,
  Order,
  TraceStep,
} from '@pouch/domain';

// The API merges userId into the Balance response.
export type BalanceResponse = Balance & { userId: string };

export type {
  AgentChatResponse,
  Balance,
  Order,
  TraceStep,
};

// What we send to /agent/chat.
export interface AgentChatRequest {
  message: string;
  userId?: string;
}

// The auth callback bodies.
export interface AuthCallbackRequest {
  didToken: string;
}
export interface AuthCallbackResponse {
  userId: string;
  evmAddress: string;
}
```

- [ ] **Step 2: Write the failing test for the API client**

Create `apps/web/src/lib/api-client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost, ApiError } from './api-client';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('api-client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('apiPost sends JSON with credentials and returns parsed body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true }));
    const result = await apiPost<{ ok: boolean }>('/auth/logout', null);
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('apiGet sends credentials and returns parsed body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ total: 150 }));
    const result = await apiGet<{ total: number }>('/balance');
    expect(result).toEqual({ total: 150 });
  });

  it('throws ApiError with status + message on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({ error: 'nope', type: 'UNKNOWN' }, 500),
    );
    await expect(apiGet('/balance')).rejects.toMatchObject({
      status: 500,
      message: 'nope',
      type: 'UNKNOWN',
    });
    await expect(apiGet('/balance')).rejects.toBeInstanceOf(ApiError);
  });

  it('omits body when null is passed to apiPost', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({}));
    await apiPost('/auth/logout', null);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: FAIL — `Cannot find module './api-client'`.

- [ ] **Step 4: Implement the API client**

Create `apps/web/src/lib/api-client.ts`:
```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly type?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(res: Response): Promise<never> {
  let message = res.statusText;
  let type: string | undefined;
  try {
    const body = (await res.json()) as { error?: string; type?: string };
    if (body.error) message = body.error;
    if (body.type) type = body.type;
  } catch {
    // non-JSON body — keep statusText
  }
  throw new ApiError(res.status, message, type);
}

const BASE = '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body === null ? { accept: 'application/json' } : { 'content-type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Verify typecheck**

Run:
```bash
pnpm --filter @pouch/web typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/api-client.test.ts apps/web/src/lib/types.ts
git commit -m "feat(web): add typed API client (apiGet/apiPost + ApiError)"
```

---

## Task 4: UI primitives (Button, Spinner, ErrorMessage)

**Files:**
- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/Spinner.tsx`
- Create: `apps/web/src/components/ui/ErrorMessage.tsx`

- [ ] **Step 1: Create Button**

Create `apps/web/src/components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-[var(--accent)] text-white hover:brightness-110',
    ghost: 'bg-transparent text-[var(--muted-2)] hover:bg-white/5',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create Spinner**

Create `apps/web/src/components/ui/Spinner.tsx`:
```tsx
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent" />
      {label ? <span className="text-sm">{label}</span> : null}
    </span>
  );
}
```

- [ ] **Step 3: Create ErrorMessage**

Create `apps/web/src/components/ui/ErrorMessage.tsx`:
```tsx
export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
    >
      {children}
    </p>
  );
}
```

- [ ] **Step 4: Verify typecheck + build**

Run:
```bash
pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web build
```
Expected: both pass (components are not yet used but must compile).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): add Button, Spinner, ErrorMessage UI primitives"
```

---

## Task 5: Magic client wrapper

**Files:**
- Modify: `apps/web/package.json` (add magic-sdk + @magic-ext/evm)
- Create: `apps/web/src/lib/magic-client.ts`

- [ ] **Step 1: Install Magic client SDKs**

Run:
```bash
pnpm --filter @pouch/web add magic-sdk @magic-ext/evm
```
Expected: both added to `apps/web/package.json`.

- [ ] **Step 2: Write the failing test (module shape + graceful no-key)**

Create `apps/web/src/lib/magic-client.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { getMagic, hasMagicConfig } from './magic-client';

describe('magic-client', () => {
  it('hasMagicConfig is false when NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY is unset', () => {
    const original = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    expect(hasMagicConfig()).toBe(false);
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = original;
  });

  it('hasMagicConfig is true when the key is set', () => {
    const original = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = 'pk_test_x';
    expect(hasMagicConfig()).toBe(true);
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = original;
  });

  it('getMagic throws a clear error when no key is configured', () => {
    const original = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
    expect(() => getMagic()).toThrow(/NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY/);
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY = original;
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the Magic client wrapper**

Create `apps/web/src/lib/magic-client.ts`:
```ts
import { Magic } from 'magic-sdk';
import { EthExtension } from '@magic-ext/evm';

let instance: Magic | null = null;

export function hasMagicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY);
}

// Lazy singleton. Client-only — never call this during SSR.
export function getMagic(): Magic {
  if (instance) return instance;
  const key = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY is not set. Add it to apps/web/.env.local.',
    );
  }
  instance = new Magic(key, {
    extensions: [new EthExtension()],
    network: 'mainnet',
  });
  return instance;
}

export async function loginWithEmail(email: string): Promise<string> {
  const magic = getMagic();
  // Blind-signature flow: Magic emits a DID token without a wallet popup.
  const did = await magic.auth.loginWithMagicLink({ email });
  if (!did) throw new Error('Magic login did not return a DID token.');
  return did;
}

export async function isLoggedIn(): Promise<boolean> {
  if (!hasMagicConfig()) return false;
  try {
    return await getMagic().user.isLoggedIn();
  } catch {
    return false;
  }
}

export async function getEvmAddress(): Promise<string> {
  const info = await getMagic().user.getInfo();
  if (!info?.publicAddress) throw new Error('Magic session has no public address.');
  return info.publicAddress;
}

export async function logout(): Promise<void> {
  if (await isLoggedIn()) {
    await getMagic().user.logout();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: PASS — 3 tests green. (The `getMagic` error-path test does not construct a real client, so no network.)

- [ ] **Step 6: Verify typecheck**

Run:
```bash
pnpm --filter @pouch/web typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/magic-client.ts apps/web/src/lib/magic-client.test.ts pnpm-lock.yaml
git commit -m "feat(web): add Magic client wrapper (lazy singleton, blind-signature login)"
```

---

## Task 6: Session context (Magic login → /auth/callback → session)

**Files:**
- Create: `apps/web/src/context/session-context.tsx`

- [ ] **Step 1: Write the failing test for session logic**

Create `apps/web/src/context/session-context.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the API client + magic-client before importing the module under test.
vi.mock('../lib/api-client', () => ({
  apiPost: vi.fn(),
}));
vi.mock('../lib/magic-client', () => ({
  hasMagicConfig: vi.fn(() => false),
  isLoggedIn: vi.fn(),
  loginWithEmail: vi.fn(),
  getEvmAddress: vi.fn(),
  logout: vi.fn(),
}));

import { apiPost } from '../lib/api-client';
import { loginWithEmail, logout as magicLogout } from '../lib/magic-client';
import { authenticateWithDid, signOut } from './session-context';

describe('session-context helpers', () => {
  afterEach(() => vi.clearAllMocks());

  it('authenticateWithDid posts the DID to /auth/callback and returns the session', async () => {
    vi.mocked(apiPost).mockResolvedValue({ userId: 'u1', evmAddress: '0xabc' });
    const session = await authenticateWithDid('did-token-xyz');
    expect(apiPost).toHaveBeenCalledWith('/auth/callback', { didToken: 'did-token-xyz' });
    expect(session).toEqual({ userId: 'u1', evmAddress: '0xabc' });
  });

  it('signOut calls magic logout then /auth/logout', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true });
    await signOut();
    expect(magicLogout).toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith('/auth/logout', null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the session context + exported helpers**

Create `apps/web/src/context/session-context.tsx`:
```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiPost } from '../lib/api-client';
import { getEvmAddress, hasMagicConfig, isLoggedIn, loginWithEmail, logout as magicLogout } from '../lib/magic-client';

export interface Session {
  userId: string;
  evmAddress: string;
}

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

interface SessionContextValue {
  status: SessionStatus;
  session: Session | null;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Exported for testing (pure, no React).
export async function authenticateWithDid(didToken: string): Promise<Session> {
  return apiPost<Session>('/auth/callback', { didToken });
}

export async function signOut(): Promise<void> {
  await magicLogout();
  await apiPost<{ ok: boolean }>('/auth/logout', null);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  // On mount: if a Magic session already exists, re-establish our cookie session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasMagicConfig()) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          if (!cancelled) setStatus('anonymous');
          return;
        }
        // We have a Magic session but may need a fresh DID for our backend.
        // Magic's user.getInfo is enough to read the address; we skip re-minting
        // the cookie here — the cookie persists server-side for 7 days. Only
        // re-auth if the cookie is somehow absent (handled on API 401 elsewhere).
        const evmAddress = await getEvmAddress();
        if (!cancelled) {
          setSession({ userId: evmAddress, evmAddress });
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string) => {
    const did = await loginWithEmail(email);
    const next = await authenticateWithDid(did);
    setSession(next);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setSession(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, session, login, logout }),
    [status, session, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: PASS — 2 tests green.

- [ ] **Step 5: Wire SessionProvider into the layout**

Modify `apps/web/src/app/layout.tsx` — wrap `{children}` with `<SessionProvider>`. The file currently exports a default `RootLayout` returning `<html><body>{children}</body></html>`. Wrap children:
```tsx
import './globals.css';
import { SessionProvider } from '../context/session-context';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```
(Preserve any existing `<head>`/metadata if present; the key change is importing `globals.css` + wrapping with `<SessionProvider>`.)

- [ ] **Step 6: Verify typecheck + build**

Run:
```bash
pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web build
```
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/context/session-context.tsx apps/web/src/context/session-context.test.ts apps/web/src/app/layout.tsx
git commit -m "feat(web): add SessionProvider (Magic login → /auth/callback → session)"
```

---

## Task 7: Chat context (send message → /agent/chat)

**Files:**
- Create: `apps/web/src/context/chat-context.tsx`

- [ ] **Step 1: Define ChatMessage type + write the failing test**

Create `apps/web/src/context/chat-context.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatResponse } from '@pouch/domain';

vi.mock('../lib/api-client', () => ({ apiPost: vi.fn() }));
import { apiPost } from '../lib/api-client';
import { sendChatMessage } from './chat-context';

const fakeAgentResponse: AgentChatResponse = {
  orderId: 'order-1',
  status: 'delivered',
  trace: [],
  intent: {
    action: 'cash_out',
    category: 'giftcard',
    amount: { value: 25, currency: 'USD' },
  },
  reply: 'Done.',
};

describe('chat-context helpers', () => {
  afterEach(() => vi.clearAllMocks());

  it('sendChatMessage posts to /agent/chat and returns the AgentChatResponse', async () => {
    vi.mocked(apiPost).mockResolvedValue(fakeAgentResponse);
    const result = await sendChatMessage('Cash out $25 to Amazon', 'demo-user');
    expect(apiPost).toHaveBeenCalledWith('/agent/chat', {
      message: 'Cash out $25 to Amazon',
      userId: 'demo-user',
    });
    expect(result.reply).toBe('Done.');
  });

  it('sendChatMessage omits userId when undefined', async () => {
    vi.mocked(apiPost).mockResolvedValue(fakeAgentResponse);
    await sendChatMessage('hello');
    expect(apiPost).toHaveBeenCalledWith('/agent/chat', { message: 'hello' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chat context**

Create `apps/web/src/context/chat-context.tsx`:
```tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AgentChatResponse } from '@pouch/domain';
import { apiPost, ApiError } from '../lib/api-client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  // user messages have text; agent messages carry the full response.
  text?: string;
  response?: AgentChatResponse;
}

interface ChatContextValue {
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  sendMessage: (text: string, userId?: string) => Promise<void>;
  clearError: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Exported for testing (pure).
export async function sendChatMessage(message: string, userId?: string): Promise<AgentChatResponse> {
  const body = userId ? { message, userId } : { message };
  return apiPost<AgentChatResponse>('/agent/chat', body);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (text: string, userId?: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setError(null);
    setIsSending(true);
    setMessages((prev) => [...prev, { id: newId(), role: 'user', text: trimmed }]);

    try {
      const response = await sendChatMessage(trimmed, userId);
      setMessages((prev) => [...prev, { id: newId(), role: 'agent', response }]);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong. Try again.';
      setError(message);
    } finally {
      setIsSending(false);
    }
  }, [isSending]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<ChatContextValue>(
    () => ({ messages, isSending, error, sendMessage, clearError }),
    [messages, isSending, error, sendMessage, clearError],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within <ChatProvider>');
  return ctx;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @pouch/web test
```
Expected: PASS — 2 tests green.

- [ ] **Step 5: Verify typecheck**

Run:
```bash
pnpm --filter @pouch/web typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/context/chat-context.tsx apps/web/src/context/chat-context.test.ts
git commit -m "feat(web): add ChatProvider (send message → /agent/chat)"
```

---

## Task 8: Landing + Magic login modal

**Files:**
- Modify: `apps/web/src/app/page.tsx` (convert to a server shell that renders Landing)
- Create: `apps/web/src/components/landing/Landing.tsx`
- Create: `apps/web/src/components/landing/MagicLoginModal.tsx`

- [ ] **Step 1: Create the Magic login modal (client)**

Create `apps/web/src/components/landing/MagicLoginModal.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Spinner } from '../ui/Spinner';

export function MagicLoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'checking'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setStatus('sending');
    try {
      setStatus('checking'); // Magic email link sent — waiting for confirmation
      await login(email.trim());
      onClose();
    } catch {
      setError('Login failed. Check your email and try again.');
      setStatus('idle');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-[var(--fg)]">Connect to Pouch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          No wallets, no popups. Just your email.
        </p>

        {status === 'checking' ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-4">
            <Spinner />
            <p className="text-center text-sm text-[var(--muted)]">
              Check your email ({email}) and tap the Magic link to confirm.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            {error ? <ErrorMessage>{error}</ErrorMessage> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Landing (client, to manage modal state)**

Create `apps/web/src/components/landing/Landing.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '../ui/Button';
import { MagicLoginModal } from './MagicLoginModal';

const highlights = [
  'Natural language cash-out flow',
  'Cross-chain consolidation via Universal Accounts',
  'Provider routing across gift cards, top-ups, and eSIMs',
];

export function Landing() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        Pouch
      </span>
      <h1 className="mt-4 text-balance text-4xl font-extrabold leading-tight text-[var(--fg)] sm:text-5xl">
        Talk to your money. It cashes out anywhere.
      </h1>
      <p className="mt-4 max-w-xl text-balance text-[var(--muted-2)]">
        Say how much and where. Pouch converts your crypto into gift cards, top-ups, and more — invisibly.
      </p>

      <div className="mt-8">
        <Button onClick={() => setShowLogin(true)}>Connect wallet</Button>
      </div>

      <ul className="mt-12 grid w-full gap-3 text-left sm:grid-cols-3">
        {highlights.map((h) => (
          <li
            key={h}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-2)]"
          >
            {h}
          </li>
        ))}
      </ul>

      {showLogin ? <MagicLoginModal onClose={() => setShowLogin(false)} /> : null}
    </main>
  );
}
```

- [ ] **Step 3: Convert page.tsx to a session-gated shell**

Replace the contents of `apps/web/src/app/page.tsx` with:
```tsx
'use client';

import { Landing } from '../components/landing/Landing';
import { ChatView } from '../components/chat/ChatView';
import { useSession } from '../context/session-context';
import { Spinner } from '../components/ui/Spinner';

export default function Home() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner label="Loading…" />
      </main>
    );
  }

  if (status === 'anonymous') {
    return <Landing />;
  }

  return <ChatView />;
}
```

- [ ] **Step 4: Verify build (ChatView does not exist yet — stub it first)**

Create a temporary stub at `apps/web/src/components/chat/ChatView.tsx`:
```tsx
'use client';
export function ChatView() {
  return <main className="p-8 text-[var(--fg)]">Chat view (coming in Task 9)</main>;
}
```
Run:
```bash
pnpm --filter @pouch/web build
```
Expected: build passes. (The stub is replaced in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing apps/web/src/app/page.tsx apps/web/src/components/chat/ChatView.tsx
git commit -m "feat(web): add Landing + Magic login modal, session-gated page shell"
```

---

## Task 9: ChatView + ChatInput + MessageList

**Files:**
- Replace: `apps/web/src/components/chat/ChatView.tsx` (remove stub)
- Create: `apps/web/src/components/chat/ChatInput.tsx`
- Create: `apps/web/src/components/chat/MessageList.tsx`
- Create: `apps/web/src/components/chat/BalancePill.tsx`
- Create: `apps/web/src/components/chat/AgentTurn.tsx` (stub; fleshed out in Task 10)
- Create: `apps/web/src/components/chat/TraceTimeline.tsx` (stub)
- Create: `apps/web/src/components/chat/ReceiptCard.tsx` (stub)

- [ ] **Step 1: Create ChatInput**

Create `apps/web/src/components/chat/ChatInput.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useChat } from '../../context/chat-context';
import { useSession } from '../../context/session-context';

export function ChatInput() {
  const { sendMessage, isSending } = useChat();
  const { session } = useSession();
  const [text, setText] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || isSending) return;
    setText('');
    await sendMessage(value, session?.userId);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[var(--border)] p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit(e as unknown as React.FormEvent);
          }
        }}
        rows={1}
        placeholder="Cash out $25 to Amazon…"
        disabled={isSending}
        className="max-h-40 min-h-12 flex-1 resize-none rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isSending || !text.trim()}
        className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {isSending ? '…' : 'Send'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create BalancePill**

Create `apps/web/src/components/chat/BalancePill.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api-client';
import type { BalanceResponse } from '../../lib/types';

export function BalancePill() {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      setBalance(await apiGet<BalanceResponse>('/balance'));
    } catch (e) {
      // In demo mode without a cookie this still works; a 401 means not authed.
      if (!(e instanceof ApiError && e.status === 401)) {
        setBalance(null);
      }
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!balance) return null;

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-1 text-xs font-medium text-[var(--muted-2)]"
      title="Your consolidated balance"
    >
      ${balance.total.toFixed(2)} · {balance.assets.length} asset{balance.assets.length === 1 ? '' : 's'}
      {open ? (
        <span className="mt-2 block text-left">
          {balance.assets.map((a) => (
            <span key={`${a.chainId}-${a.symbol}`} className="block">
              {a.symbol}: {a.amount.toFixed(2)} (${a.usdValue.toFixed(2)})
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 3: Create the AgentTurn + TraceTimeline + ReceiptCard stubs**

Create `apps/web/src/components/chat/AgentTurn.tsx`:
```tsx
'use client';
import type { AgentChatResponse } from '@pouch/domain';
import { TraceTimeline } from './TraceTimeline';
import { ReceiptCard } from './ReceiptCard';

export function AgentTurn({ response }: { response: AgentChatResponse }) {
  return (
    <div className="mt-2 space-y-2">
      <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">{response.reply}</p>
      {response.trace.length > 0 ? <TraceTimeline trace={response.trace} /> : null}
      {response.status === 'delivered' ? <ReceiptCard orderId={response.orderId} /> : null}
    </div>
  );
}
```

Create `apps/web/src/components/chat/TraceTimeline.tsx`:
```tsx
'use client';
import type { TraceStep } from '@pouch/domain';

const STATUS_DOT: Record<TraceStep['status'], string> = {
  pending: 'bg-[var(--muted)]',
  active: 'bg-[var(--accent)] animate-pulse',
  complete: 'bg-emerald-400',
  error: 'bg-red-400',
};

export function TraceTimeline({ trace }: { trace: TraceStep[] }) {
  return (
    <ol className="space-y-2 border-l border-[var(--border)] pl-4">
      {trace.map((step) => (
        <li key={step.id} className="relative">
          <span
            className={`absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full ${STATUS_DOT[step.status]}`}
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted-2)]">{step.label}</span>
            {step.badge ? (
              <span className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {step.badge}
              </span>
            ) : null}
            {typeof step.durationMs === 'number' ? (
              <span className="text-[10px] text-[var(--muted)]">{step.durationMs}ms</span>
            ) : null}
          </div>
          {step.detail ? <p className="text-xs text-red-300">{step.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
```

Create `apps/web/src/components/chat/ReceiptCard.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api-client';
import type { Order } from '../../lib/types';

export function ReceiptCard({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const o = await apiGet<Order>(`/orders/${orderId}`);
        if (!cancelled) setOrder(o);
      } catch {
        // non-fatal — the trace already shows the outcome
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!order) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--fg)]">{order.product.name}</span>
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{order.status}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--muted-2)]">
        ${order.faceValue.value.toFixed(2)} via {order.providerId}
      </p>
      {order.redemption?.code ? (
        <p className="mt-2 break-all rounded-lg bg-black/30 p-2 font-mono text-xs text-emerald-300">
          {order.redemption.code}
        </p>
      ) : null}
      {order.redemption?.link ? (
        <a
          href={order.redemption.link}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-[var(--accent)] underline"
        >
          Open redemption link →
        </a>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create MessageList**

Create `apps/web/src/components/chat/MessageList.tsx`:
```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '../../context/chat-context';
import { AgentTurn } from './AgentTurn';
import { Spinner } from '../ui/Spinner';
import { ErrorMessage } from '../ui/ErrorMessage';

export function MessageList() {
  const { messages, isSending, error } = useChat();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2 text-sm text-white">
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-[var(--border)] bg-white/5 px-4 py-3">
              {m.response ? <AgentTurn response={m.response} /> : null}
            </div>
          </div>
        ),
      )}
      {isSending ? (
        <div className="flex justify-start">
          <Spinner label="Pouch is working…" />
        </div>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 5: Replace the ChatView stub with the real component**

Replace `apps/web/src/components/chat/ChatView.tsx` with:
```tsx
'use client';

import { ChatProvider } from '../../context/chat-context';
import { useSession } from '../../context/session-context';
import { Button } from '../ui/Button';
import { BalancePill } from './BalancePill';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function ChatView() {
  const { session, logout } = useSession();

  return (
    <ChatProvider>
      <main className="mx-auto flex h-dvh max-w-2xl flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-tight text-[var(--fg)]">Pouch</span>
            <BalancePill />
          </div>
          <div className="flex items-center gap-3">
            {session?.evmAddress ? (
              <span className="hidden text-xs text-[var(--muted)] sm:inline">
                {session.evmAddress.slice(0, 6)}…{session.evmAddress.slice(-4)}
              </span>
            ) : null}
            <Button variant="ghost" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </header>

        <MessageList />
        <ChatInput />
      </main>
    </ChatProvider>
  );
}
```

- [ ] **Step 6: Verify typecheck + build**

Run:
```bash
pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web build
```
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/chat
git commit -m "feat(web): add ChatView, MessageList, ChatInput, BalancePill, AgentTurn/Trace/Receipt"
```

---

## Task 10: TraceTimeline + ReceiptCard polish (status-dependent rendering)

The stubs from Task 9 are already functional. This task adds: (a) a "NO POPUP" emphasis badge styling rule, (b) receipt polling to catch webhook-driven `delivered` transitions, (c) a zero-popup counter for the demo.

**Files:**
- Modify: `apps/web/src/components/chat/TraceTimeline.tsx`
- Modify: `apps/web/src/components/chat/ReceiptCard.tsx`
- Modify: `apps/web/src/components/chat/ChatView.tsx` (zero-popup counter)

- [ ] **Step 1: Emphasize the NO POPUP badge in TraceTimeline**

In `apps/web/src/components/chat/TraceTimeline.tsx`, change the badge rendering to special-case `NO POPUP`:
```tsx
{step.badge ? (
  <span
    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
      step.badge === 'NO POPUP'
        ? 'bg-emerald-400/20 text-emerald-300'
        : 'bg-[var(--accent)]/20 text-[var(--muted)]'
    }`}
  >
    {step.badge}
  </span>
) : null}
```

- [ ] **Step 2: Add receipt polling for status transitions**

In `apps/web/src/components/chat/ReceiptCard.tsx`, replace the single-load `useEffect` with a polling version that stops once `delivered`/`failed`/`refunded`:
```tsx
  useEffect(() => {
    let cancelled = false;
    const terminal = new Set(['delivered', 'failed', 'refunded']);
    async function load() {
      try {
        const o = await apiGet<Order>(`/orders/${orderId}`);
        if (cancelled) return;
        setOrder(o);
        if (terminal.has(o.status)) return;
        timer = window.setTimeout(load, 4000);
      } catch {
        // non-fatal
      }
    }
    let timer = 0;
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orderId]);
```

- [ ] **Step 3: Add a zero-popup counter to the ChatView header**

In `apps/web/src/components/chat/ChatView.tsx`, count steps with badge `NO POPUP` across all agent messages and display the count. Add inside the `ChatView` component, computing from the chat context (move `ChatView` to consume `useChat` — but it's the provider host, so compute via a small child component instead). Add above the `<ChatInput />`:
```tsx
function ZeroPopupBadge() {
  const { messages } = useChat();
  const count = messages.reduce(
    (n, m) => n + (m.response?.trace.filter((s) => s.badge === 'NO POPUP').length ?? 0),
    0,
  );
  if (count === 0) return null;
  return (
    <span className="mx-4 mb-2 inline-block rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
      {count} signature{count === 1 ? '' : 's'} · zero popups
    </span>
  );
}
```
And render `<ZeroPopupBadge />` between `</MessageList>`... actually between `MessageList` and `ChatInput` is not valid JSX placement in a flex column — instead place it inside the header or as a floating element. Place it in the header next to `BalancePill`:
```tsx
<span className="flex items-center gap-3">
  <BalancePill />
  <ZeroPopupBadge />
</span>
```
(Add `useChat` import at top if not present.)

- [ ] **Step 4: Verify typecheck + build**

Run:
```bash
pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web build
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat
git commit -m "feat(web): emphasize NO POPUP badges, poll receipt status, zero-popup counter"
```

---

## Task 11: Demo-mode banner + empty-state suggestions

Make the demo immediately usable for judges: a banner clarifying demo mode, and suggested prompts in the empty chat state.

**Files:**
- Modify: `apps/web/src/components/chat/ChatView.tsx`
- Modify: `apps/web/src/components/chat/MessageList.tsx`
- Modify: `apps/web/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Add a demo-mode banner**

In `ChatView.tsx`, add a check on session identity (demo-user) to show a banner. Add after the `<header>`:
```tsx
{session?.userId === 'demo-user' || !session ? (
  <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
    Demo mode — balances and orders are simulated. Connect Magic for real wallet auth.
  </div>
) : null}
```

- [ ] **Step 2: Add empty-state suggestion chips in MessageList**

In `MessageList.tsx`, before the messages map, if `messages.length === 0 && !isSending`, render suggestions that call `sendMessage`. Add near the top of the returned JSX (inside the scroll container):
```tsx
{messages.length === 0 && !isSending ? (
  <EmptyState />
) : null}
```
And add at the bottom of the file (it needs `useChat`, already imported in MessageList via context — but `sendMessage` isn't destructured yet; add it):
```tsx
const SUGGESTIONS = [
  'Cash out $25 to Amazon',
  'How much do I have?',
  'Cash out $10 to a Visa prepaid card',
];

function EmptyState() {
  const { sendMessage, isSending } = useChat();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-[var(--muted)]">Ask Pouch to cash out your crypto.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            disabled={isSending}
            onClick={() => void sendMessage(s)}
            className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs text-[var(--muted-2)] transition hover:bg-white/10 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run:
```bash
pnpm --filter @pouch/web typecheck && pnpm --filter @pouch/web build
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat
git commit -m "feat(web): add demo-mode banner + empty-state suggestion chips"
```

---

## Task 12: End-to-end smoke test against the live API (demo mode)

This is a manual verification task — no new code. It proves the whole stack works against the real API in demo mode (no Magic key needed).

- [ ] **Step 1: Start the API**

In one terminal:
```bash
pnpm dev:api
```
Expected: `Pouch API listening on http://localhost:3001`.

- [ ] **Step 2: Start the web app**

In another terminal:
```bash
pnpm dev:web
```
Expected: Next dev server on `:3000`.

- [ ] **Step 3: Verify the demo flow in the browser**

Open `http://localhost:3000`. Expected sequence:
1. Landing renders with "Connect wallet" button. (No Magic key → `hasMagicConfig()` is false → session resolves to `anonymous` → Landing shows. If a Magic key IS set, clicking Connect opens the modal.)
2. To test the chat without Magic: temporarily force the session to authenticated-demo. Quickest path — append a one-time dev affordance: in `page.tsx`, if `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` is unset, render `<ChatView/>` directly (demo mode). Implement this as:
```tsx
if (status === 'anonymous' && !process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY) {
  return <ChatView />;
}
```
Place this check before the `return <Landing />` line. Rebuild.
3. Reload. The chat view renders with the demo banner + balance pill (`$150 · 1 asset`) + suggestion chips.
4. Click "Cash out $25 to Amazon" (or type it). Expected: user bubble appears → spinner → agent bubble with the conversational reply + a trace timeline (Reading balance → Finding provider → Creating order → Signing payment) + a zero-popup badge in the header + a receipt card once the order resolves.
5. Confirm the browser DevTools Network tab shows `POST /api/agent/chat` returned 200 with the `AgentChatResponse` JSON.

- [ ] **Step 4: Commit the demo-mode dev affordance**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): demo-mode fallback renders ChatView without Magic key"
```

- [ ] **Step 5: Record the verified state in HANDOFF.md**

Append a note under the "Verified state" section:
```
- ✅ pnpm dev:web + dev:api end-to-end demo flow verified (demo mode): landing → chat → "Cash out $25 to Amazon" → trace + receipt render against live API.
```

```bash
git add docs/HANDOFF.md
git commit -m "docs: record Phase 3 demo-mode end-to-end smoke verified"
```

---

## Task 13: Full quality gate + finalize docs

- [ ] **Step 1: Run the full monorepo quality gate**

Run:
```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: all 8 packages pass (typecheck + test + build). Note any failures and fix before proceeding.

- [ ] **Step 2: Update AGENTS.md phase status**

In `AGENTS.md`, mark the "Frontend chat/balance/order UI — Phase 3" checkbox as `[x]` and update the header status line to "Phase 3 (Frontend) code complete".

- [ ] **Step 3: Update HANDOFF.md**

In `docs/HANDOFF.md`:
- Under "What is real vs demo", update the frontend line: "Frontend: Magic login modal + chat UI + trace + receipt + balance pill (demo mode verified; Magic key + UA signing pending)."
- Under "Phase 3 — Frontend", move the delivered items to a new "DONE (2026-07-14)" subsection.
- Note Task 14 (UA signing) as the remaining optional sub-phase, gated on Manual Gate 1.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/HANDOFF.md
git commit -m "docs: mark Phase 3 (frontend) code-complete; update HANDOFF status"
```

---

## Task 14 (OPTIONAL, gated on Manual Gate 1 — the UA spike): UA 7702 signing seam

**Only attempt this after the UA spike has been run successfully against real funds.** It wires the browser-side Magic signing into the `/transactions/plan/*` → `sendTransaction` flow. If time is short, skip it — the demo works without it.

**Files:**
- Modify: `apps/web/package.json` (add `ethers@^6`)
- Create: `apps/web/src/lib/ua-signer.ts`
- Modify: `apps/web/src/components/chat/AgentTurn.tsx` (surface consolidation steps that need signing)

- [ ] **Step 1: Add ethers v6**

Run:
```bash
pnpm --filter @pouch/web add ethers@^6.17.0
```

- [ ] **Step 2: Create the UA signer helper**

Create `apps/web/src/lib/ua-signer.ts`:
```ts
import { ethers } from 'ethers';
import { apiPost } from './api-client';
import { getMagic } from './magic-client';

// Mirrors apps/api/src/services/transaction-planner.ts UnsignedTransactionPlan.
interface UnsignedTransactionPlan {
  transactionId: string;
  rootHash: string;
  requires7702Signature: boolean;
  userOpsNeedingAuth: Array<{ chainId: number; nonce: number; address: string }>;
}

async function planConsolidate(
  targetChainId: number,
  token: string,
  amount: string,
): Promise<UnsignedTransactionPlan> {
  return apiPost<UnsignedTransactionPlan>('/transactions/plan/consolidate', {
    targetChainId,
    token,
    amount,
  });
}

// Signs the rootHash + each 7702 authorization via Magic (blind signature — no popup),
// then posts the signed transaction back. Returns the tx hash.
export async function signAndSendConsolidation(
  targetChainId: number,
  token: string,
  amount: string,
): Promise<string> {
  const plan = await planConsolidate(targetChainId, token, amount);

  const magic = getMagic();
  const provider = new ethers.BrowserProvider(magic.rpcProvider as never);
  const signer = await provider.getSigner();

  // Sign the merkle root hash.
  const rootSignature = await signer.signMessage(ethers.getBytes(plan.rootHash));

  // Sign each 7702 authorization (blind — Magic handles it without a popup).
  const auths: string[] = [];
  if (plan.requires7702Signature) {
    for (const op of plan.userOpsNeedingAuth) {
      const auth = ethers.AuthorizationRequest
        ? // ethers v6 helper path — concrete API confirmed during the UA spike
          await signer.signAuthorization({
            chainId: op.chainId,
            nonce: op.nonce,
            address: op.address,
          } as never)
        : await signer.signMessage(
            ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${op.chainId}:${op.nonce}:${op.address}`))),
          );
      auths.push(auth as unknown as string);
    }
  }

  // Submit the signed transaction. The backend exposes /transactions/plan/submit
  // (or equivalent) — confirm the exact endpoint name from the spike results.
  // This is intentionally the LAST seam to wire because its shape depends on
  // what the spike confirms about sendTransaction.
  const result = await apiPost<{ txHash: string }>('/transactions/plan/submit', {
    transactionId: plan.transactionId,
    rootSignature,
    auths,
  });
  return result.txHash;
}
```
> NOTE: the exact ethers v6 7702 API (`signAuthorization` vs `authorizeSync`) and the submit endpoint shape are confirmed during the UA spike (Manual Gate 1). Do not wire this into the UI until the spike validates the signing path against real funds. The function above documents the intended shape; adjust to match spike findings.

- [ ] **Step 3: Verify typecheck (the signer compiles standalone)**

Run:
```bash
pnpm --filter @pouch/web typecheck
```
Expected: no errors (adjust the ethers API call if the installed v6 minor differs).

- [ ] **Step 4: Commit (as a ready-to-wire seam, not yet called from UI)**

```bash
git add apps/web/package.json apps/web/src/lib/ua-signer.ts pnpm-lock.yaml
git commit -m "feat(web): add UA 7702 signer seam (gated on UA spike validation)"
```

---

## Self-review (completed by plan author)

**1. Spec coverage:**
- Magic embedded wallet + blind signatures (zero popups) → Tasks 5, 6, 10 (NO POPUP badge + counter). ✅
- Chat interface + agent trace + receipt card → Tasks 7, 9, 10. ✅
- `/agent/chat` + `/balance` + `/orders/:id` + `/auth/callback` + `/auth/logout` → Tasks 3 (client), 6, 7, 9. ✅
- `/transactions/plan/*` signing seam → Task 14 (optional, gated). ✅
- UX excellence (demo-usable by judges, English-only) → Tasks 11, 12. ✅
- Domain isolation preserved (frontend imports types from `@pouch/domain`, no SDK in domain). ✅

**2. Placeholder scan:** No "TBD"/"TODO" in Tasks 1–13. Task 14 contains one explicitly-flagged uncertainty (the ethers v6 7702 API + submit endpoint), which is intentional and gated on the manual spike — it cannot be resolved without spike results.

**3. Type consistency:** `AgentChatResponse`, `TraceStep`, `Balance`, `Order`, `Session`, `ChatMessage` are defined once (Task 3 + Tasks 6/7) and referenced consistently. `apiGet`/`apiPost`/`ApiError` signatures match across all call sites. `hasMagicConfig`/`getMagic`/`loginWithEmail`/`isLoggedIn`/`getEvmAddress`/`logout` match between magic-client and session-context.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-pouch-phase3-frontend.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks (two-stage: spec-compliance + code-quality), fast iteration. Matches how Phase 2 was executed.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
