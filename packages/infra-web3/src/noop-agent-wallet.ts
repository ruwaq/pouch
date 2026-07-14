import { err, type Result } from '@pouch/shared';
import type { AgentWalletPort, DomainError, TxResult } from '@pouch/domain';

/**
 * A no-op agent wallet that returns AGENT_WALLET_NOT_CONFIGURED on every
 * call. This is the factory default when OPENFORT_* env vars are unset,
 * so the executor's agent-wallet code path has a safe sentinel that never
 * accidentally executes a real settlement. In practice the factory returns
 * `undefined` (not this noop) so the executor takes the demo path; this
 * class exists for explicit "configured but incomplete" scenarios and for
 * test clarity.
 */
export class NoopAgentWallet implements AgentWalletPort {
  readonly label = 'No agent wallet';

  async getAddress(): Promise<Result<{ address: string }, DomainError>> {
    return err({
      type: 'AGENT_WALLET_NOT_CONFIGURED',
      message: 'No agent wallet is configured. Set OPENFORT_SECRET_KEY, OPENFORT_WALLET_SECRET, and OPENFORT_FEE_SPONSORSHIP_ID.',
    });
  }

  async settlePayment(): Promise<Result<TxResult, DomainError>> {
    return err({
      type: 'AGENT_WALLET_NOT_CONFIGURED',
      message: 'No agent wallet is configured. Settlement is not available.',
    });
  }
}
