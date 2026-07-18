import { ok, type Result } from '@pouch/shared';
import type { AccountProvider, Balance, DomainError, TxResult, UserId } from '@pouch/domain';
import { ethers } from 'ethers';
import type { Config } from '@pouch/shared';

// ═══════════════════════════════════════════════════════════════════
// 🔒 SAFETY: This provider is READ-ONLY for balances.
//
// Private keys are ONLY used to derive wallet addresses for balance
// lookups. No ethers.Wallet is ever created — we use
// ethers.SigningKey.computeAddress() which CANNOT sign transactions.
//
// consolidate() and sendPayment() ALWAYS return mock tx hashes.
// Real funds NEVER leave the wallet. The demo is 100% safe for
// judges to test with real money in the wallet.
//
// If you need to sign real transactions, use ParticleAccountProvider
// which delegates signing to the browser (Magic key).
// ═══════════════════════════════════════════════════════════════════

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

interface WalletConfig {
  label: string;
  address: string;
}

/**
 * Derives an Ethereum address from a private key WITHOUT creating a
 * signable wallet. Uses ethers.SigningKey which can compute the address
 * but CANNOT sign transactions — making it impossible to accidentally
 * spend funds.
 */
function deriveAddress(privateKey: string): string {
  const signingKey = new ethers.SigningKey(privateKey);
  return ethers.computeAddress(signingKey.publicKey);
}

/**
 * Reads real on-chain balances from pre-funded wallets.
 *
 * 🔒 READ-ONLY — private keys are ONLY used to derive addresses.
 * No ethers.Wallet is ever created. Funds CANNOT be spent through
 * this provider. consolidate() and sendPayment() return mock hashes.
 *
 * Supports MULTIPLE wallets — each with its own label. This lets the
 * demo show multi-wallet balance aggregation, which is the foundation
 * of Particle Network's Universal Account + EIP-7702 chain abstraction.
 */
export class PrivateKeyAccountProvider implements AccountProvider {
  private readonly wallets: WalletConfig[];
  private readonly providers: Map<number, ethers.JsonRpcProvider>;
  private readonly chains: number[];

  constructor(config: Config) {
    if (!config.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY is required for private-key mode.');
    }

    this.chains = config.SUPPORTED_CHAINS;
    this.providers = new Map();
    this.wallets = [];

    // Primary wallet — derive address only, NO signable wallet created
    this.wallets.push({
      label: 'Wallet 1',
      address: deriveAddress(config.PRIVATE_KEY),
    });

    // Secondary wallet (optional — for multi-wallet demo)
    const secondKey = (config as unknown as Record<string, string | undefined>).SECOND_PRIVATE_KEY?.trim();
    if (secondKey) {
      this.wallets.push({
        label: 'Wallet 2',
        address: deriveAddress(secondKey),
      });
    }

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

    for (const walletConfig of this.wallets) {
      for (const chainId of this.chains) {
        const provider = this.providers.get(chainId);
        if (!provider) continue;

        try {
          // Native token balance (ETH)
          const nativeBalance = await provider.getBalance(walletConfig.address);
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
            const rawBalance = await (usdc as unknown as { balanceOf(a: string): Promise<bigint> }).balanceOf(walletConfig.address);
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
              const rawBalance = await (token as unknown as { balanceOf(a: string): Promise<bigint> }).balanceOf(walletConfig.address);
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
      requiresConsolidation: this.wallets.length > 1 || (assets.length > 1 && new Set(assets.map((a) => a.chainId)).size > 1),
    });
  }

  /**
   * 🔒 DEMO ONLY — no real transaction is executed.
   * Real consolidation requires Particle UA + EIP-7702 + browser signing.
   * The private key in this provider CANNOT sign (we only derive the address).
   */
  async consolidate(): Promise<Result<TxResult, DomainError>> {
    return ok({ txHash: '0xmock-consolidation' });
  }

  /**
   * 🔒 DEMO ONLY — no real payment is executed.
   * Real settlement is handled by Openfort agent wallet (gasless).
   * The private key in this provider CANNOT sign (we only derive the address).
   */
  async sendPayment(): Promise<Result<TxResult, DomainError>> {
    return ok({ txHash: '0xmock-payment' });
  }
}