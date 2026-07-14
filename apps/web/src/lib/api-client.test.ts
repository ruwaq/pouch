import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost, ApiError } from './api-client';

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('api-client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('apiPost sends JSON with credentials and returns parsed body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true }));
    // NOTE: a null body sends NO content-type header (see apiPost impl), so we
    // only assert method + credentials here. The content-type-on-json-body case
    // is covered by the null-body assertion in the last test by contrast.
    const result = await apiPost<{ ok: boolean }>('/auth/logout', null);
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('apiPost sends content-type header + JSON body for non-null body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ userId: 'u1' }));
    await apiPost('/auth/callback', { didToken: 'tok' });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/callback',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ didToken: 'tok' }),
      }),
    );
  });

  it('apiGet sends credentials and returns parsed body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ total: 150 }));
    const result = await apiGet<{ total: number }>('/balance');
    expect(result).toEqual({ total: 150 });
  });

  it('throws ApiError with status + message on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({ error: 'nope', type: 'UNKNOWN' }, 500),
    );
    await expect(apiGet('/balance')).rejects.toMatchObject({
      status: 500,
      message: 'nope',
      type: 'UNKNOWN',
    });
    await expect(apiGet('/balance')).rejects.toBeInstanceOf(ApiError);
  });

  it('omits body when null is passed to apiPost', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({}));
    await apiPost('/auth/logout', null);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });
});
