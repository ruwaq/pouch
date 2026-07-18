import { err, ok, type Result } from '@pouch/shared';
import type {
  AgentWalletPort,
  DomainError,
  LoggerPort,
  TxResult,
} from '@pouch/domain';
import { ethers } from 'ethers';

import { mapOpenfortError } from './openfort-mapper';

/**
 * Minimal structural type for the Openfort SDK pieces we call. Keeping this
 * local means tests inject a fake without importing @openfort/openfort-node.
 * The real SDK is imported ONLY inside the clientFactory passed to the
 * constructor (deferred ESM — same pattern as the Particle fix that resolved
 * the Phase 1 runtime blocker). Demo mode never constructs this class at all.
 */
export interface OpenfortClientLike {
  accounts: {
    evm: {
      backend: {
        create(): Promise<{ id: string; address: string }>;
        sendTransaction(args: {
          account: { id: string };
          chainId: number;
          interactions: Array<{ to: string; data: string }>;
          policy: string;
        }): Promise<{ response: { transactionHash: string } }>;
      };
    };
  };
}

/**
 * A lazy factory that resolves the Openfort SDK client on first use. The
 * factory (not the client) is injected so `createAgentWallet` can stay
 * synchronous — the SDK import is deferred to the first `getAddress()` /
 * `settlePayment()` call, exactly like `ParticleAccountProvider.getInstance()`.
 */
export type OpenfortClientFactory = () => Promise<OpenfortClientLike>;

/**
 * The real factory, used by `createAgentWallet`. Defers the SDK import.
 */
export function createRealOpenfortClientFactory(config: {
  secretKey: string;
  walletSecret: string;
}): OpenfortClientFactory {
  return async () => {
    const Openfort = (await import('@openfort/openfort-node')).default;
    // Constructor: new Openfort(secretKey, { walletSecret }) — both required.
    return new Openfort(config.secretKey, { walletSecret: config.walletSecret }) as unknown as OpenfortClientLike;
  };
}

export class OpenfortAgentWallet implements AgentWalletPort {
  readonly label = 'Openfort gasless';

  private cachedAccount: { id: string; address: string } | null = null;
  private clientPromise: Promise<OpenfortClientLike> | null = null;

  constructor(
    private readonly clientFactory: OpenfortClientFactory,
    private readonly feeSponsorshipId: string,
    private readonly logger: LoggerPort,
  ) {}

  /**
   * Resolves the SDK client lazily and memoizes the promise so the deferred
   * import only happens once (even if getAddress + settlePayment race).
   */
  /**
   * Resolves the SDK client lazily and memoizes the promise so the deferred
   * import only happens once. Uses a promise-chain pattern to prevent
   * concurrent `getClient()` calls from racing on `clientFactory()`.
   */
  private async getClient(): Promise<Result<OpenfortClientLike, DomainError>> {
    if (!this.clientPromise) {
      this.clientPromise = this.clientFactory().catch((error) => {
        // Allow retry on a later call by clearing the cached promise on failure
        this.clientPromise = null;
        throw error;
      });
    }

    try {
      return ok(await this.clientPromise);
    } catch (error) {
      this.logger.error({ error }, 'Openfort SDK client load failed.');
      return err(mapOpenfortError(error, 'load Openfort SDK'));
    }
  }

  async getAddress(): Promise<Result<{ address: string }, DomainError>> {
    if (this.cachedAccount) {
      return ok({ address: this.cachedAccount.address });
    }

    const clientResult = await this.getClient();
    if (!clientResult.ok) {
      return clientResult;
    }

    try {
      const account = await clientResult.value.accounts.evm.backend.create();
      this.cachedAccount = { id: account.id, address: account.address };
      this.logger.info({ accountId: account.id, address: account.address }, 'Openfort agent wallet resolved.');
      return ok({ address: account.address });
    } catch (error) {
      this.logger.error({ error }, 'Openfort backend wallet creation failed.');
      return err(mapOpenfortError(error, 'resolve agent wallet'));
    }
  }

  async settlePayment(params: {
    to: string;
    amount: { value: number; currency: 'USD' };
    token: string;
    chainId: number;
  }): Promise<Result<TxResult, DomainError>> {
    const addressResult = await this.getAddress();
    if (!addressResult.ok) {
      return addressResult;
    }

    const clientResult = await this.getClient();
    if (!clientResult.ok) {
      return clientResult;
    }

    try {
      // Encode ERC-20 transfer(to, amount). USDC has 6 decimals.
      const erc20Interface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
      const amountWei = ethers.parseUnits(String(params.amount.value), 6);
      const data = erc20Interface.encodeFunctionData('transfer', [params.to, amountWei]);

      const result = await clientResult.value.accounts.evm.backend.sendTransaction({
        account: { id: this.cachedAccount!.id },
        chainId: params.chainId,
        interactions: [{ to: params.token, data }],
        policy: this.feeSponsorshipId,
      });

      this.logger.info(
        { txHash: result.response.transactionHash, chainId: params.chainId },
        'Openfort gasless settlement submitted.',
      );

      return ok({
        txHash: result.response.transactionHash,
        chainId: params.chainId,
      });
    } catch (error) {
      this.logger.error({ error, chainId: params.chainId }, 'Openfort settlement failed.');
      return err(mapOpenfortError(error, 'settle payment gasless'));
    }
  }
}
