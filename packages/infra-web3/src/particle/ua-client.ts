// Production interface for the Particle Universal Account client.
//
// The real implementation (UaClient class, below in this file) wraps
// @particle-network/universal-account-sdk and signs with the demo EOA's key.
// Tests and the TransactionPlanner consume this interface so they never touch
// the SDK directly (whose ESM exports are fragile under tsx/vitest).
//
// This file is the canonical home for these types. apps/api re-exports them
// from transaction-planner.ts for backward compatibility.

export interface UaTransactionPlan {
  transactionId: string;
  rootHash: string;
  userOps: UaUserOp[];
}

export interface UaUserOp {
  userOpHash: string;
  eip7702Auth?: { chainId: number; nonce: number; address: string };
  eip7702Delegated?: boolean;
}

// Minimal UA client interface (mockable; real impl wraps UniversalAccount).
export interface UaClientLike {
  createConvertTransaction(payload: {
    chainId: number;
    expectToken: { type: string; amount: string };
  }): Promise<UaTransactionPlan>;
  createTransferTransaction(payload: {
    token: { chainId: number; address: string };
    amount: string;
    receiver: string;
  }): Promise<UaTransactionPlan>;
}

import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getBytes, hashAuthorization, type Wallet } from 'ethers';

/**
 * Resolve the Particle UA SDK's ESM bundle as a file URL and import it.
 *
 * `tsx` (esbuild) mis-handles a bare `import('@particle-network/...')` when the
 * package mixes ESM with CJS deps (axios etc.): the named exports come back as
 * `undefined`, so `new UniversalAccount(...)` throws "not a constructor" at
 * runtime even though the SDK's `dist/index.mjs` exports it correctly. Next.js
 * (SWC) interops fine; the API dev server (`tsx watch`) does not.
 *
 * The fix: resolve the package's main entry, derive its `dist/` directory, and
 * `import()` the `.mjs` directly as a `file://` URL. This works under tsx, plain
 * Node ESM, and Next.js alike — no caller-side difference.
 */
async function importUniversalAccountSdk(): Promise<{
  UniversalAccount: new (opts: unknown) => unknown;
  UNIVERSAL_ACCOUNT_VERSION: string;
  SUPPORTED_TOKEN_TYPE: Record<string, string>;
}> {
  // `createRequire` works in both ESM and CJS host contexts.
  const require = createRequire(import.meta.url);
  const mainPath = require.resolve('@particle-network/universal-account-sdk');
  const mjsUrl = pathToFileURL(`${dirname(mainPath)}/index.mjs`).href;
  return import(mjsUrl);
}

/**
 * Build the 7702 authorizations array for a transaction's userOps.
 *
 * - Skips userOps that are already delegated (eip7702Delegated: true) — the
 *   upgrade is one-time and persists.
 * - Skips userOps with no eip7702Auth object.
 * - Deduplicates the signature by (chainId, nonce, address): cross-chain bundles
 *   share all three, so the same digest is signed once and reused across legs.
 *
 * Pure + synchronous — no SDK calls. Tested directly.
 */
export function buildAuthorizations(
  userOps: UaUserOp[],
  wallet: Wallet,
): { userOpHash: string; signature: string }[] {
  const authorizations: { userOpHash: string; signature: string }[] = [];
  // The signed digest depends on (chainId, nonce, address). Cross-chain bundles
  // share all three today, but key on the full tuple so distinct auths never collide.
  const signatureCache = new Map<string, string>();
  for (const userOp of userOps) {
    const auth = userOp.eip7702Auth;
    if (!auth || userOp.eip7702Delegated) continue;
    const key = `${auth.chainId}:${auth.nonce}:${auth.address}`;
    let serialized = signatureCache.get(key);
    if (!serialized) {
      serialized = wallet.signingKey.sign(hashAuthorization(auth)).serialized;
      signatureCache.set(key, serialized);
    }
    authorizations.push({ userOpHash: userOp.userOpHash, signature: serialized });
  }
  return authorizations;
}

// Config for the real UaClient (Particle creds + the demo EOA's signing key).
export interface UaClientConfig {
  projectId: string;
  projectClientKey: string;
  projectAppUuid: string;
  ownerAddress: string; // the demo EOA (0xA5fA…Fe3DD)
}

/**
 * Production wrapper around Particle's UniversalAccount SDK.
 *
 * One instance per process (the demo shares a single EOA). The SDK import is
 * deferred to the constructor so demo/non-UA mode never resolves the fragile
 * ESM bundle.
 *
 * Signing: rootHash is signed via EIP-191 (signMessageSync); 7702 authorizations
 * via the pure buildAuthorizations helper above. This mirrors the validated
 * spike at apps/web/src/app/api/spike/7702/exec-convert/route.ts.
 */
export class UaClient implements UaClientLike {
  private readonly wallet: Wallet;
  private readonly ua: Promise<unknown>; // lazily-built UniversalAccount

  constructor(config: UaClientConfig, wallet: Wallet) {
    this.wallet = wallet;
    this.ua = this.buildUa(config);
  }

  private async buildUa(config: UaClientConfig): Promise<unknown> {
    const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount } = await importUniversalAccountSdk();
    return new UniversalAccount({
      projectId: config.projectId,
      projectClientKey: config.projectClientKey,
      projectAppUuid: config.projectAppUuid,
      smartAccountOptions: {
        name: 'UNIVERSAL',
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress: config.ownerAddress,
        useEIP7702: true,
      },
    });
  }

  private async sdk<T = unknown>(): Promise<T> {
    return this.ua as Promise<T>;
  }

  async createConvertTransaction(payload: {
    chainId: number;
    expectToken: { type: string; amount: string };
  }): Promise<UaTransactionPlan> {
    const ua = await this.sdk<{
      createConvertTransaction(p: typeof payload): Promise<UaTransactionPlan>;
    }>();
    return ua.createConvertTransaction(payload);
  }

  async createTransferTransaction(payload: {
    token: { chainId: number; address: string };
    amount: string;
    receiver: string;
  }): Promise<UaTransactionPlan> {
    const ua = await this.sdk<{
      createTransferTransaction(p: typeof payload): Promise<UaTransactionPlan>;
    }>();
    return ua.createTransferTransaction(payload);
  }

  /** Sign the rootHash (EIP-191) + build 7702 authorizations, then send. */
  async sendTransaction(
    transaction: UaTransactionPlan,
  ): Promise<{ transactionId: string }> {
    const ua = await this.sdk<{
      sendTransaction(
        tx: UaTransactionPlan,
        signature: string,
        authorizations: { userOpHash: string; signature: string }[],
      ): Promise<{ transactionId: string }>;
    }>();
    const signature = this.wallet.signMessageSync(getBytes(transaction.rootHash));
    const authorizations = buildAuthorizations(transaction.userOps, this.wallet);
    return ua.sendTransaction(transaction, signature, authorizations);
  }

  /** Poll a transaction's status. status 7 = FINISHED, 6 = FAILED. */
  async getTransaction(transactionId: string): Promise<{ status: number }> {
    const ua = await this.sdk<{ getTransaction(id: string): Promise<{ status: number }> }>();
    return ua.getTransaction(transactionId);
  }
}
