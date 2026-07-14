import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the API client + magic-client before importing the module under test.
vi.mock('../lib/api-client', () => ({
  apiPost: vi.fn(),
}));
vi.mock('../lib/magic-client', () => ({
  hasMagicConfig: vi.fn(() => false),
  isLoggedIn: vi.fn(),
  loginWithEmail: vi.fn(),
  getEvmAddress: vi.fn(),
  logout: vi.fn(),
}));

import { apiPost } from '../lib/api-client';
import { loginWithEmail, logout as magicLogout } from '../lib/magic-client';
import { authenticateWithDid, signOut } from './session-context';

describe('session-context helpers', () => {
  afterEach(() => vi.clearAllMocks());

  it('authenticateWithDid posts the DID to /auth/callback and returns the session', async () => {
    vi.mocked(apiPost).mockResolvedValue({ userId: 'u1', evmAddress: '0xabc' });
    const session = await authenticateWithDid('did-token-xyz');
    expect(apiPost).toHaveBeenCalledWith('/auth/callback', { didToken: 'did-token-xyz' });
    expect(session).toEqual({ userId: 'u1', evmAddress: '0xabc' });
  });

  it('signOut calls magic logout then /auth/logout', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true });
    await signOut();
    expect(magicLogout).toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith('/auth/logout', null);
  });
});
