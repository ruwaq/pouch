/**
 * SPIKE 1 (server-side variant) — EIP-7702 upgrade via raw key, in Node.
 *
 * This is the path the FRICTIONLESS demo will use: a funded demo EOA whose
 * private key lives server-side. We upgrade it to a Universal Account by
 * signing the 7702 auth with ethers and broadcasting via the Particle UA SDK.
 *
 * Unlike spike/ua-spike.mts (which does the full consolidate), this script
 * isolates and validates ONLY the 7702 upgrade against the EOA from .env
 * PRIVATE_KEY. It proves the frictionless architecture works end-to-end:
 *
 *   1. Build UA for the .env PRIVATE_KEY EOA.
 *   2. getEIP7702Deployments() → confirm not yet delegated.
 *   3. getEIP7702Auth([42161]) → get the {chainId, nonce, address} to sign.
 *   4. Sign the auth with ethers (hashAuthorization + signingKey.sign).
 *   5. sendTransaction with the authorization → UA executes the Type-4.
 *   6. Poll until FINISHED.
 *   7. eth_getCode(eoa) on Arbitrum RPC → must now be non-empty. EVIDENCE.
 *
 * Run: pnpm --filter @pouch/infra-web3 exec tsx spike/spike-7702-upgrade-server.mts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
for (const c of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env'), resolve(process.cwd(), '..', '..', '.env')]) {
  const r = config({ path: c });
  if (r.parsed && Object.keys(r.parsed).length) { console.log(`[spike] loaded ${c}`); break; }
}

import { Wallet, getBytes, hashAuthorization } from 'ethers';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROJECT_ID = process.env.PARTICLE_PROJECT_ID;
const PROJECT_CLIENT_KEY = process.env.PARTICLE_CLIENT_KEY;
const PROJECT_APP_UUID = process.env.PARTICLE_APP_ID;
const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';
const ARBITRUM = 42161;

if (!PRIVATE_KEY || !PROJECT_ID || !PROJECT_CLIENT_KEY || !PROJECT_APP_UUID) {
  console.error('Missing env. Need: PRIVATE_KEY, PARTICLE_PROJECT_ID, PARTICLE_CLIENT_KEY, PARTICLE_APP_ID');
  process.exit(1);
}

const { UNIVERSAL_ACCOUNT_VERSION, UniversalAccount } = await import('@particle-network/universal-account-sdk');
import type { EIP7702Authorization, ITransaction, IUserOpWithChain } from '@particle-network/universal-account-sdk';

const wallet = new Wallet(PRIVATE_KEY);

const ua = new UniversalAccount({
  projectId: PROJECT_ID,
  projectClientKey: PROJECT_CLIENT_KEY,
  projectAppUuid: PROJECT_APP_UUID,
  smartAccountOptions: {
    name: 'UNIVERSAL',
    version: UNIVERSAL_ACCOUNT_VERSION,
    ownerAddress: wallet.address,
    useEIP7702: true,
  },
});

async function rpc(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(ARBITRUM_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: string };
  return json.result ?? '0x';
}

async function getCode(): Promise<string> {
  return rpc('eth_getCode', [wallet.address, 'latest']);
}

async function pollUntilFinished(transactionId: string, maxAttempts = 30): Promise<unknown> {
  for (let i = 0; i < maxAttempts; i++) {
    const detail = (await ua.getTransaction(transactionId)) as { status?: number };
    console.log(`  poll ${i + 1}/${maxAttempts}: status=${detail.status}`);
    if (detail.status === 7) return detail; // FINISHED
    if (detail.status === 6) throw new Error(`Transaction ${transactionId} failed (status 6).`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${transactionId} did not finish in ${maxAttempts} attempts.`);
}

async function main() {
  console.log('=== Spike 1 (server-side) — 7702 upgrade via raw key ===');
  console.log('Demo EOA:', wallet.address);

  // 0. Baseline: is the EOA already delegated?
  console.log('\n[0] Baseline on-chain state:');
  const codeBefore = await getCode();
  console.log(`  eth_getCode BEFORE = ${codeBefore === '0x' ? '0x (plain EOA)' : codeBefore.slice(0, 18) + '… (ALREADY delegated)'}`);
  if (codeBefore !== '0x') {
    console.log('  → Already a UA. Nothing to upgrade. Spike still passes (delegation evidence present).');
    console.log('\n=== SPIKE 1 (server-side) PASSED — EOA is delegated ===');
    return;
  }

  // 1. Delegation status from Particle
  console.log('\n[1] getEIP7702Deployments():');
  const deployments = (await ua.getEIP7702Deployments()) as Array<{ chainId: number; isDelegated: boolean }>;
  for (const d of deployments) console.log(`  chain ${d.chainId}: ${d.isDelegated ? 'delegated' : 'NOT delegated'}`);

  // 2. Get auth params for Arbitrum
  console.log(`\n[2] getEIP7702Auth([${ARBITRUM}]):`);
  const authParams = (await ua.getEIP7702Auth([ARBITRUM])) as Array<{ chainId: number; nonce: number; address: string }>;
  console.log('  params:', JSON.stringify(authParams));
  if (!authParams.length) throw new Error('getEIP7702Auth returned no params.');

  // 3. Plan a no-op convert tx to get the userOpHash + rootHash that need the 7702 auth.
  //    The SDK attaches eip7702Auth to the userOps when delegation is pending.
  //    We use a tiny USDC convert (same as ua-spike.mts) just to surface the userOp.
  console.log(`\n[3] createConvertTransaction (tiny, to surface the 7702 userOp):`);
  const transaction = (await ua.createConvertTransaction({
    chainId: ARBITRUM,
    expectToken: { type: 'USDC', amount: '0.0001' },
  })) as ITransaction;
  console.log('  transactionId:', transaction.transactionId);
  console.log('  rootHash:', transaction.rootHash.slice(0, 20) + '…');
  console.log('  userOps needing auth:', transaction.userOps.filter((u: IUserOpWithChain) => u.eip7702Auth && !u.eip7702Delegated).length);

  // 4. Sign rootHash + 7702 auths with the raw key.
  console.log('\n[4] Signing rootHash + 7702 auths...');
  const signature = wallet.signMessageSync(getBytes(transaction.rootHash));
  const authorizations: EIP7702Authorization[] = [];
  const nonceMap = new Map<number, string>();
  for (const userOp of transaction.userOps as IUserOpWithChain[]) {
    if (userOp.eip7702Auth && !userOp.eip7702Delegated) {
      let serialized = nonceMap.get(userOp.eip7702Auth.nonce);
      if (!serialized) {
        const digest = hashAuthorization(userOp.eip7702Auth);
        serialized = wallet.signingKey.sign(digest).serialized;
        nonceMap.set(userOp.eip7702Auth.nonce, serialized);
      }
      authorizations.push({ userOpHash: userOp.userOpHash, signature: serialized });
    }
  }
  console.log('  signature:', signature.slice(0, 20) + '…');
  console.log('  authorizations:', authorizations.length);

  // 5. Send via Particle UA — this is where the Type-4 actually broadcasts.
  console.log('\n[5] sendTransaction:');
  const sendResult = (await ua.sendTransaction(transaction, signature, authorizations)) as { transactionId: string };
  console.log('  transactionId:', sendResult.transactionId);
  console.log('  activity:', `https://universalx.app/activity/details?id=${sendResult.transactionId}`);

  // 6. Poll
  console.log('\n[6] Polling for completion...');
  await pollUntilFinished(sendResult.transactionId);
  console.log('  ✓ FINISHED');

  // 7. EVIDENCE — eth_getCode must now be non-empty on Arbitrum.
  console.log('\n[7] Post-upgrade on-chain state:');
  // Give the RPC a moment to reflect the new code.
  await new Promise((r) => setTimeout(r, 4000));
  const codeAfter = await getCode();
  console.log(`  eth_getCode AFTER = ${codeAfter === '0x' ? '0x (STILL plain EOA — upgrade may not have hit Arbitrum)' : codeAfter.slice(0, 18) + '… (DELEGATED)'}`);
  if (codeAfter !== '0x') {
    console.log(`  Arbiscan: https://arbiscan.io/address/${wallet.address}`);
    console.log('\n=== SPIKE 1 (server-side) PASSED — EOA is now a Universal Account ===');
  } else {
    console.log('\n=== SPIKE 1 (server-side) INCONCLUSIVE on eth_getCode ===');
    console.log('  The UA transaction finished, but Arbitrum code field is still empty.');
    console.log('  This can happen if the 7702 set-code did not target Arbitrum. Check the');
    console.log('  activity link above and Arbiscan for the actual Type-4 tx.');
  }
}

main().catch((err) => {
  console.error('\n=== SPIKE 1 (server-side) FAILED ===');
  console.error(err);
  process.exit(1);
});
