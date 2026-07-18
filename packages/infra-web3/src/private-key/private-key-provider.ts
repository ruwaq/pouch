import { ok, type Result } from '@pouch/shared';
import type { AccountProvider, Balance, DomainError, TxResult, UserId } from '@pouch/domain';
import { ethers } from 'ethers';
import type { Config } from '@pouch/shared';

// Minimal ERC-20 ABI for balanceOf + decimals
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// USDC addresses on mainnet
const USDC_ADDRESSES: Record<number, string> = {
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC Arbitrum
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // USDC Base
};

// Additional ERC-20 tokens to check (symbol, address, USD price)
const EXTRA_TOKENS: Array<{ symbol: string; chainId: number; address: string; price: number }> = [
  { symbol: 'ARB', chainId: 42161, address: '0x912CE59144191C1204E64559FE8253a0e49E6548', price: 0.088 },
  { symbol: 'USDT', chainId: 42161, address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', price: 1.0 },
  { symbol: 'USDT', chainId: 8453, address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', price: 1.0 },
];

// Public RPC URLs (fallback if no env var set)
const PUBLIC_RPC_URLS: Record<number, string> = {
  42161: 'https://arb1.arbitrum.io/rpc',
  8453: 'https://mainnet.base.org',
};

/**
 * Reads real on-chain balances from a pre-funded wallet using a private key.
 *
 * This provider is designed for demo/judge scenarios: a wallet is pre-created
 * and funded with small amounts of USDC/ETH on mainnet, and the private key
 * is stored as an env var. No Magic login required — the wallet is always
 * "logged in" as the demo user.
 *
 * Balance reading: real RPC calls to each configured chain.
 * consolidate() / sendPayment(): simulated (the agent wallet handles actual
 * settlement via Openfort).
 */
export class PrivateKeyAccountProvider implements AccountProvider {
  private readonly address: string;
  private readonly providers: Map<number, ethers.JsonRpcProvider>;
  private readonly chains: number[];

  constructor(config: Config) {
    if (!config.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY is required for private-key mode.');
    }

    const wallet = new ethers.Wallet(config.PRIVATE_KEY);
    this.address = wallet.address;

    this.chains = config.SUPPORTED_CHAINS;
    this.providers = new Map();

    for (const chainId of this.chains) {
      const rpcUrl = this.getRpcUrl(config, chainId);
      this.providers.set(chainId, new ethers.JsonRpcProvider(rpcUrl));
    }
  }

  private getRpcUrl(config: Config, chainId: number): string {
    switch (chainId) {
      case 42161: return config.RPC_URL_42161 || PUBLIC_RPC_URLS[42161]!;
      case 8453: return config.RPC_URL_8453 || PUBLIC_RPC_URLS[8453]!;
      default: return PUBLIC_RPC_URLS[chainId] ?? `https://chain-${chainId}.example.com`;
    }
  }

  async getUnifiedBalance(_userId: UserId): Promise<Result<Balance, DomainError>> {
    const assets: Balance['assets'] = [];
    let total = 0;

    for (const chainId of this.chains) {
      const provider = this.providers.get(chainId);
      if (!provider) continue;

      try {
        // Native token balance (ETH)
        const nativeBalance = await provider.getBalance(this.address);
        const nativeEth = Number(ethers.formatEther(nativeBalance));

        if (nativeEth > 0.0001) {
          const usdValue = nativeEth * 2500; // rough ETH price
          assets.push({
            chainId,
            symbol: 'ETH',
            amount: Number(nativeEth.toFixed(6)),
            usdValue: Number(usdValue.toFixed(2)),
          });
          total += usdValue;
        }

        // USDC balance
        const tokenAddress = USDC_ADDRESSES[chainId];
        if (tokenAddress) {
          const usdc = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const rawBalance = await (usdc as unknown as { balanceOf(a: string): Promise<bigint> }).balanceOf(this.address);
          const decimals = await (usdc as unknown as { decimals(): Promise<bigint> }).decimals();

          const usdcAmount = Number(ethers.formatUnits(rawBalance, Number(decimals)));

          if (usdcAmount > 0.01) {
            assets.push({
              chainId,
              symbol: 'USDC',
              amount: Number(usdcAmount.toFixed(2)),
              usdValue: Number(usdcAmount.toFixed(2)),
            });
            total += usdcAmount;
          }
        }

        // Extra tokens (ARB, USDT, etc.)
        for (const extra of EXTRA_TOKENS) {
          if (extra.chainId !== chainId) continue;
          try {
            const token = new ethers.Contract(extra.address, ERC20_ABI, provider);
            const rawBalance = await (token as unknown as { balanceOf(a: string): Promise<bigint> }).balanceOf(this.address);
            const decimals = await (token as unknown as { decimals(): Promise<bigint> }).decimals();
            const amount = Number(ethers.formatUnits(rawBalance, Number(decimals)));
            const minAmount = extra.symbol === 'ARB' ? 0.01 : 0.01;
            if (amount > minAmount) {
              const usdValue = amount * extra.price;
              assets.push({
                chainId,
                symbol: extra.symbol,
                amount: Number(amount.toFixed(4)),
                usdValue: Number(usdValue.toFixed(2)),
              });
              total += usdValue;
            }
          } catch {
            // Token read failed — skip
          }
        }
      } catch {
        // Chain unavailable — skip, don't fail the whole balance check
        continue;
      }
    }

    if (assets.length === 0) {
      return ok({
        total: 0,
        assets: [],
        requiresConsolidation: false,
      });
    }

    return ok({
      total: Number(total.toFixed(2)),
      assets,
      requiresConsolidation: assets.length > 1 && new Set(assets.map((a) => a.chainId)).size > 1,
    });
  }

  async consolidate(): Promise<Result<TxResult, DomainError>> {
    return ok({ txHash: '0xprivate-key-consolidation' });
  }

  async sendPayment(): Promise<Result<TxResult, DomainError>> {
    return ok({ txHash: '0xprivate-key-payment' });
  }
}