/**
 * SPIKE — PLAN a convert transaction (no execution). dev-only. NOT shipped.
 *
 * Asks Particle UA to plan a convert to USDC on a target chain, using whatever
 * assets the EOA holds (it will sell ARB / bridge as needed). Returns the plan
 * WITHOUT signing or sending — lets us inspect what the consolidate would do
 * before spending anything.
 *
 * This is the planning half of Gate 2 (cross-chain consolidate).
 */
import { NextResponse } from 'next/server';
import { Wallet } from 'ethers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not Found', { status: 404 });

  const { targetChain, amount } = (await req.json().catch(() => ({}))) as { targetChain?: number; amount?: string };
  if (!targetChain || !amount) {
    return NextResponse.json({ error: 'targetChain and amount required' }, { status: 400 });
  }

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const projectId = process.env.PARTICLE_PROJECT_ID;
  const projectClientKey = process.env.PARTICLE_CLIENT_KEY;
  const projectAppUuid = process.env.PARTICLE_APP_ID;
  if (!PRIVATE_KEY || !projectId || !projectClientKey || !projectAppUuid) {
    return NextResponse.json({ error: 'PRIVATE_KEY + PARTICLE_* required' }, { status: 500 });
  }

  try {
    const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount, SUPPORTED_TOKEN_TYPE } = await import(
      '@particle-network/universal-account-sdk'
    );
    const wallet = new Wallet(PRIVATE_KEY);

    const ua = new UniversalAccount({
      projectId,
      projectClientKey,
      projectAppUuid,
      smartAccountOptions: { name: 'UNIVERSAL', version: UNIVERSAL_ACCOUNT_VERSION, ownerAddress: wallet.address, useEIP7702: true },
    });

    // PLAN ONLY — no sign, no send.
    const transaction = await ua.createConvertTransaction({
      chainId: targetChain,
      expectToken: { type: SUPPORTED_TOKEN_TYPE.USDC, amount },
    });

    // Inspect what this plan would do.
    const userOps = transaction.userOps.map((u: any) => ({
      chainId: u.chainId,
      userOpHash: (u.userOpHash as string)?.slice(0, 18),
      eip7702Delegated: u.eip7702Delegated,
      eip7702Auth: u.eip7702Auth,
      txs: (u.txs as any[])?.map((t) => ({ to: t.to, value: t.value, dataPrefix: (t.data as string)?.slice(0, 20) })),
      feeDeductions: u.feeDeductions,
    }));

    return NextResponse.json({
      ok: true,
      transactionId: transaction.transactionId,
      rootHash: transaction.rootHash.slice(0, 22),
      userOpsCount: transaction.userOps.length,
      userOps,
      tokenChanges: transaction.tokenChanges,
      totalDepositTokenAmountInUSD: transaction.totalDepositTokenAmountInUSD,
      transactionFees: transaction.transactionFees,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
