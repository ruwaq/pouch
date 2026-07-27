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

import type { Wallet } from 'ethers';
import { hashAuthorization } from 'ethers';

/**
 * Build the 7702 authorizations array for a transaction's userOps.
 *
 * - Skips userOps that are already delegated (eip7702Delegated: true) — the
 *   upgrade is one-time and persists.
 * - Skips userOps with no eip7702Auth object.
 * - Deduplicates the signature by nonce: cross-chain bundles share a chainId=0
 *   nonce, so the same digest is signed once and reused across legs.
 *
 * Pure + synchronous — no SDK calls. Tested directly.
 */
export function buildAuthorizations(
  userOps: UaUserOp[],
  wallet: Wallet,
): { userOpHash: string; signature: string }[] {
  const authorizations: { userOpHash: string; signature: string }[] = [];
  const nonceMap = new Map<number, string>();
  for (const userOp of userOps) {
    const auth = userOp.eip7702Auth;
    if (!auth || userOp.eip7702Delegated) continue;
    let serialized = nonceMap.get(auth.nonce);
    if (!serialized) {
      serialized = wallet.signingKey.sign(hashAuthorization(auth)).serialized;
      nonceMap.set(auth.nonce, serialized);
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
  privateKey: string;   // the demo EOA's key (from .env)
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
    const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount } = await import(
      '@particle-network/universal-account-sdk'
    );
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
    const { getBytes } = await import('ethers');
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
