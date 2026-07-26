import { toUnknownDomainError, type DomainError } from '@pouch/domain';
import { err, ok, type Result } from '@pouch/shared';

import type {
  LLMProvider,
  LlmTextRequest,
  LlmToolRequest,
  LlmToolResponse,
  ToolDeclaration,
} from './llm-provider';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Models to try in order. The first successful one wins.
 *  NOTE: gemini-2.0-flash and gemini-2.5-* are NOT available on this API key.
 *  Only gemini-3.5-flash works. Keep this list to just that model. */
const MODEL_FALLBACKS: string[] = [];

/** HTTP status codes that should trigger a retry (rate-limit, overload). */
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Max retries per model before moving to the next fallback. */
const MAX_RETRIES_PER_MODEL = 2;

/** Base delay in ms for exponential backoff (200ms, 400ms, 800ms). */
const BASE_RETRY_DELAY_MS = 200;

/**
 * Generation config for all requests. gemini-3.6-flash is a thinking model —
 * hidden reasoning tokens and visible answer tokens draw from the SAME
 * maxOutputTokens budget. Empirically a simple greeting spent 241 thinking
 * tokens (2026-07-26), so 2048 leaves room for a full multi-sentence answer.
 * thinkingConfig is intentionally left at the model default (enabled).
 */
const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.95,
  maxOutputTokens: 2048,
} as const;

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        functionCall?: GeminiFunctionCall;
        text?: string;
        thought?: boolean;
      }>;
    };
  }>;
}

/**
 * Returns the first "visible" part of a Gemini response, skipping any leading
 * `thought: true` reasoning parts emitted by thinking models (gemini-3.6-flash).
 * A part is visible when it has a `functionCall`, OR has `text` without
 * `thought: true`. Returns undefined when there are no visible parts.
 */
function firstVisiblePart(
  parts: Array<{ functionCall?: GeminiFunctionCall; text?: string; thought?: boolean }> | undefined,
): { functionCall?: GeminiFunctionCall; text?: string; thought?: boolean } | undefined {
  if (!parts) return undefined;
  for (const part of parts) {
    if (part.functionCall) return part;
    if (typeof part.text === 'string' && !part.thought) return part;
  }
  return undefined;
}

/**
 * Adapts the Gemini REST API (generativelanguage.googleapis.com) to the
 * LLMProvider port. Uses plain fetch() — no SDK, no ESM imports, works
 * reliably in Vercel serverless.
 *
 * Resilience features:
 * - Retry on 429/503 with exponential backoff (2 attempts per model)
 * - generateText inlines systemInstruction (free tier workaround for 503)
 * - No model fallback — only gemini-3.5-flash works on this API key.
 *   gemini-2.0-flash and gemini-2.5-* return 404.
 * - API key sent via x-goog-api-key header (not URL query param) to avoid
 *   leaking the key in server/network logs.
 */
export class GeminiProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateWithTools(request: LlmToolRequest): Promise<Result<LlmToolResponse, DomainError>> {
    const body = {
      systemInstruction: {
        parts: [{ text: request.systemInstruction }],
      },
      contents: [{ parts: [{ text: request.message }] }],
      tools: [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }],
      generationConfig: GENERATION_CONFIG,
    };

    const data = await this.fetchWithFallback<GeminiResponse>(
      (model) => `${model}:generateContent`,
      body,
    );

    if (!data.ok) return data;

    const part = firstVisiblePart(data.value?.candidates?.[0]?.content?.parts);
    const out: LlmToolResponse = {};

    if (part?.functionCall) {
      out.functionCall = {
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      };
    } else if (typeof part?.text === 'string') {
      out.text = part.text;
    }

    return ok(out);
  }

  async generateText(request: LlmTextRequest): Promise<Result<string, DomainError>> {
    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: request.message }] }],
    };

    if (request.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    body.generationConfig = GENERATION_CONFIG;

    const data = await this.fetchWithFallback<GeminiResponse>(
      (model) => `${model}:generateContent`,
      body,
    );

    if (!data.ok) return data;
    return ok(firstVisiblePart(data.value?.candidates?.[0]?.content?.parts)?.text ?? '');
  }

  // ── Model fallback + retry ───────────────────────────────────────────

  /**
   * Tries each model in MODEL_FALLBACKS, retrying on 429/503 with exponential
   * backoff. Returns the first successful response, or the last error.
   */
  private async fetchWithFallback<T>(
    pathFn: (model: string) => string,
    body: unknown,
  ): Promise<Result<T, DomainError>> {
    const models = [this.model, ...MODEL_FALLBACKS.filter((m) => m !== this.model)];
    let lastError: DomainError | undefined;

    for (const model of models) {
      for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          const url = `${GEMINI_BASE}/models/${pathFn(model)}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
            body: JSON.stringify(body),
          });

          if (res.ok) {
            return ok((await res.json()) as T);
          }

          if (RETRYABLE_STATUSES.has(res.status)) {
            const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
            if (attempt < MAX_RETRIES_PER_MODEL - 1) {
              await sleep(delay);
              continue; // retry same model
            }
            // All retries exhausted for this model → try next model
            lastError = toUnknownDomainError(
              `Gemini ${model} ${res.status} after ${MAX_RETRIES_PER_MODEL} retries`,
            );
            break; // break inner loop, try next model
          }

          // Non-retryable error → fail immediately
          const text = await res.text().catch(() => '');
          return err(toUnknownDomainError(`Gemini ${model} ${res.status}: ${text.slice(0, 200)}`));
        } catch (error) {
          lastError = toUnknownDomainError(
            `Gemini ${model} fetch failed: ${describeError(error)}`,
          );
          if (attempt < MAX_RETRIES_PER_MODEL - 1) {
            await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
            continue;
          }
          break;
        }
      }
    }

    return err(lastError ?? toUnknownDomainError('Gemini: all models exhausted'));
  }
}

function toFunctionDeclaration(tool: ToolDeclaration): unknown {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}