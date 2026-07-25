import type { Config } from '@pouch/shared';
import type { OffRampProvider } from '@pouch/domain';

import { BitrefillAdapter } from './bitrefill/adapter';
import { BitrefillClient } from './bitrefill/client';
import { BitrefillMapper } from './bitrefill/mapper';

function toSettlementPaymentMethod(settlementChainId: number): string {
  switch (settlementChainId) {
    case 42161:
      return 'usdc_arbitrum';
    case 8453:
      return 'usdc_base';
    case 137:
      return 'usdc_polygon';
    case 1:
      return 'usdc_erc20';
    default:
      throw new Error(`Unsupported settlement chain: ${settlementChainId}`);
  }
}

export function buildOffRampProviders(config: Config): OffRampProvider[] {
  const providers: OffRampProvider[] = [];

  if (config.OFFRAMP_PROVIDERS.includes('bitrefill') && config.BITREFILL_API_KEY?.trim()) {
    providers.push(
      new BitrefillAdapter(
        new BitrefillClient(config.BITREFILL_API_KEY, config.BITREFILL_BASE_URL),
        new BitrefillMapper(),
        {
          includeTestProducts: config.NODE_ENV !== 'production',
          paymentMethod: toSettlementPaymentMethod(config.SETTLEMENT_CHAIN_ID),
          webhookSecret: config.WEBHOOK_SECRET,
        },
      ),
    );
  }

  if (providers.length === 0) {
    // Don't crash — let the executor return a proper "no provider" error.
    // This allows the app to boot without an off-ramp key (e.g. while waiting
    // for Bitrefill approval) while auth, balance, AI, and DB still work.
  }

  return providers;
}

export * from './bitrefill';
