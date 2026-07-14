import { err, ok } from '@pouch/shared';
import type { AccountProvider, Balance, UserId } from '@pouch/domain';

import type { ParticleProviderConfig } from './types';
import { mapAssetsResponseToBalance, type UaAssetsResponseLike } from './ua-assets-mapper';

// Minimal structural type for the SDK pieces we use. Keeping the heavy
// `@particle-network/universal-account-sdk` import out of the module top-level
// means demo mode (the default in dev) never has to resolve it. Under
// pnpm + tsx, the SDK's ESM named-export linking is fragile; deferring the
// import to inside getInstance() isolates that to the particle code path.
type UniversalAccountLike = {
  getPrimaryAssets(): Promise<UaAssetsResponseLike>;
};

// Each user gets their own UniversalAccount (one per Magic EOA address).
// The provider caches UA instances by ownerAddress.
export class ParticleAccountProvider implements AccountProvider {
  private readonly instances = new Map<string, UniversalAccountLike>();

  constructor(private readonly config: ParticleProviderConfig) {}

  async getUnifiedBalance(userId: UserId): ReturnType<AccountProvider['getUnifiedBalance']> {
    const ua = await this.getInstance(userId);

    try {
      const response = (await ua.getPrimaryAssets()) as unknown as UaAssetsResponseLike;
      const balance: Balance = mapAssetsResponseToBalance(response, {
        settlementChainId: this.config.settlementChainId,
      });
      return ok(balance);
    } catch (error) {
      return err({
        type: 'UNKNOWN',
        message: error instanceof Error ? `Particle balance read failed: ${error.message}` : 'Particle balance read failed.',
      });
    }
  }

  async consolidate(): ReturnType<AccountProvider['consolidate']> {
    // Server cannot sign — browser holds the Magic key. Phase 3 implements the browser path.
    return err({
      type: 'UNKNOWN',
      message: 'Consolidation signing happens in the browser (Magic). Use the transaction-planning endpoint + frontend signer.',
    });
  }

  async sendPayment(): ReturnType<AccountProvider['sendPayment']> {
    return err({
      type: 'UNKNOWN',
      message: 'Payment signing happens in the browser (Magic). Use the transaction-planning endpoint + frontend signer.',
    });
  }

  private async getInstance(ownerAddress: string): Promise<UniversalAccountLike> {
    let ua = this.instances.get(ownerAddress);

    if (!ua) {
      // Deferred import: see file header. Only particle mode ever reaches here.
      const { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION } = await import('@particle-network/universal-account-sdk');
      ua = new UniversalAccount({
        projectId: this.config.projectId,
        projectClientKey: this.config.projectClientKey,
        projectAppUuid: this.config.projectAppUuid,
        smartAccountOptions: {
          name: 'UNIVERSAL',
          version: UNIVERSAL_ACCOUNT_VERSION,
          ownerAddress,
          useEIP7702: true,
        },
      });
      this.instances.set(ownerAddress, ua);
    }

    return ua;
  }
}
