import { describe, expect, it } from 'vitest';
import { Wallet, hashAuthorization } from 'ethers';

import { buildAuthorizations, type UaUserOp } from './ua-client';

const wallet = new Wallet('0x' + '1'.repeat(64)); // deterministic test key

describe('buildAuthorizations', () => {
  it('returns empty array when all userOps are already delegated', () => {
    const userOps: UaUserOp[] = [
      { userOpHash: '0xop1', eip7702Delegated: true },
      { userOpHash: '0xop2', eip7702Delegated: true },
    ];
    const result = buildAuthorizations(userOps, wallet);
    expect(result).toEqual([]);
  });

  it('signs one authorization for an undelegated userOp', () => {
    // ethers v6 validates the address via getAddress(); must be 20-byte hex.
    const impl = '0x' + '00'.repeat(19) + '01';
    const auth = { chainId: 8453, nonce: 5, address: impl };
    const userOps: UaUserOp[] = [
      { userOpHash: '0xop1', eip7702Auth: auth, eip7702Delegated: false },
    ];
    const result = buildAuthorizations(userOps, wallet);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ userOpHash: '0xop1' });
    // The signature is the ECDSA of hashAuthorization(auth), serialized (65 bytes hex = 132 chars).
    const expected = wallet.signingKey.sign(hashAuthorization(auth)).serialized;
    expect(result[0]!.signature).toBe(expected);
  });

  it('deduplicates signatures by nonce (cross-chain bundle shares a nonce)', () => {
    // ethers v6 validates the address via getAddress(); must be 20-byte hex.
    const impl = '0x' + '00'.repeat(19) + '01';
    const auth = { chainId: 0, nonce: 9, address: impl };
    const userOps: UaUserOp[] = [
      { userOpHash: '0xop1', eip7702Auth: auth, eip7702Delegated: false },
      { userOpHash: '0xop2', eip7702Auth: auth, eip7702Delegated: false }, // same nonce
    ];
    const result = buildAuthorizations(userOps, wallet);
    expect(result).toHaveLength(2); // both userOps get an entry
    expect(result[0]!.signature).toBe(result[1]!.signature); // but the SAME signature bytes
  });

  it('skips userOps with no eip7702Auth even if undelegated', () => {
    const userOps: UaUserOp[] = [
      { userOpHash: '0xop1', eip7702Delegated: false }, // no auth object
    ];
    const result = buildAuthorizations(userOps, wallet);
    expect(result).toEqual([]);
  });
});
