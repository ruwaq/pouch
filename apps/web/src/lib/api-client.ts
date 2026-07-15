export class ApiError extends Error {
  public override readonly message: string;
  constructor(
    public readonly status: number,
    message: string,
    public readonly type?: string | undefined,
  ) {
    super(message);
    this.name = 'ApiError';
    this.message = message;
  }
}

async function parseError(res: Response): Promise<never> {
  let message = res.statusText;
  let type: string | undefined;
  try {
    const body = (await res.json()) as { error?: string; type?: string };
    if (body.error) {
      message = body.error;
    }
    if (body.type) {
      type = body.type;
    }
  } catch {
    // non-JSON body — keep statusText
  }
  throw new ApiError(res.status, message, type);
}

const BASE = '/api';

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  // Build the init conditionally so we never pass `body: undefined` (which
  // `exactOptionalPropertyTypes` rejects for `BodyInit | null`). A null body
  // omits both the body and the content-type header.
  const init: RequestInit =
    body === null
      ? {
          method: 'POST',
          credentials: 'include',
          headers: { accept: 'application/json' },
        }
      : {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };

  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

/** One-click demo login — creates a session for judges without email/Magic. */
export async function demoLogin(): Promise<{ userId: string; evmAddress: string }> {
  return apiPost('/auth/demo', null);
}
