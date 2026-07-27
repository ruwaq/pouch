/**
 * SPIKE — EXECUTE a convert transaction end-to-end. dev-only. NOT shipped.
 *
 * Plan → sign rootHash → sign 7702 auths (none needed, already delegated) →
 * sendTransaction → poll → return real tx hashes.
 *
 * This is the core of Gate 2. Same signing path as the upgrade, but the bundle
 * now does a real convert (swap and/or bridge).
 */
import { NextResponse } from 'next/server';
import { Wallet, getBytes, hashAuthorization } from 'ethers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not Found', { status: 404 });

  const { targetChain, amount, token } = (await req.json().catch(() => ({}))) as {
    targetChain?: number;
    amount?: string;
    token?: 'USDC' | 'ETH';
  };
  if (!targetChain || !amount || !token) {
    return NextResponse.json({ error: 'targetChain, amount, token required' }, { status: 400 });
  }

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const projectId = process.env.PARTICLE_PROJECT_ID;
  const projectClientKey = process.env.PARTICLE_CLIENT_KEY;
  const projectAppUuid = process.env.PARTICLE_APP_ID;
  if (!PRIVATE_KEY || !projectId || !projectClientKey || !projectAppUuid) {
    return NextResponse.json({ error: 'PRIVATE_KEY + PARTICLE_* required' }, { status: 500 });
  }

  const log: string[] = [];
  const push = (s: string) => { log.push(s); console.log('[spike-convert]', s); };

  try {
    const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount, SUPPORTED_TOKEN_TYPE } = await import(
      '@particle-network/universal-account-sdk'
    );
    const wallet = new Wallet(PRIVATE_KEY);
    push(`EOA: ${wallet.address}`);
    push(`Convert → ${amount} ${token} on chain ${targetChain}`);

    const ua = new UniversalAccount({
      projectId,
      projectClientKey,
      projectAppUuid,
      smartAccountOptions: { name: 'UNIVERSAL', version: UNIVERSAL_ACCOUNT_VERSION, ownerAddress: wallet.address, useEIP7702: true },
    });

    const expectType = token === 'USDC' ? SUPPORTED_TOKEN_TYPE.USDC : SUPPORTED_TOKEN_TYPE.ETH;
    const transaction = await ua.createConvertTransaction({
      chainId: targetChain,
      expectToken: { type: expectType, amount },
    });
    push(`Planned: tx ${transaction.transactionId}, ${transaction.userOps.length} userOps`);

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
    push(`Signed: ${authorizations.length} authorizations`);

    const sendResult = (await ua.sendTransaction(transaction, signature, authorizations)) as { transactionId: string };
    push(`Sent: ${sendResult.transactionId}`);
    push(`Activity: https://universalx.app/activity/details?id=${sendResult.transactionId}`);

    // Poll for completion. Cross-chain can take a few minutes.
    let status = -1;
    for (let i = 0; i < 60; i++) {
      const detail = (await ua.getTransaction(sendResult.transactionId)) as { status?: number };
      status = detail.status ?? -1;
      push(`  poll ${i + 1}/60: status=${status}`);
      if (status === 7) break;
      if (status === 6) throw new Error('UA tx failed (status 6)');
      await new Promise((r) => setTimeout(r, 3000));
    }
    push(`Final status: ${status}${status === 7 ? ' (FINISHED ✓)' : ' (TIMEOUT — check activity link)'}`);

    return NextResponse.json({
      ok: status === 7,
      transactionId: sendResult.transactionId,
      activity: `https://universalx.app/activity/details?id=${sendResult.transactionId}`,
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    push(`ERROR: ${message}`);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });
  }
}
