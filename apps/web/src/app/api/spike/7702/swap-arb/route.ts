/**
 * SPIKE — swap ARB → ETH on Arbitrum via Uniswap V3 SwapRouter02. dev-only.
 *
 * Path: ARB → WETH (V3 pool fee 3000) then unwrap WETH → ETH, in a single
 * multicall so the EOA ends with ETH (not WETH). The UA convert later uses
 * ETH natively.
 *
 * Signed and broadcast by the server (raw key in .env) — the frictionless path.
 */
import { NextResponse } from 'next/server';
import { Wallet, formatEther, JsonRpcProvider, Contract, Interface } from 'ethers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';
const ARB = '0x912CE59144191C1204E64559FE8253a0e49E6548';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const SWAP_ROUTER_02 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';

interface TxLike { hash: string; wait: () => Promise<{ status: number | null }> }

// SwapRouter02 multicall(exactInputSingle + unwrapWETH9).
const ROUTER_IFACE = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
  'function multicall(bytes[] data) external payable returns (bytes[])',
]);
const ERC20_IFACE = new Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
]);

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not Found', { status: 404 });

  const { amountArb } = (await req.json().catch(() => ({}))) as { amountArb?: string };
  if (!amountArb) return NextResponse.json({ error: 'amountArb required' }, { status: 400 });

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) return NextResponse.json({ error: 'PRIVATE_KEY required' }, { status: 500 });

  const log: string[] = [];
  const push = (s: string) => { log.push(s); console.log('[spike-swap]', s); };

  try {
    const provider = new JsonRpcProvider(ARBITRUM_RPC);
    const wallet = new Wallet(PRIVATE_KEY, provider);
    const amountIn = BigInt(Math.round(parseFloat(amountArb) * 1e18));

    push(`EOA: ${wallet.address}`);
    push(`Swapping ${amountArb} ARB → ETH via Uniswap V3 (fee 3000, ARB→WETH→unwrap)`);

    // 1. Approve router to spend ARB.
    const allowanceData = ERC20_IFACE.encodeFunctionData('allowance', [wallet.address, SWAP_ROUTER_02]);
    const allowanceRes = await provider.call({ to: ARB, data: allowanceData });
    const currentAllowance = BigInt(allowanceRes === '0x' ? '0x0' : allowanceRes);
    if (currentAllowance < amountIn) {
      push(`Approving router for ${amountArb} ARB…`);
      const approveData = ERC20_IFACE.encodeFunctionData('approve', [SWAP_ROUTER_02, amountIn]);
      const approveTxHash = await wallet.sendTransaction({ to: ARB, data: approveData });
      const approveTx = await approveTxHash.wait();
      push(`✓ Approved (tx ${approveTxHash.hash}, status ${approveTx!.status})`);
    } else {
      push(`Allowance sufficient (${currentAllowance})`);
    }

    // 2. Build multicall: exactInputSingle ARB→WETH to router + unwrapWETH9 to EOA.
    const exactInputData = ROUTER_IFACE.encodeFunctionData('exactInputSingle', [
      {
        tokenIn: ARB,
        tokenOut: WETH,
        fee: 3000,
        recipient: SWAP_ROUTER_02,
        amountIn,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ]);
    const unwrapData = ROUTER_IFACE.encodeFunctionData('unwrapWETH9', [0n, wallet.address]);
    const multicallData = ROUTER_IFACE.encodeFunctionData('multicall', [[exactInputData, unwrapData]]);

    push(`Sending multicall (exactInputSingle + unwrapWETH9)…`);
    const sentTx = (await wallet.sendTransaction({ to: SWAP_ROUTER_02, data: multicallData })) as TxLike;
    const receipt = await sentTx.wait();
    push(`✓ Swap tx confirmed: ${sentTx.hash} (status ${receipt!.status})`);

    // 3. Report new balances.
    const newEthBal = await provider.getBalance(wallet.address);
    push(`New ETH balance: ${formatEther(newEthBal)}`);
    return NextResponse.json({
      ok: receipt!.status === 1,
      txHash: sentTx.hash,
      arbiscan: `https://arbiscan.io/tx/${sentTx.hash}`,
      newEthBalance: formatEther(newEthBal),
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    push(`ERROR: ${message}`);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });
  }
}
