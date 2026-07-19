/** Block explorer configurations for all supported chains. */
export const EXPLORERS: Record<number, { name: string; txUrl: string; addressUrl: string }> = {
  42161: { name: 'Arbiscan', txUrl: 'https://arbiscan.io/tx', addressUrl: 'https://arbiscan.io/address' },
  8453: { name: 'BaseScan', txUrl: 'https://basescan.org/tx', addressUrl: 'https://basescan.org/address' },
  43114: { name: 'SnowTrace', txUrl: 'https://snowtrace.io/tx', addressUrl: 'https://snowtrace.io/address' },
  137: { name: 'PolygonScan', txUrl: 'https://polygonscan.com/tx', addressUrl: 'https://polygonscan.com/address' },
  1: { name: 'Etherscan', txUrl: 'https://etherscan.io/tx', addressUrl: 'https://etherscan.io/address' },
  10: { name: 'Optimism Explorer', txUrl: 'https://optimistic.etherscan.io/tx', addressUrl: 'https://optimistic.etherscan.io/address' },
};

/**
 * Generate a block explorer URL for a transaction or address.
 * @param chainId - The chain ID (e.g. 42161 for Arbitrum)
 * @param type - 'tx' for transaction, 'address' for account
 * @param hash - The transaction hash or address
 * @returns The full explorer URL, or a fallback to arbiscan for unknown chains
 */
export function getExplorerUrl(chainId: number, type: 'tx' | 'address', hash: string): string {
  const explorer = EXPLORERS[chainId];
  if (!explorer) {
    // Fallback to Arbiscan for unknown chains
    return `https://arbiscan.io/${type}/${hash}`;
  }
  return `${type === 'tx' ? explorer.txUrl : explorer.addressUrl}/${hash}`;
}

/**
 * Get the human-readable explorer name for a chain.
 * @param chainId - The chain ID
 * @returns The explorer name (e.g. "Arbiscan"), or "Explorer" for unknown chains
 */
export function getExplorerName(chainId: number): string {
  return EXPLORERS[chainId]?.name ?? 'Explorer';
}