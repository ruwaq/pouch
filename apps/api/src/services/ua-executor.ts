// UaExecutor — orchestrates a server-side consolidation end-to-end:
// plan (createConvertTransaction) → sign + send (UaClient.sendTransaction) →
// poll (getTransaction) until FINISHED.
//
// The signing lives inside UaClient; this service only sequences calls and
// translates statuses into a receipt shape the API route + frontend consume.

// The subset of UaClient that the executor needs. Narrower than UaClientLike
// (it adds sendTransaction + getTransaction) so tests fake only these methods.
export interface UaExecutorClient {
  createConvertTransaction(payload: {
    chainId: number;
    expectToken: { type: string; amount: string };
  }): Promise<{ transactionId: string; rootHash: string; userOps: unknown[] }>;
  sendTransaction(
    transaction: { transactionId: string; rootHash: string; userOps: unknown[] },
  ): Promise<{ transactionId: string }>;
  getTransaction(transactionId: string): Promise<{ status?: number }>;
}

export interface ConsolidateParams {
  targetChainId: number;
  token: string; // 'USDC' | 'ETH'
  amount: string;
}

export interface ConsolidateReceipt {
  ok: boolean;
  transactionId: string;
  activityUrl: string;
  status?: number;
  error?: string;
  timedOut?: boolean;
  rateLimited?: boolean;
}

const RATE_LIMIT_PATTERN = /converted once per minute|rate.?limit/i;

// Particle UA transaction statuses (see ua-client.ts getTransaction).
const STATUS_FINISHED = 7;
const STATUS_FAILED = 6;

export class UaExecutor {
  constructor(
    private readonly client: UaExecutorClient,
    private readonly opts: { pollIntervalMs: number; maxPolls: number },
  ) {}

  async executeConsolidation(params: ConsolidateParams): Promise<ConsolidateReceipt> {
    let transactionId: string;
    try {
      const plan = await this.client.createConvertTransaction({
        chainId: params.targetChainId,
        expectToken: { type: params.token, amount: params.amount },
      });
      const sent = await this.client.sendTransaction(plan);
      transactionId = sent.transactionId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        transactionId: '',
        activityUrl: '',
        rateLimited: RATE_LIMIT_PATTERN.test(message),
        error: message,
      };
    }

    const activityUrl = `https://universalx.app/activity/details?id=${transactionId}`;
    let status = -1;
    for (let i = 0; i < this.opts.maxPolls; i++) {
      try {
        const detail = await this.client.getTransaction(transactionId);
        status = detail.status ?? -1;
      } catch {
        // Transient poll error (network blip, Particle 5xx) — skip this tick.
        // The tx was already sent; retry the poll or time out cleanly.
        await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs));
        continue;
      }
      if (status === STATUS_FINISHED) {
        return { ok: true, transactionId, activityUrl, status };
      }
      if (status === STATUS_FAILED) {
        return { ok: false, transactionId, activityUrl, status, error: 'UA transaction failed (status 6).' };
      }
      await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs));
    }
    return {
      ok: false,
      transactionId,
      activityUrl,
      status,
      timedOut: true,
      error: `Timed out after ${this.opts.maxPolls} polls (last status ${status}).`,
    };
  }
}
