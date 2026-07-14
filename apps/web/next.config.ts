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
};

export default nextConfig;
