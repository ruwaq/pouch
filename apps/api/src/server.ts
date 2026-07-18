import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from the monorepo root BEFORE any other module initializes.
// tsx does NOT auto-load .env files, and ES module static imports are
// resolved before module-level code runs — so we must load env vars here
// and then dynamically import the app to ensure it sees them.
const envPaths = [
  resolve(process.cwd(), '.env'),                       // repo root when running pnpm dev:api
  resolve(process.cwd(), '..', '..', '.env'),           // from apps/api/ up to root
  resolve(process.cwd(), '..', '..', '..', '.env'),     // from apps/api/src/ up to root
];
for (const p of envPaths) {
  const result = config({ path: p });
  if (Object.keys(result.parsed ?? {}).length > 0) {
    console.error(`[server] Loaded .env from ${p} (${Object.keys(result.parsed!).length} vars)`);
    break;
  }
}

// Dynamic import so app.ts (and its createRuntimeAppServices call)
// runs AFTER .env is loaded into process.env.
const { app } = await import('./app');

import { serve } from '@hono/node-server';

const port = Number(process.env.PORT ?? 3001);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Pouch API listening on http://localhost:${info.port}`);
  },
);