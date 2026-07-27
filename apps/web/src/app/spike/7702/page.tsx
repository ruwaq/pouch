'use client';

/**
 * SPIKE 1 — browser half (dev-only). NOT shipped to production.
 *
 * Validates the UNBUILT production path: Magic signs a 7702 authorization and
 * broadcasts the Type-4 upgrade tx, on Arbitrum mainnet, against a real Magic
 * EOA. This is gate #1 from the spec's risk register — if it fails, the
 * browser-signer design (apps/web/src/lib/ua-signer.ts) changes before we
 * build it for real.
 *
 * Flow:
 *   1. Magic email login → obtain the real EOA (ownerAddress).
 *   2. POST /api/spike/7702/auth → server calls Particle getEIP7702Auth →
 *      returns the { address, nonce, chainId } params to sign.
 *   3. magic.wallet.sign7702Authorization({ contractAddress, chainId, nonce })
 *      → { v, r, s, signature? }.
 *   4. magic.wallet.send7702Transaction({ to: contractAddress, authorizationList: [auth] })
 *      → { transactionHash }.
 *   5. Verify delegation: eth_getCode(eoa) is now non-empty. Open Arbiscan.
 *
 * Run: pnpm --filter @pouch/web dev → http://localhost:3000/spike/7702
 */
import { useState } from 'react';
import { Magic } from 'magic-sdk';
import type { InstanceWithExtensions, SDKBase } from 'magic-sdk';
import { EVMExtension } from '@magic-ext/evm';

type MagicInstance = InstanceWithExtensions<SDKBase, EVMExtension[]>;

type LogKind = 'info' | 'ok' | 'err';
type LogEntry = { kind: LogKind; text: string; ts: string };

type AuthParams = {
  chainId: number;
  nonce: number;
  address: string; // implementation contract the EOA delegates to
};

type ServerResponse = {
  ownerAddress: string;
  requestedChainIds: number[];
  deployments: unknown;
  auth: unknown;
  onChain: { arbitrumEthBalance: string; eoaCode: string; isDelegated: boolean };
};

// --- tiny helpers ------------------------------------------------------------

function buildMagic(): MagicInstance {
  const key = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY not set');
  return new Magic(key, {
    extensions: [
      new EVMExtension([
        {
          rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
          chainId: Number(process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID) || 42161,
          default: true,
        },
      ]),
    ],
    network: 'mainnet' as const,
  });
}

// All on-chain reads go through our own /api/spike/7702/auth route (server-side),
// never directly to a public RPC from the browser. This mirrors how the production
// app works and avoids CSP/connect-src issues.

// The server returns `auth` in whatever shape getEIP7702Auth yields — that
// shape is undocumented (`any` in the SDK types), so this spike must discover
// it. We try the common shapes defensively.
function extractAuthList(raw: unknown): AuthParams[] {
  const candidates: unknown[] = [];
  if (Array.isArray(raw)) candidates.push(...raw);
  else if (raw && typeof raw === 'object') {
    const maybeArr = (raw as Record<string, unknown>).auth ?? (raw as Record<string, unknown>).data;
    if (Array.isArray(maybeArr)) candidates.push(...maybeArr);
    else candidates.push(raw);
  }

  const out: AuthParams[] = [];
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const address = (o.address ?? o.contractAddress) as string | undefined;
      const chainId = Number(o.chainId ?? 42161);
      const nonce = Number(o.nonce ?? 0);
      if (typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address)) {
        out.push({ address, chainId, nonce });
      }
    }
  }
  return out;
}

// --- component ---------------------------------------------------------------

