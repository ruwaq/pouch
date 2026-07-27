/**
 * SPIKE — read-only multi-chain state of the demo EOA. dev-only, NOT shipped.
 * Lets us see what the Gate 2 consolidate has to work with, without a script.
 */
import { NextResponse } from 'next/server';
import { Wallet, formatEther } from 'ethers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CHAINS: [string, number, string][] = [
  ['arbitrum', 42161, 'https://arb1.arbitrum.io/rpc'],
  ['base', 8453, 'https://mainnet.base.org'],
];

// ERC-20 balanceOf(address) selector = 0x70a08231
async function erc20Balance(rpc: string, token: string, holder: string): Promise<bigint> {
  const data = '0x70a08231' + holder.slice(2).padStart(64, '0');
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: token, data }, 'latest'] }),
  });
  const json = (await res.json()) as { result?: string };
  return BigInt(json.result ?? '0x0');
}

async function rpcCall(rpc: string, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: string };
  return json.result ?? '0x';
}

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) return NextResponse.json({ error: 'PRIVATE_KEY missing' }, { status: 500 });
  const wallet = new Wallet(PRIVATE_KEY);

  // Well-known USDC addresses (6 decimals on both chains).
  const USDC: Record<number, string> = {
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum native USDC
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base native USDC
  };

  const out: Record<string, unknown> = { eoa: wallet.address };
  for (const [name, chainId, rpc] of CHAINS) {
    const [ethHex, code] = await Promise.all([
      rpcCall(rpc, 'eth_getBalance', [wallet.address, 'latest']),
      rpcCall(rpc, 'eth_getCode', [wallet.address, 'latest']),
    ]);
    const usdc = await erc20Balance(rpc, USDC[chainId]!, wallet.address);
    out[name] = {
      chainId,
      eth: formatEther(BigInt(ethHex)),
      usdc: (Number(usdc) / 1e6).toFixed(6),
      delegated: code !== '0x',
      codePrefix: code.slice(0, 18),
      usdcToken: USDC[chainId],
    };
  }
  return NextResponse.json(out);
}
