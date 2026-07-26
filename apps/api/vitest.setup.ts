// Vitest runs in Node and does NOT auto-load .env files. The API tests exercise
// createApp()/createRuntimeAppServices() which read PRIVATE_KEY, DEMO_MODE,
// DATABASE_URL, etc. directly from process.env. The monorepo-root .env must be
// loaded into process.env BEFORE any test module imports app.ts — otherwise the
// runtime boot throws on incomplete config. This mirrors what
// apps/api/src/server.ts does at process start.
import { config } from 'dotenv';
import { resolve } from 'path';

const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
];
for (const p of envPaths) {
  const result = config({ path: p });
  if (result.parsed && Object.keys(result.parsed).length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[vitest] Loaded .env from ${p} (${Object.keys(result.parsed).length} vars)`);
    break;
  }
}
