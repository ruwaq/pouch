import { describe, expect, it } from 'vitest';

import { AuthService } from './auth-service';

// A fake Magic admin that "validates" anything and returns fixed metadata.
function fakeMagicAdmin(metadata: { issuer: string; publicAddress: string; email: string | null }) {
  return {
    token: {
      validate() {},
      decode() {
        return ['fake-proof', { iss: metadata.issuer }];
      },
    },
    users: {
      async getMetadataByToken() {
        return {
          issuer: metadata.issuer,
          publicAddress: metadata.publicAddress,
          email: metadata.email,
          oauthProvider: null,
          phoneNumber: null,
          username: null,
          wallets: null,
        };
      },
    },
  };
}

function fakeUserRepo() {
  let saved: { id: string; issuer: string; magicPublicKey: string; evmAddress: string; email: string | null } | null = null;
  return {
    async upsertByIssuer(input: { issuer: string; magicPublicKey: string; evmAddress: string; email?: string }) {
      saved = {
        id: 'user-1',
        issuer: input.issuer,
        magicPublicKey: input.magicPublicKey,
        evmAddress: input.evmAddress,
        email: input.email ?? null,
      };
      return saved;
    },
    _saved: () => saved,
  };
}

describe('AuthService', () => {
  it('validates a DID token, upserts the user, and returns a session JWT', async () => {
    const magic = fakeMagicAdmin({ issuer: 'did:ethr:0xabc', publicAddress: '0xabc', email: 'jane@example.com' });
    const repo = fakeUserRepo();
    const service = new AuthService(magic as any, repo as any, 'a'.repeat(32));

    const result = await service.handleCallback('fake-did-token');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.userId).toBe('user-1');
    expect(result.value.evmAddress).toBe('0xabc');
    expect(typeof result.value.jwt).toBe('string');
    expect(result.value.jwt.split('.')).toHaveLength(3); // JWT shape
    expect(repo._saved()?.issuer).toBe('did:ethr:0xabc');
    expect(repo._saved()?.evmAddress).toBe('0xabc');
    expect(repo._saved()?.email).toBe('jane@example.com');
  });

  it('returns a typed error when DID token validation throws', async () => {
    const magic = {
      token: { validate() { throw new Error('DID token expired'); } },
      users: { async getMetadataByToken() { throw new Error('not reached'); } },
    };
    const repo = fakeUserRepo();
    const service = new AuthService(magic as any, repo as any, 'a'.repeat(32));

    const result = await service.handleCallback('expired-did');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('AUTH_INVALID_DID');
  });
});
