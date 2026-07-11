import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpError, requestJson } from '../src/http';

describe('requestJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws a typed HttpError when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ),
    );

    await expect(requestJson('https://api.example.com/protected')).rejects.toMatchObject({
      name: 'HttpError',
      status: 401,
      body: '{"message":"Unauthorized"}',
    });
  });
});
