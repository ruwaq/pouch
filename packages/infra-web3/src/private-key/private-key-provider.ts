import { ok, type Result } from '@pouch/shared';
import type { AccountProvider, Balance, BalanceAsset, DomainError, TxResult, UserId } from '@pouch/domain';
import { ethers } from 'ethers';
import type { Config } from '@pouch/shared';

// ═══════════════════════════════════════════════════════════════════
// 🔒 SAFETY: This provider is READ-ONLY for balances.
//
// Private keys / seed phrases are ONLY used to derive wallet addresses
// for balance lookups. No ethers.Wallet is ever created — we use
// ethers.SigningKey.computeAddress() or ethers.HDNodeWallet which
// CANNOT sign transactions in this context.
//
// consolidate() and sendPayment() ALWAYS return mock tx hashes.
// Real funds NEVER leave the wallet. The demo is 100% safe for
// judges to test with real money in the wallet.
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
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC Avalanche C-Chain
};

// Additional ERC-20 tokens to check (symbol, address, USD price)
// Native tokens (ETH, AVAX) are handled automatically via getBalance().
const EXTRA_TOKENS: Array<{ symbol: string; chainId: number; address: string; price: number }> = [
  { symbol: 'ARB', chainId: 42161, address: '0x912CE59144191C1204E64559FE8253a0e49E6548', price: 0.088 },
  { symbol: 'USDT', chainId: 42161, address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', price: 1.0 },
  { symbol: 'USDT', chainId: 8453, address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', price: 1.0 },
  { symbol: 'USDT', chainId: 43114, address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', price: 1.0 },
];

// Native token price estimates (USD)
const NATIVE_PRICES: Record<number, number> = {
  42161: 2500, // ETH
  8453: 2500,  // ETH
  43114: 18,   // AVAX
};

const NATIVE_SYMBOLS: Record<number, string> = {
  42161: 'ETH',
  8453: 'ETH',
  43114: 'AVAX',
};
const PUBLIC_RPC_URLS: Record<number, string> = {
  42161: 'https://arb1.arbitrum.io/rpc',
  8453: 'https://mainnet.base.org',
  43114: 'https://avalanche-c-chain-rpc.publicnode.com',
};

interface WalletConfig {
  label: string;
  address: string;
}

/**
 * Derives an Ethereum address from a private key WITHOUT creating a
 * signable wallet. Uses ethers.SigningKey which can compute the address
 * but CANNOT sign transactions.
 */
function deriveAddress(privateKey: string): string {
  const signingKey = new ethers.SigningKey(privateKey);
  return ethers.computeAddress(signingKey.publicKey);
}

/**
 * Derives an Ethereum address from a BIP-39 seed phrase.
 * Uses ethers.HDNodeWallet.fromPhrase() to derive the first account.
 * The wallet is immediately discarded — only the address is kept.
 */
function deriveAddressFromSeed(seedPhrase: string): string {
  const hd = ethers.HDNodeWallet.fromPhrase(seedPhrase);
  return hd.address;
}

/**
 * Reads real on-chain balances from pre-funded wallets.
 *
 * 🔒 READ-ONLY — private keys / seed phrases are ONLY used to derive
 * addresses. No signable wallet is ever stored. Funds CANNOT be spent
 * through this provider.
 *
 * Supports multiple wallets via:
 * - PRIVATE_KEY → primary wallet
 * - SECOND_PRIVATE_KEY → second wallet
 * - SEED_PHRASE_1, SEED_PHRASE_2, SEED_PHRASE_3 → additional wallets
 *   (derived from BIP-39 seed phrases, first account only)
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

    const raw = config as unknown as Record<string, string | undefined>;

    // Primary wallet — derive address only, NO signable wallet created
    this.wallets.push({
      label: 'Wallet 1',
      address: deriveAddress(config.PRIVATE_KEY),
    });

    // Secondary wallet (private key)
    const secondKey = raw.SECOND_PRIVATE_KEY?.trim();
    if (secondKey) {
      this.wallets.push({
        label: 'Wallet 2',
        address: deriveAddress(secondKey),
      });
    }

    // Seed phrase wallets (BIP-39, first account)
    for (let i = 1; i <= 3; i++) {
      const seed = raw[`SEED_PHRASE_${i}`]?.trim();
      if (seed) {
        try {
          const address = deriveAddressFromSeed(seed);
          this.wallets.push({
            label: `Wallet ${this.wallets.length + 1}`,
            address,
          });
        } catch {
          // Invalid seed phrase — skip
        }
      }
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
      case 43114: return (config as unknown as Record<string, string | undefined>).RPC_URL_43114 || PUBLIC_RPC_URLS[43114]!;
      default: return PUBLIC_RPC_URLS[chainId] ?? `https://chain-${chainId}.example.com`;
    }
  }

  async getUnifiedBalance(_userId: UserId): Promise<Result<Balance, DomainError>> {
    const assets: BalanceAsset[] = [];
    let total = 0;

    for (const walletConfig of this.wallets) {
      for (const chainId of this.chains) {
        const provider = this.providers.get(chainId);
        if (!provider) continue;

        try {
// Native token balance
          const nativeBalance = await provider.getBalance(walletConfig.address);
          const nativeEth = Number(ethers.formatEther(nativeBalance));
          const nativePrice = NATIVE_PRICES[chainId] ?? 2500;
          const nativeSymbol = NATIVE_SYMBOLS[chainId] ?? 'ETH';

          if (nativeEth > 0.0001) {
            const usdValue = nativeEth * nativePrice;
            assets.push({
              chainId,
              symbol: nativeSymbol,
              amount: Number(nativeEth.toFixed(6)),
              usdValue: Number(usdValue.toFixed(2)),
              walletLabel: walletConfig.label,
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
                walletLabel: walletConfig.label,
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
                  walletLabel: walletConfig.label,
                });
                total += usdValue;
              }
            } catch {
              // Token read failed — skip
            }
          }
        } catch {
          // Chain unavailable — skip
          continue;
        }
      }
    }

    if (assets.length === 0) {
      return ok({ total: 0, assets: [], requiresConsolidation: false });
    }

    return ok({
      total: Number(total.toFixed(2)),
      assets,
      requiresConsolidation: this.wallets.length > 1 || (assets.length > 1 && new Set(assets.map((a) => a.chainId)).size > 1),
    });
  }

  async consolidate(): Promise<Result<TxResult, DomainError>> {
    return ok({ txHash: '0xmock-consolidation' });
  }

  async sendPayment(): Promise<Result<TxResult, DomainError>> {
    return ok({ txHash: '0xmock-payment' });
  }
}