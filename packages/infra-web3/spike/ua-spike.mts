/**
 * Pouch — Phase 1 web3 spike (RAW KEY, real mainnet funds ~$0.01-0.05).
 *
 * Validates the full Particle Universal Account flow end-to-end in Node:
 *   1. Instantiate UniversalAccount with a raw EOA key
 *   2. getPrimaryAssets() → see aggregated balance
 *   3. createConvertTransaction() → plan a tiny USDC consolidation to Arbitrum
 *   4. Sign rootHash + 7702 auths with the raw key (ethers v6)
 *   5. sendTransaction() → execute
 *   6. getTransaction() → poll until FINISHED
 *
 * This script is NOT shipped. It lives in spike/ (excluded from build).
 * Reference: github.com/Particle-Network/universal-account-example (examples/7702-convert-evm.ts)
 *
 * Run: SPIKE_PRIVATE_KEY=0x... pnpm --filter @pouch/infra-web3 spike
 */
import 'dotenv/config';

import { Wallet, getBytes, hashAuthorization } from 'ethers';
import {
  CHAIN_ID,
  UNIVERSAL_ACCOUNT_VERSION,
  UniversalAccount,
  type EIP7702Authorization,
  type ITransaction,
  type IUserOpWithChain,
} from '@particle-network/universal-account-sdk';

// --- Spike config (all from env; never hardcode) ---
const PRIVATE_KEY = process.env.SPIKE_PRIVATE_KEY;
const PROJECT_ID = process.env.PARTICLE_PROJECT_ID;
const PROJECT_CLIENT_KEY = process.env.PARTICLE_CLIENT_KEY;
const PROJECT_APP_UUID = process.env.PARTICLE_APP_ID; // SDK field is "projectAppUuid"
const TARGET_CHAIN = process.env.SPIKE_TARGET_CHAIN ? Number(process.env.SPIKE_TARGET_CHAIN) : CHAIN_ID.ARBITRUM_MAINNET_ONE;
const CONVERT_AMOUNT = process.env.SPIKE_CONVERT_AMOUNT ?? '0.0001'; // tiny, ~$0.0001 USDC

if (!PRIVATE_KEY || !PROJECT_ID || !PROJECT_CLIENT_KEY || !PROJECT_APP_UUID) {
  console.error('Missing required env. Set SPIKE_PRIVATE_KEY, PARTICLE_PROJECT_ID, PARTICLE_CLIENT_KEY, PARTICLE_APP_ID.');
  process.exit(1);
}

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

async function signTransaction(transaction: ITransaction): Promise<{ signature: string; authorizations: EIP7702Authorization[] }> {
  // Sign the rootHash (EIP-191 personal_sign). signMessageSync is fine for a raw key.
  const signature = wallet.signMessageSync(getBytes(transaction.rootHash));

  // Walk userOps; sign any 7702 auth that isn't already delegated.
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

  return { signature, authorizations };
}

async function pollUntilFinished(transactionId: string, maxAttempts = 20): Promise<unknown> {
  for (let i = 0; i < maxAttempts; i++) {
    const detail = (await ua.getTransaction(transactionId)) as { status?: number };
    console.log(`  poll ${i + 1}/${maxAttempts}: status=${detail.status}`);
    if (detail.status === 7) {
      // FINISHED
      return detail;
    }
    if (detail.status === 6) {
      // EXECUTION_FAILED
      throw new Error(`Transaction ${transactionId} failed (status 6).`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Transaction ${transactionId} did not finish in ${maxAttempts} attempts.`);
}

async function main() {
  console.log('=== Pouch UA spike ===');
  console.log('EOA address:', wallet.address);

  // 1. Check delegation status
  console.log('\n[1] EIP-7702 delegation status:');
  const deployments = (await ua.getEIP7702Deployments()) as Array<{ chainId: number; isDelegated: boolean }>;
  for (const d of deployments) {
    console.log(`  chain ${d.chainId}: ${d.isDelegated ? 'delegated ✓' : 'NOT delegated'}`);
  }

  // 2. Read unified balance
  console.log('\n[2] Unified balance (getPrimaryAssets):');
  const assets = await ua.getPrimaryAssets();
  console.log(`  total USD: ${assets.totalAmountInUSD}`);
  for (const asset of assets.assets) {
    console.log(`  ${asset.tokenType}: ${asset.amount} ($${asset.amountInUSD})`);
  }

  // 3. Plan a tiny convert → USDC on target chain
  console.log(`\n[3] createConvertTransaction (→ USDC ${CONVERT_AMOUNT} on chain ${TARGET_CHAIN}):`);
  const transaction = await ua.createConvertTransaction({
    chainId: TARGET_CHAIN,
    expectToken: { type: 'USDC', amount: CONVERT_AMOUNT },
  });
  console.log('  transactionId:', transaction.transactionId);
  console.log('  rootHash:', transaction.rootHash);
  console.log('  userOps:', transaction.userOps.length);
  console.log('  needs 7702 auth:', transaction.userOps.some((u: IUserOpWithChain) => u.eip7702Auth && !u.eip7702Delegated));

  // 4. Sign
  console.log('\n[4] Signing rootHash + 7702 auths...');
  const { signature, authorizations } = await signTransaction(transaction);
  console.log('  signature:', signature.slice(0, 20) + '...');
  console.log('  authorizations:', authorizations.length);

  // 5. Send
  console.log('\n[5] sendTransaction:');
  const sendResult = (await ua.sendTransaction(transaction, signature, authorizations)) as { transactionId: string };
  console.log('  transactionId:', sendResult.transactionId);
  console.log('  activity:', `https://universalx.app/activity/details?id=${sendResult.transactionId}`);

  // 6. Poll
  console.log('\n[6] Polling for completion...');
  await pollUntilFinished(sendResult.transactionId);
  console.log('  ✓ FINISHED');
  console.log('\n=== Spike PASSED ===');
}

main().catch((err) => {
  console.error('\n=== Spike FAILED ===');
  console.error(err);
  process.exit(1);
});
