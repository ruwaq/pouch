import { IntentParser, type IntentParserStrategy, type ReplyStrategy } from '@pouch/domain';
import type { Config } from '@pouch/shared';

import { GeminiProvider } from './gemini-provider';
import { LlmIntentParser } from './llm-intent-parser';
import { LlmReplyStrategy } from './llm-reply-strategy';
import type { LLMProvider } from './llm-provider';
import { POUCH_TOOL_DECLARATIONS } from './llm-tools';

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

/**
 * Constructs the LLMProvider when configuration is complete and valid.
 * Returns undefined when: no provider set, OR provider set but its key is
 * missing. Callers then fall back to the regex parser.
 *
 * Uses the Gemini REST API (fetch) directly — no SDK, no ESM imports.
 * Reliable in Vercel serverless environments.
 */
export function createLlmProvider(config: Config): LLMProvider | undefined {
  if (config.LLM_PROVIDER !== 'gemini') {
    return undefined;
  }
  if (!config.GEMINI_API_KEY) {
    return undefined;
  }

  const model = config.LLM_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return new GeminiProvider(config.GEMINI_API_KEY, model);
}

/**
 * Returns the parser to use: LLM-backed when fully configured, else regex.
 * The regex parser is the always-works fallback (spec §7).
 */
export function createIntentParser(config: Config): IntentParserStrategy {
  const provider = createLlmProvider(config);
  if (!provider) {
    return new IntentParser();
  }
  return new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS);
}

/**
 * Returns the reply strategy when an LLM provider exists, else undefined
 * (the AgentChatService then uses its inline template).
 */
export function createReplyStrategy(_config: Config, provider: LLMProvider | undefined): ReplyStrategy | undefined {
  if (!provider) {
    return undefined;
  }
  return new LlmReplyStrategy(provider);
}

/**
 * Builds the parser + reply strategy together, sharing ONE LLMProvider
 * instance (avoids constructing two SDK clients). This is what the API's
 * composition root calls. Returns the regex parser + undefined strategy when
 * the LLM is not configured, so the caller can pass them through unchanged.
 */
export function createAgentLlm(
  config: Config,
): { intentParser: IntentParserStrategy; replyStrategy: ReplyStrategy | undefined } {
  const provider = createLlmProvider(config);
  if (!provider) {
    return { intentParser: new IntentParser(), replyStrategy: undefined };
  }
  return {
    intentParser: new LlmIntentParser(provider, new IntentParser(), POUCH_TOOL_DECLARATIONS),
    replyStrategy: new LlmReplyStrategy(provider),
  };
}
