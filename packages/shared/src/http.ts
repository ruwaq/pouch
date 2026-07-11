const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

export class HttpError extends Error {
  override readonly name = 'HttpError';

  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export type RequestOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function shouldRetry(error: unknown, response: Response | null, retryOnStatuses: number[]): boolean {
  if (response) {
    return retryOnStatuses.includes(response.status);
  }

  return error instanceof Error && error.name !== 'AbortError';
}

export async function request(input: RequestInfo | URL, options: RequestOptions = {}): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    retryOnStatuses = [408, 425, 429, 500, 502, 503, 504],
    ...fetchOptions
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = fetchOptions.signal
      ? AbortSignal.any([fetchOptions.signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(input, {
        ...fetchOptions,
        signal,
      });

      clearTimeout(timeout);

      if (!response.ok && shouldRetry(null, response, retryOnStatuses) && attempt < retries) {
        attempt += 1;
        await sleep(retryDelayMs * attempt);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new HttpError(response.status, String(input), body);
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (!shouldRetry(error, null, retryOnStatuses) || attempt >= retries) {
        throw error;
      }

      attempt += 1;
      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('HTTP request failed.');
}

export async function requestJson<T>(input: RequestInfo | URL, options: RequestOptions = {}): Promise<T> {
  const response = await request(input, options);

  return (await response.json()) as T;
}
