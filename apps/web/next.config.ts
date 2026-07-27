import { config } from 'dotenv';
import { resolve } from 'path';

// Load the monorepo-root .env so server-side route handlers (the /api catch-all
// proxy) see PRIVATE_KEY, DEMO_MODE, GEMINI_API_KEY, OPENFORT_*, etc.
// Vercel injects env directly in production, so this is a no-op there
// (dotenv never overrides already-set vars). Mirrors what apps/api/src/server.ts does.
for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
]) {
  const result = config({ path: candidate });
  if (result.parsed && Object.keys(result.parsed).length > 0) {
    console.log(`[web] Loaded .env from ${candidate} (${Object.keys(result.parsed).length} vars)`);
    break;
  }
}

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages — they export raw .ts source (no dist build).
  transpilePackages: [
    '@pouch/domain',
    '@pouch/shared',
    '@pouch/api',
    '@pouch/infra-ai',
    '@pouch/infra-db',
    '@pouch/infra-offramp',
    '@pouch/infra-web3',
  ],
  // Heavy SDKs with native/ESM quirks — keep them external (not bundled).
  serverExternalPackages: [
    '@particle-network/universal-account-sdk',
    '@openfort/openfort-node',
    '@magic-sdk/admin',
    '@google/genai',
    'postgres',
    'pino',
  ],

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https:; " +
              "font-src 'self'; " +
              "connect-src 'self' https://generativelanguage.googleapis.com https://*.vercel.live wss://*.vercel.live https://*.magic.link wss://*.magic.link; " +
              "frame-src 'self' https://auth.magic.link; " +
              "frame-ancestors 'none';",
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;