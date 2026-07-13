import { toUnknownDomainError, type DomainError } from '@pouch/domain';
import { err, ok, type Result } from '@pouch/shared';

import type { GeminiClient } from './gemini-client';
import type {
  LLMProvider,
  LlmTextRequest,
  LlmToolRequest,
  LlmToolResponse,
  ToolDeclaration,
} from './llm-provider';

/**
 * Adapts @google/genai to the provider-agnostic LLMProvider port.
 *
 * The SDK client is injected (duck-typed via GeminiClient) so this class is
 * unit-testable without the SDK installed, and so a different client can be
 * substituted. It NEVER throws on transient failures — it returns err(...) so
 * the caller (LlmIntentParser) can fall back to regex.
 */
export class GeminiProvider implements LLMProvider {
  constructor(
    private readonly client: GeminiClient,
    private readonly model: string,
  ) {}

  async generateWithTools(request: LlmToolRequest): Promise<Result<LlmToolResponse, DomainError>> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.message,
        config: {
          systemInstruction: request.systemInstruction,
          tools: [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }],
        },
      });

      const fc = response.functionCalls?.[0];
      const out: LlmToolResponse = {};
      if (fc) {
        out.functionCall = { name: fc.name, args: fc.args ?? {} };
      } else if (typeof response.text === 'string') {
        out.text = response.text;
      }
      return ok(out);
    } catch (error) {
      return err(toUnknownDomainError(`Gemini generateWithTools failed: ${describeError(error)}`));
    }
  }

  async generateText(request: LlmTextRequest): Promise<Result<string, DomainError>> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.message,
        config: { systemInstruction: request.systemInstruction },
      });
      return ok(typeof response.text === 'string' ? response.text : '');
    } catch (error) {
      return err(toUnknownDomainError(`Gemini generateText failed: ${describeError(error)}`));
    }
  }
}

function toFunctionDeclaration(tool: ToolDeclaration): unknown {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
