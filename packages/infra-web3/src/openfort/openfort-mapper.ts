import type { DomainError } from '@pouch/domain';

/**
 * Maps an error thrown by the Openfort SDK (or any thrown value) to a
 * `DomainError`. We always map to AGENT_WALLET_SETTLE_FAILED because the
 * Openfort integration is the settlement leg — any failure there is a
 * settlement failure. The `operation` context is included in the message
 * so the trace/reply can tell the user what went wrong.
 *
 * Pure: imports no SDK. The provider passes the caught error in.
 */
export function mapOpenfortError(error: unknown, operation: string): DomainError {
  const cause = error instanceof Error ? error.message : 'unknown';

  return {
    type: 'AGENT_WALLET_SETTLE_FAILED',
    message: `Failed to ${operation} via Openfort.`,
    cause,
  };
}