export default function Spike7702Page() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [eoa, setEoa] = useState<string | null>(null);

  function log(kind: LogKind, text: string) {
    setLogs((prev) => [...prev, { kind, text, ts: new Date().toLocaleTimeString() }]);
  }

  async function onLogin() {
    setBusy(true);
    setLogs([]);
    try {
      if (!email.trim()) {
        log('err', 'Enter the demo Magic email first.');
        return;
      }
      log('info', `Logging in to Magic as ${email.trim()}…`);
      const magic = buildMagic();
      const didt = await magic.auth.loginWithMagicLink({ email: email.trim() });
      log('ok', `Magic DID token received: ${String(didt).slice(0, 24)}…`);

      const info = await magic.user.getInfo();
      const addr = info.wallets.ethereum?.publicAddress;
      if (!addr) {
        log('err', 'Magic session has no Ethereum address.');
        return;
      }
      setEoa(addr);
      log('ok', `EOA (ownerAddress) = ${addr}`);

      // Fetch on-chain state (balance + delegation) via our own server route —
      // the browser never calls a public RPC directly.
      const probe = await fetch('/api/spike/7702/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerAddress: addr, chainIds: [42161] }),
      });
      if (!probe.ok) {
        log('err', `On-chain probe failed (HTTP ${probe.status})`);
        return;
      }
      const probeData = (await probe.json()) as ServerResponse;
      const eth = (Number(probeData.onChain.arbitrumEthBalance) / 1e18).toFixed(6);
      log(
        probeData.onChain.isDelegated ? 'ok' : 'info',
        `BEFORE: ${eth} ETH on Arbitrum | eth_getCode = ${probeData.onChain.eoaCode === '0x' ? '0x (plain EOA)' : 'non-empty (ALREADY delegated)'}`,
      );
      if (Number(probeData.onChain.arbitrumEthBalance) === 0) {
        log('err', '⚠ EOA has 0 ETH on Arbitrum — send it gas before clicking Upgrade (Magic send7702Transaction pays gas from this EOA).');
      }
    } catch (err) {
      log('err', `Login failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onUpgrade() {
    if (!eoa) {
      log('err', 'Login first.');
      return;
    }
    setBusy(true);
    try {
      // 2. Plan: server-side UA returns the auth params to sign.
      log('info', 'POST /api/spike/7702/auth → server calls ua.getEIP7702Auth([42161])');
      const res = await fetch('/api/spike/7702/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerAddress: eoa, chainIds: [42161] }),
      });
      if (!res.ok) {
        const txt = await res.text();
        log('err', `Server returned ${res.status}: ${txt}`);
        return;
      }
      const data = (await res.json()) as ServerResponse;
      log('ok', `getEIP7702Deployments(): ${JSON.stringify(data.deployments)}`);
      log('info', `getEIP7702Auth() RAW = ${JSON.stringify(data.auth)}`);

      const authList = extractAuthList(data.auth);
      if (authList.length === 0) {
        log('err', 'Could not extract any {address, chainId, nonce} from getEIP7702Auth response. Inspect RAW above and extend extractAuthList().');
        return;
      }
      const params = authList[0]!;
      log('ok', `Signing auth for contractAddress=${params.address} chainId=${params.chainId} nonce=${params.nonce}`);

      // 3. Sign the 7702 authorization via Magic (the production path).
      const magic = buildMagic();
      const auth = (await magic.wallet.sign7702Authorization({
        contractAddress: params.address,
        chainId: params.chainId,
        nonce: params.nonce,
      })) as { v: number; r: string; s: string; signature?: string; contractAddress: string; chainId: number; nonce: number };

      log('ok', `sign7702Authorization → v=${auth.v} r=${auth.r.slice(0, 12)}… s=${auth.s.slice(0, 12)}… signature=${auth.signature ? auth.signature.slice(0, 16) + '…' : '(none)'}`);

      // 4. Broadcast the Type-4 upgrade via Magic (the production path).
      log('info', 'magic.wallet.send7702Transaction({ to: contractAddress, authorizationList: [auth] })');
      const send = (await magic.wallet.send7702Transaction({
        to: params.address,
        authorizationList: [auth],
      })) as { transactionHash: string };

      log('ok', `✓ Type-4 tx broadcast: ${send.transactionHash}`);
      log('info', `Arbiscan: https://arbiscan.io/tx/${send.transactionHash}`);

      // 5. Verify the delegation took: re-fetch on-chain state from the server.
      log('info', 'Waiting 6s for the upgrade to land, then re-checking via server…');
      await new Promise((r) => setTimeout(r, 6_000));
      const after = await fetch('/api/spike/7702/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerAddress: eoa, chainIds: [42161] }),
      });
      const afterData = (await after.json()) as ServerResponse;
      const codeAfter = afterData.onChain.eoaCode;
      log(
        afterData.onChain.isDelegated ? 'ok' : 'err',
        `eth_getCode(eoa) AFTER = ${codeAfter === '0x' ? '0x' : codeAfter.slice(0, 16) + '…'}`,
      );
      if (afterData.onChain.isDelegated) {
        log('ok', '=== SPIKE 1 PASSED — EOA is now delegated (Universal Account) ===');
      } else {
        log('err', 'Code still empty after 6s. The upgrade may need a few more seconds — check Arbiscan, or click Upgrade again (re-running getEIP7702Auth will show isDelegated:true once it lands).');
      }
    } catch (err) {
      log('err', `Upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'ui-monospace, monospace', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20 }}>Spike 1 — EIP-7702 upgrade via Magic (dev-only)</h1>
      <p style={{ color: '#888', fontSize: 13 }}>
        Validates the production Magic path: sign7702Authorization + send7702Transaction on Arbitrum mainnet.
        Funded demo Magic account required (spec §6).
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input
          type="email"
          placeholder="demo Magic email (e.g. pouch.demo@…)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 8, fontFamily: 'inherit' }}
          disabled={busy}
        />
        <button onClick={onLogin} disabled={busy} style={{ padding: '8px 16px' }}>
          1. Login
        </button>
        <button onClick={onUpgrade} disabled={busy || !eoa} style={{ padding: '8px 16px' }}>
          2. Upgrade (7702)
        </button>
      </div>

      {eoa && <div style={{ fontSize: 12, color: '#666' }}>EOA: {eoa}</div>}

      <pre style={{ background: '#111', color: '#eee', padding: 16, marginTop: 16, overflow: 'auto', minHeight: 200 }}>
        {logs.length === 0
          ? '(no output yet)'
          : logs.map((l) => `[${l.ts}] ${l.kind === 'ok' ? '✓' : l.kind === 'err' ? '✗' : '·'} ${l.text}`).join('\n')}
      </pre>
    </main>
  );
}
