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
