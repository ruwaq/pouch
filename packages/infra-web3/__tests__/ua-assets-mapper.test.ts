import { describe, expect, it } from 'vitest';

import { mapAssetsResponseToBalance } from '../src/particle/ua-assets-mapper';

describe('mapAssetsResponseToBalance', () => {
  it('maps an IAssetsResponse into a domain Balance with aggregated assets', () => {
    const response = {
      totalAmountInUSD: 142.5,
      assets: [
        {
          tokenType: 'USDC',
          price: 1,
          amount: 50,
          amountInUSD: 50,
          chainAggregation: [
            { token: { chainId: 42161, address: '0xusdc-arb' }, amount: 30, amountInUSD: 30, rawAmount: 30_000000 },
            { token: { chainId: 8453, address: '0xusdc-base' }, amount: 20, amountInUSD: 20, rawAmount: 20_000000 },
          ],
        },
        {
          tokenType: 'ETH',
          price: 3000,
          amount: 0.0308,
          amountInUSD: 92.5,
          chainAggregation: [{ token: { chainId: 8453, address: '0x0000' }, amount: 0.0308, amountInUSD: 92.5, rawAmount: 30_800000_000000_0000 }],
        },
      ],
    };

    const balance = mapAssetsResponseToBalance(response, { settlementChainId: 42161 });

    expect(balance.total).toBe(142.5);
    expect(balance.assets).toHaveLength(3);
    expect(balance.assets).toContainEqual({ chainId: 42161, symbol: 'USDC', amount: 30, usdValue: 30 });
    expect(balance.assets).toContainEqual({ chainId: 8453, symbol: 'USDC', amount: 20, usdValue: 20 });
    expect(balance.assets).toContainEqual({ chainId: 8453, symbol: 'ETH', amount: 0.0308, usdValue: 92.5 });
    // requiresConsolidation = true if the largest single asset share on the settlement chain < total
    expect(balance.requiresConsolidation).toBe(true);
  });

  it('reports requiresConsolidation=false when all value is already USDC on the settlement chain', () => {
    const response = {
      totalAmountInUSD: 100,
      assets: [
        {
          tokenType: 'USDC',
          price: 1,
          amount: 100,
          amountInUSD: 100,
          chainAggregation: [{ token: { chainId: 42161, address: '0xusdc-arb' }, amount: 100, amountInUSD: 100, rawAmount: 100_000000 }],
        },
      ],
    };

    const balance = mapAssetsResponseToBalance(response, { settlementChainId: 42161 });

    expect(balance.requiresConsolidation).toBe(false);
  });

  it('handles an empty balance gracefully', () => {
    const response = { totalAmountInUSD: 0, assets: [] };

    const balance = mapAssetsResponseToBalance(response, { settlementChainId: 42161 });

    expect(balance.total).toBe(0);
    expect(balance.assets).toEqual([]);
    expect(balance.requiresConsolidation).toBe(false);
  });
});
