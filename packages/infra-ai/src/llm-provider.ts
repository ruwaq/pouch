import type { DomainError } from '@pouch/domain';
import type { Result } from '@pouch/shared';

/**
 * A function call returned by the LLM (e.g. Gemini function-calling).
 * `args` is an untyped record — the caller validates/maps it.
 */
export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider-agnostic tool declaration. The `parameters` shape is intentionally
 * `unknown` because each provider's schema dialect differs (Gemini uses
 * `Type.OBJECT`-style descriptors). The concrete provider casts as needed.
 */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

export interface LlmToolRequest {
  message: string;
  systemInstruction: string;
  tools: ToolDeclaration[];
}

export interface LlmToolResponse {
  /** Present when the model chose a function to call. */
  functionCall?: FunctionCall;
  /** Present when the model replied in natural language (no function chosen). */
  text?: string;
}

export interface LlmTextRequest {
  systemInstruction: string;
  message: string;
}

/**
 * Provider-agnostic LLM port. Implementations MUST NOT throw on transient
 * failures (network, auth, rate limit) — they return `err(...)` so callers can
 * fall back. Reserved for truly unexpected thrown errors, callers `try/catch`.
 */
export interface LLMProvider {
  /** Function-calling request: the model either calls a tool or replies as text. */
  generateWithTools(request: LlmToolRequest): Promise<Result<LlmToolResponse, DomainError>>;

  /** Plain text generation (used for conversational replies). */
  generateText(request: LlmTextRequest): Promise<Result<string, DomainError>>;
}
