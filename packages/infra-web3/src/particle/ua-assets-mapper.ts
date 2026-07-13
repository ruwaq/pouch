import type { Balance, BalanceAsset } from '@pouch/domain';

// Minimal structural type matching the UA SDK's IAssetsResponse — kept here (infra) so the domain stays SDK-free.
export interface UaAssetsResponseLike {
  totalAmountInUSD: number;
  assets: Array<{
    tokenType: string;
    amount: number;
    amountInUSD: number;
    chainAggregation: Array<{
      token: { chainId: number; address: string };
      amount: number;
      amountInUSD: number;
    }>;
  }>;
}

export interface MapOptions {
  settlementChainId: number;
}

export function mapAssetsResponseToBalance(response: UaAssetsResponseLike, options: MapOptions): Balance {
  const assets: BalanceAsset[] = [];

  for (const asset of response.assets) {
    for (const chainAgg of asset.chainAggregation) {
      assets.push({
        chainId: chainAgg.token.chainId,
        symbol: asset.tokenType.toUpperCase(),
        amount: chainAgg.amount,
        usdValue: chainAgg.amountInUSD,
      });
    }
  }

  // Consolidation is needed when value is split across multiple chains/tokens
  // (the UA will have to bundle the payment into one cross-chain tx).
  const settlementChainAssets = assets.filter(
    (a) => a.chainId === options.settlementChainId && a.symbol === 'USDC',
  );
  const settlementUsd = settlementChainAssets.reduce((sum, a) => sum + a.usdValue, 0);
  const requiresConsolidation = response.totalAmountInUSD > 0 && settlementUsd < response.totalAmountInUSD;

  return {
    total: response.totalAmountInUSD,
    assets,
    requiresConsolidation,
  };
}
