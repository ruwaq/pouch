/**
 * SPIKE — delegate the demo EOA on a target chain via Particle UA (7702).
 * dev-only. NOT shipped.
 *
 * This performs the SAME upgrade operation Gate 1 did for Arbitrum, but for an
 * arbitrary chain. Used to delegate Base (8453) before the cross-chain consolidate.
 *
 * IMPORTANT: the upgrade needs gas on Arbitrum (where the bundle is submitted),
 * NOT on the target chain. So delegating Base is payable from existing Arbitrum ETH.
 */
import { NextResponse } from 'next/server';
import { Wallet, getBytes, hashAuthorization } from 'ethers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function rpcCall(rpc: string, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: string };
  return json.result ?? '0x';
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not Found', { status: 404 });

  const { targetChain } = (await req.json().catch(() => ({}))) as { targetChain?: number };
  if (!targetChain) return NextResponse.json({ error: 'targetChain required' }, { status: 400 });

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const projectId = process.env.PARTICLE_PROJECT_ID;
  const projectClientKey = process.env.PARTICLE_CLIENT_KEY;
  const projectAppUuid = process.env.PARTICLE_APP_ID;
  if (!PRIVATE_KEY || !projectId || !projectClientKey || !projectAppUuid) {
    return NextResponse.json({ error: 'PRIVATE_KEY + PARTICLE_* required' }, { status: 500 });
  }

  const RPC: Record<number, string> = {
    42161: 'https://arb1.arbitrum.io/rpc',
    8453: 'https://mainnet.base.org',
  };
  const rpc = RPC[targetChain];
  if (!rpc) return NextResponse.json({ error: `no RPC for chain ${targetChain}` }, { status: 400 });

  const log: string[] = [];
  const push = (s: string) => { log.push(s); console.log('[spike-delegate]', s); };

  try {
    const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount, SUPPORTED_TOKEN_TYPE } = await import(
      '@particle-network/universal-account-sdk'
    );
    const wallet = new Wallet(PRIVATE_KEY);
    push(`EOA ${wallet.address} → delegating on chain ${targetChain}`);

    // Already delegated?
    const codeBefore = await rpcCall(rpc, 'eth_getCode', [wallet.address, 'latest']);
    push(`eth_getCode BEFORE = ${codeBefore === '0x' ? '0x' : 'non-empty'}`);
    if (codeBefore !== '0x') {
      return NextResponse.json({ ok: true, alreadyDelegated: true, log });
    }

    const ua = new UniversalAccount({
      projectId,
      projectClientKey,
      projectAppUuid,
      smartAccountOptions: { name: 'UNIVERSAL', version: UNIVERSAL_ACCOUNT_VERSION, ownerAddress: wallet.address, useEIP7702: true },
    });

    const authParams = (await ua.getEIP7702Auth([targetChain])) as Array<{ chainId: number; nonce: number; address: string }>;
    push(`getEIP7702Auth([${targetChain}]) → ${JSON.stringify(authParams)}`);

    // Surface the 7702 userOp via a tiny convert targeting the destination chain.
    const transaction = await ua.createConvertTransaction({
      chainId: targetChain,
      expectToken: { type: SUPPORTED_TOKEN_TYPE.USDC, amount: '0.0001' },
    });
    push(`tx ${transaction.transactionId}, userOps needing auth: ${transaction.userOps.filter((u: any) => u.eip7702Auth && !u.eip7702Delegated).length}`);

    const signature = wallet.signMessageSync(getBytes(transaction.rootHash));
    const authorizations: { userOpHash: string; signature: string }[] = [];
    const nonceMap = new Map<number, string>();
    for (const userOp of transaction.userOps as any[]) {
      const auth = userOp.eip7702Auth as { chainId: number; nonce: number; address: string } | undefined;
      if (auth && !userOp.eip7702Delegated) {
        let serialized = nonceMap.get(auth.nonce);
        if (!serialized) {
          serialized = wallet.signingKey.sign(hashAuthorization(auth)).serialized;
          nonceMap.set(auth.nonce, serialized);
        }
        authorizations.push({ userOpHash: userOp.userOpHash as string, signature: serialized });
      }
    }

    const sendResult = (await ua.sendTransaction(transaction, signature, authorizations)) as { transactionId: string };
    push(`sendTransaction → ${sendResult.transactionId}`);

    let status = -1;
    for (let i = 0; i < 30; i++) {
      const detail = (await ua.getTransaction(sendResult.transactionId)) as { status?: number };
      status = detail.status ?? -1;
      if (status === 7) break;
      if (status === 6) throw new Error('UA tx failed (status 6)');
      await new Promise((r) => setTimeout(r, 2000));
    }
    push(`final status: ${status}${status === 7 ? ' (FINISHED)' : ' (TIMEOUT)'}`);

    await new Promise((r) => setTimeout(r, 4000));
    const codeAfter = await rpcCall(rpc, 'eth_getCode', [wallet.address, 'latest']);
    push(`eth_getCode AFTER = ${codeAfter === '0x' ? '0x (STILL plain)' : 'non-empty (DELEGATED ✓)'}`);

    return NextResponse.json({
      ok: codeAfter !== '0x',
      chainId: targetChain,
      codeAfter: codeAfter.slice(0, 20),
      explorer: `https://${targetChain === 8453 ? 'basescan' : 'arbiscan'}.org/address/${wallet.address}`,
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    push(`ERROR: ${message}`);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });
  }
}
