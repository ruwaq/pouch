/**
 * Minimal structural view of the @google/genai `GoogleGenAI` surface we use.
 * The real client (constructed in factory.ts) satisfies this by duck-typing,
 * and tests pass a fake. This keeps the provider decoupled + unit-testable
 * without the SDK installed.
 */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResponse {
  /** Convenience accessor provided by @google/genai: all function-call parts. */
  functionCalls?: GeminiFunctionCall[];
  /**
   * Convenience text accessor. NOTE: in the real SDK this is a *getter* that
   * throws ("Unable to get text...") when the response has no text part
   * (e.g. function-call-only or safety-blocked responses). The provider wraps
   * access in try/catch, so a throw is benign (surfaces as a transient error →
   * regex fallback), but prefer reading `functionCalls` first when both matter.
   */
  text?: string;
}

export interface GeminiRequest {
  model: string;
  contents: string;
  config?: {
    systemInstruction?: string;
    tools?: Array<{ functionDeclarations: unknown[] }>;
  };
}

export interface GeminiClient {
  models: {
    generateContent(request: GeminiRequest): Promise<GeminiResponse>;
  };
}
