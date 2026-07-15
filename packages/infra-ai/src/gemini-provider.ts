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
      }>;
    };
  }>;
}

/**
 * Adapts the Gemini REST API (generativelanguage.googleapis.com) to the
 * LLMProvider port. Uses plain fetch() — no SDK, no ESM imports, works
 * reliably in Vercel serverless.
 */
export class GeminiProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateWithTools(request: LlmToolRequest): Promise<Result<LlmToolResponse, DomainError>> {
    try {
      const body = {
        systemInstruction: {
          parts: [{ text: request.systemInstruction }],
        },
        contents: [{ parts: [{ text: request.message }] }],
        tools: [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }],
      };

      const data = await this.fetchModel<GeminiResponse>(`${this.model}:generateContent`, body);

      const part = data?.candidates?.[0]?.content?.parts?.[0];
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
    } catch (error) {
      return err(toUnknownDomainError(`Gemini generateWithTools failed: ${describeError(error)}`));
    }
  }

  async generateText(request: LlmTextRequest): Promise<Result<string, DomainError>> {
    try {
      const body = {
        systemInstruction: {
          parts: [{ text: request.systemInstruction }],
        },
        contents: [{ parts: [{ text: request.message }] }],
      };

      const data = await this.fetchModel<GeminiResponse>(`${this.model}:generateContent`, body);
      return ok(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    } catch (error) {
      return err(toUnknownDomainError(`Gemini generateText failed: ${describeError(error)}`));
    }
  }

  private async fetchModel<T>(path: string, body: unknown): Promise<T> {
    const url = `${GEMINI_BASE}/models/${path}?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as T;
  }
}

function toFunctionDeclaration(tool: ToolDeclaration): unknown {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}