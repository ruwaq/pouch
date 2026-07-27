// Types now live in @pouch/infra-web3 (canonical home, next to the UaClient
// implementation). Re-exported here so existing imports keep working.
export type { UaClientLike, UaTransactionPlan, UaUserOp } from '@pouch/infra-web3';
import type { UaClientLike, UaTransactionPlan } from '@pouch/infra-web3';

export interface UnsignedTransactionPlan {
  transactionId: string;
  rootHash: string;
  requires7702Signature: boolean;
  userOpsNeedingAuth: Array<{ chainId: number; nonce: number; address: string }>;
}

export type PlannerError = { type: 'PLANNER_FAILED'; message: string };

/**
 * Plans Particle Universal Account transactions WITHOUT executing them.
 *
 * The server produces an unsigned transaction plan (rootHash + 7702 auth needs);
 * the browser signs the rootHash + 7702 auths via Magic, then calls
 * `universalAccount.sendTransaction(tx, signature, authorizations)`.
 *
 * This is the seam for the frontend-driven signing architecture (Phase 3).
 */
export class TransactionPlanner {
  constructor(private readonly ua: UaClientLike) {}

  async planConsolidation(params: {
    ownerAddress: string;
    targetChainId: number;
    token: string;
    amount: string;
  }): Promise<UnsignedTransactionPlan> {
    void params.ownerAddress;
    const tx = await this.ua.createConvertTransaction({
      chainId: params.targetChainId,
      expectToken: { type: params.token, amount: params.amount },
    });
    return this.toPlan(tx);
  }

  async planPayment(params: {
    ownerAddress: string;
    token: { chainId: number; address: string };
    amount: string;
    receiver: string;
  }): Promise<UnsignedTransactionPlan> {
    void params.ownerAddress;
    const tx = await this.ua.createTransferTransaction({
      token: params.token,
      amount: params.amount,
      receiver: params.receiver,
    });
    return this.toPlan(tx);
  }

  private toPlan(tx: UaTransactionPlan): UnsignedTransactionPlan {
    const needsAuth = tx.userOps.filter((u) => u.eip7702Auth && !u.eip7702Delegated);
    return {
      transactionId: tx.transactionId,
      rootHash: tx.rootHash,
      requires7702Signature: needsAuth.length > 0,
      userOpsNeedingAuth: needsAuth.map((u) => u.eip7702Auth!),
    };
  }
}
