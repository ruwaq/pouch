import { Magic } from 'magic-sdk';
import type { InstanceWithExtensions, SDKBase } from 'magic-sdk';
import { EVMExtension } from '@magic-ext/evm';

// `new Magic(key, { extensions: [...] })` returns an `InstanceWithExtensions`
// augmented with each extension's methods (e.g. `.evm`). The default `Magic`
// type alias is generic and doesn't reflect the extensions we attach, so we
// derive the concrete instance type from the extensions we configure.
type MagicInstance = InstanceWithExtensions<SDKBase, EVMExtension[]>;

// EVM config for the @magic-ext/evm extension.
// Chain ID and RPC URL are configurable via env vars.
// Default: Ethereum mainnet (chainId 1) with public Alchemy demo RPC.
const EVM_CONFIG = {
  rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
  chainId: Number(process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID) || 1,
  default: true,
};

let instance: MagicInstance | null = null;

export function hasMagicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY);
}

// Lazy singleton. Client-only — never call this during SSR. `instance` is only
// assigned AFTER a successful `new Magic(...)`, so a missing key always throws
// rather than returning a half-built object.
export function getMagic(): MagicInstance {
  if (instance) return instance;
  const key = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY is not set. Add it to apps/web/.env.local.',
    );
  }
  instance = new Magic(key, {
    extensions: [new EVMExtension([EVM_CONFIG])],
    network: 'mainnet' as const,
  });
  return instance;
}

// Blind-signature flow: Magic emits a DID token without a wallet popup.
export async function loginWithEmail(email: string): Promise<string> {
  const magic = getMagic();
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
  const address = info.wallets.ethereum?.publicAddress;
  if (!address) throw new Error('Magic session has no Ethereum public address.');
  return address;
}

export async function logout(): Promise<void> {
  if (await isLoggedIn()) {
    await getMagic().user.logout();
  }
}
