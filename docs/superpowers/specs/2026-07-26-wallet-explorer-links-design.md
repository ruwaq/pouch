# Wallet explorer links — mostrar wallets reales al jurado

**Fecha:** 2026-07-26
**Estado:** Aprobado (Approach A)
**Decisión del usuario:** direcciones siempre visibles + link al explorador por wallet.

## Contexto

La demo del hackathon (30/07) se va a hacer con **wallets reales** en mainnet. El jurado necesita poder verificar que las wallets que ve en pantalla son reales (no números hardcoded). Hoy la UI muestra `walletLabel` ("Wallet 1", "Wallet 2"…) pero **no** la dirección on-chain ni link al explorador, por lo que el jurado no tiene forma de comprobar que los saldos son reales.

Las direcciones reales ya viven en el backend (`PrivateKeyAccountProvider.getWalletInfo()`, `packages/infra-web3/src/private-key/private-key-provider.ts:559`) pero no llegan al frontend.

## Objetivo

Que el jurado vea, junto a cada wallet en el `WalletPanel`:

```
Wallet 1 · 0xAbc…123 · [↗ Arbiscan]
```

donde `[↗ Arbiscan]` es un link externo (`target="_blank"`) al explorador de la chain correspondiente. Al clickar, el jurado aterriza en la página de la address con balance, txs, etc., y puede confirmar que es on-chain real.

## Chains soportadas y explorers

| chainId | Red    | Explorer base                          |
|---------|--------|----------------------------------------|
| 42161   | Arbitrum | `https://arbiscan.io/address/`       |
| 8453    | Base   | `https://basescan.org/address/`        |
| 43114   | Avalanche | `https://snowtrace.io/address/`     |

Estas son las 3 chains que el provider ya soporta (`SUPPORTED_CHAINS`, RPCs en `private-key-provider.ts:28-30`).

## Alcance

### In scope
- Exponer la `address` on-chain de cada asset en la response de `/api/balance`.
- Renderizar address truncada + link al explorer en `WalletPanel.tsx`.
- Helper de explorer reutilizable en el frontend.
- Tests del provider y del helper.

### Out of scope
- **Whitelist de wallets** (próximo design doc). Pero este cambio deja las direcciones accesibles para que la whitelist las use.
- Login / auth (decidido: demo directo sin login, ver nota abajo).
- Endpoints nuevos (`/api/wallets`) — se consideró (Approach B) y se descartó.
- Exponer `hasKey` al frontend (info innecesaria para el jurado).

## Decisiones de diseño

### D1 — Extender `BalanceAsset` con `address?: string`

```ts
// packages/domain/src/types.ts
export interface BalanceAsset {
  chainId: number;
  symbol: string;
  amount: number;
  usdValue: number;
  walletLabel?: string;
  /** On-chain address of the wallet holding this asset. Optional for demo providers that don't have one. */
  address?: string;
}
```

**Razón:** es opcional para no romper los providers demo (`createDemoAccountProvider`, `create-demo-agent-service.ts:79`) que no tienen dirección real. El frontend trata `address` undefined como "no mostrar link".

### D2 — El provider real popula `address` en cada asset

`PrivateKeyAccountProvider.getUnifiedBalance()` ya itera `this.wallets` para asignar `walletLabel`. En el mismo punto, agrega `address: walletConfig.address`. Las 3 ubicaciones (líneas ~282, 302, 324) y la fallback hardcoded (~345-346) se actualizan.

### D3 — Helper de explorer en el frontend

```ts
// apps/web/src/lib/explorer.ts (nuevo)
const EXPLORER_BASE: Record<number, string> = {
  42161: 'https://arbiscan.io/address/',
  8453:  'https://basescan.org/address/',
  43114: 'https://snowtrace.io/address/',
};

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const base = EXPLORER_BASE[chainId];
  return base ? `${base}${address}` : null;
}

export function shortAddress(address: string): string {
  // 0xAbc…123 (primeros 5 + últimos 3 tras 0x)
  return `${address.slice(0, 7)}…${address.slice(-3)}`;
}
```

