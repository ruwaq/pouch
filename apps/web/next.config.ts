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
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com; frame-ancestors 'none';",
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