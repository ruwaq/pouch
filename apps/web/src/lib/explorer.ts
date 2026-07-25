/**
 * Wallet address display helpers.
 *
 * Explorer URL/name lookup lives in `@pouch/shared` (see `getExplorerUrl`,
 * `getExplorerName`, `EXPLORERS`). This module only adds `shortAddress` for
 * compact rendering of 0x… addresses in the WalletPanel.
 */

import { EXPLORERS, getExplorerUrl, getExplorerName } from '@pouch/shared';

export { getExplorerUrl, getExplorerName };

/** Shortens a full 0x… address to a `0xAbcd…F01` form for compact display. */
export function shortAddress(address: string): string {
  // Show first 6 chars (0x + 4 hex) and last 3 hex chars, separated by an ellipsis.
  if (address.length <= 9) return address;
  return `${address.slice(0, 6)}…${address.slice(-3)}`;
}

/**
 * Returns the explorer URL for an address on a given chain, or null if the
 * chain is not in the canonical EXPLORERS table.
 *
 * Wraps `@pouch/shared`'s `getExplorerUrl` but returns null (instead of an
 * Arbiscan fallback) for unknown chains — the WalletPanel should NOT render a
 * misleading "Arbiscan" link for a wallet that isn't on Arbitrum.
 */
export function explorerAddressUrl(chainId: number, address: string): string | null {
  if (!EXPLORERS[chainId]) return null;
  return getExplorerUrl(chainId, 'address', address);
}
