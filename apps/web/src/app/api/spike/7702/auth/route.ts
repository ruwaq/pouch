/**
 * SPIKE 1 — server half (dev-only). NOT shipped to production.
 *
 * Calls Particle UA's `getEIP7702Auth(chainIds)` server-side to obtain the
 * { contractAddress, nonce, chainId } the browser must sign via Magic. This
 * route performs NO signing and NO broadcasting — it only plans. The browser
 * signs + broadcasts the Type-4 upgrade (spec decision #1).
 *
 * Why a route and not a Node script: `magic.wallet.sign7702Authorization` is a
 * PromiEvent that drives Magic's iframe (it emits `closed-by-user`). It cannot
 * run in Node. So the gate that validates the *production* Magic path must run
 * in a browser, which means the planning half has to be reachable from there.
 *
 * Returns 404 in production so this can never be reached in a deployed build.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ARBITRUM_MAINNET = 42161;
const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';

// Minimal JSON-RPC helper — avoids adding an ethers/viem dep to apps/web just
// for this throwaway spike. Reads balance + code in a single round-trip batch.
async function rpcBatch(address: string): Promise<{ balance: string; code: string }> {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_callBundle',
    // batch of two requests
    params: [],
  };
  void body;
  // Node 18+ has global fetch. Use two parallel calls (simpler than a batch).
  const [balRes, codeRes] = await Promise.all([
    fetch(ARBITRUM_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
    }).then((r) => r.json() as Promise<{ result?: string }>),
    fetch(ARBITRUM_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getCode', params: [address, 'latest'] }),
    }).then((r) => r.json() as Promise<{ result?: string }>),
  ]);
  return { balance: balRes.result ?? '0x0', code: codeRes.result ?? '0x' };
}

export async function POST(req: Request) {
  // Hard dev-only guard. This whole route tree is a throwaway spike.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  let body: { ownerAddress?: string; chainIds?: number[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ownerAddress = body.ownerAddress?.trim();
  if (!ownerAddress || !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
    return NextResponse.json({ error: 'ownerAddress must be a 0x-prefixed address' }, { status: 400 });
  }
  const chainIds = Array.isArray(body.chainIds) && body.chainIds.length ? body.chainIds : [ARBITRUM_MAINNET];

  const projectId = process.env.PARTICLE_PROJECT_ID;
  const projectClientKey = process.env.PARTICLE_CLIENT_KEY;
  const projectAppUuid = process.env.PARTICLE_APP_ID; // SDK field is "projectAppUuid"
  if (!projectId || !projectClientKey || !projectAppUuid) {
    return NextResponse.json(
      { error: 'PARTICLE_PROJECT_ID / PARTICLE_CLIENT_KEY / PARTICLE_APP_ID not set in .env' },
      { status: 500 },
    );
  }

  try {
    // Deferred import — the SDK's "exports" is fragile under bundlers; it is
    // listed in next.config.ts serverExternalPackages so it stays external.
    const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount } = await import(
      '@particle-network/universal-account-sdk'
    );

    const ua = new UniversalAccount({
      projectId,
      projectClientKey,
      projectAppUuid,
      smartAccountOptions: {
        name: 'UNIVERSAL',
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress,
        useEIP7702: true,
      },
    });

    // 1. Current delegation status (which chains are already upgraded).
    const deployments = (await ua.getEIP7702Deployments()) as unknown;

    // 2. Auth params for the chains we want to upgrade.
    const auth = (await ua.getEIP7702Auth(chainIds)) as unknown;

    // 3. Server-side RPC checks (on-chain state — done here, not in the browser,
    //    so the page never has to call a public RPC itself; mirrors how the
    //    production app proxies all chain access server-side).
    const { balance, code } = await rpcBatch(ownerAddress);

    return NextResponse.json({
      ownerAddress,
      requestedChainIds: chainIds,
      deployments,
      auth,
      onChain: {
        arbitrumEthBalance: BigInt(balance).toString(),
        eoaCode: code,
        isDelegated: code !== '0x',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'getEIP7702Auth failed', message }, { status: 500 });
  }
}
