import type { ReplyInput, ReplyStrategy } from '@pouch/domain';
import { isOk } from '@pouch/shared';

import type { LLMProvider } from './llm-provider';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * Composes a conversational success reply via the LLM. On ANY failure it falls
 * back to a deterministic, brand-aware template so the agent always responds.
 */
export class LlmReplyStrategy implements ReplyStrategy {
  constructor(private readonly llm: LLMProvider) {}

  async buildReply(input: ReplyInput): Promise<string> {
    const fallback = () => templateReply(input);

    try {
      const result = await this.llm.generateText({
        systemInstruction: POUCH_SYSTEM_PROMPT,
        message: replyPrompt(input),
      });

      if (!isOk(result) || !result.value.trim()) {
        return fallback();
      }
      return result.value.trim();
    } catch {
      return fallback();
    }
  }
}

function replyPrompt(input: ReplyInput): string {
  const { intent, result, order } = input;
  const brand = (order?.product.brand ?? intent.brand ?? 'your selected product').toString();
  const amount = intent.amount.value.toFixed(2);
  const orderId = result.orderId;
  const status = result.status;
  return [
    `The cash-out just completed successfully. Write a single short, friendly sentence to the user confirming it.`,
    `Details — brand: ${brand}; amount: $${amount}; order id: ${orderId}; status: ${status}.`,
    `Do not invent a gift card code. Do not mention wallets, chains, or gas. Address the user directly.`,
  ].join(' ');
}

function templateReply(input: ReplyInput): string {
  const { intent, result, order } = input;
  const rawBrand = order?.product.brand ?? intent.brand;
  const displayBrand = rawBrand
    ? rawBrand
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0]?.toUpperCase() + w.slice(1))
        .join(' ')
    : 'your selected product';
  return `Done — your ${displayBrand} cash-out for $${intent.amount.value.toFixed(2)} is ${result.status} (order ${result.orderId}).`;
}