### D4 — UI: address truncada + link en el header de cada wallet

En `WalletPanel.tsx:99-102` (donde hoy se renderiza `{walletLabel}` y el total), se agrega al lado del label la dirección de la wallet (tomada del primer asset del grupo) y el link al explorer.

Lógica: para cada grupo `byWallet`, tomar `assets[0].address` (todos los assets de un mismo walletLabel comparten address). Si existe y el helper devuelve URL, renderizar:

```
Wallet 1  $13.01
0xAbc…123 [↗ Arbiscan]   ← nuevo
```

El nombre del explorer se deriva del `chainId` del primer asset del grupo (para "Arbiscan" vs "Snowtrace" vs "Basescan"). Se asume que todos los assets de una wallet están en chains con el mismo nombre de explorador — si una wallet tuviera assets en chains distintas, se muestra el link del primer chain (aceptable para la demo; no hay wallets cross-chain hoy).

## Componentes / cambios

### Backend
1. **`packages/domain/src/types.ts:128`** — agregar `address?: string` a `BalanceAsset`.
2. **`packages/infra-web3/src/private-key/private-key-provider.ts`** — `getUnifiedBalance()`: popular `address` en cada asset (líneas ~282, 302, 324, 345-346).
3. **`packages/infra-web3/src/private-key/private-key-provider.test.ts`** — nuevo test: cada asset trae `address` válido (`/^0x[a-fA-F0-9]{40}$/`).

### Frontend
4. **`apps/web/src/lib/explorer.ts`** (nuevo) — helpers `explorerAddressUrl` y `shortAddress`.
5. **`apps/web/src/components/dashboard/WalletPanel.tsx:99-102`** — extender el header del wallet group con address truncada + link externo.
6. **`apps/web/src/components/dashboard/WalletPanel.tsx`** — `BalanceAsset` interface local: agregar `address?: string` (línea 7-13).

### Tests
7. **`apps/web/src/lib/explorer.test.ts`** (nuevo) — tests del helper:
   - `explorerAddressUrl(42161, '0xabc...')` → `'https://arbiscan.io/address/0xabc...'`
   - `explorerAddressUrl(99999, ...)` → `null` (chain no soportada)
   - `shortAddress('0xabcdef0123456789...abcdef')` → `'0xabcd…def'`

## Testing / verificación

- Unit tests: `pnpm test` en `@pouch/domain`, `@pouch/infra-web3`, `apps/web`.
- Smoke manual: levantar dev local con wallets reales, abrir el panel, clickar el link → aterriza en Arbiscan/Snowtrace con la address correcta.
- Verificar que el provider demo (sin address) sigue renderizando sin romper (sin link, sin "0xundefined").

## Riesgos / trade-offs

- **R1 — Direcciones expuestas en la URL secreta.** Como la URL es secreta y las direcciones son públicas on-chain igual, aceptable. El usuario lo confirmó.
- **R2 — Chain no soportada por el helper.** El frontend devuelve `null` y no muestra link. No rompe nada.
- **R3 — Snapshot del chat también incluye `address`.** La `balanceSnapshot` de `reply.ts` usa el mismo `BalanceAsset[]`. El LLM no lo menciona (no está en el prompt), así que no cambia el comportamiento del chat — solo transporta el dato.

## Nota sobre login (decisión relacionada)

El usuario decidió **no login** (demo directo, `allowDemoFallback: true` en producción). Esto queda fuera de este design doc y se activará después de que la whitelist + H2/H3/H6 estén listos, porque reactivar el demo fallback reabre el vector C5 que solo se cierra con whitelist + H2.

## Dependencias / prereqs

- Ninguna. Este cambio es autónomo y de bajo riesgo.
- **No** bloquea ni requiere la whitelist. Puede implementarse y deployarse independientemente.
