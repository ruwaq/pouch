import { ok, type Config } from '@pouch/shared';
import type { AccountProvider } from '@pouch/domain';

export class DemoAccountProvider implements AccountProvider {
  constructor(private readonly config: Config) {}

  async getUnifiedBalance(): ReturnType<AccountProvider['getUnifiedBalance']> {
    return ok({
      total: this.config.DEMO_USER_BALANCE_USD,
      assets: [
        {
          chainId: this.config.SETTLEMENT_CHAIN_ID,
          symbol: 'USDC',
          amount: this.config.DEMO_USER_BALANCE_USD,
          usdValue: this.config.DEMO_USER_BALANCE_USD,
        },
      ],
      requiresConsolidation: false,
    });
  }

  async consolidate(): ReturnType<AccountProvider['consolidate']> {
    return ok({
      txHash: '0xdemo-consolidation',
      chainId: this.config.SETTLEMENT_CHAIN_ID,
    });
  }

  async sendPayment(params: Parameters<AccountProvider['sendPayment']>[0]): ReturnType<AccountProvider['sendPayment']> {
    return ok({
      txHash: `0xdemo-payment-${params.chainId}`,
      chainId: params.chainId,
    });
  }
}
