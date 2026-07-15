import { err, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { CashOutIntent, OffRampCategory } from './types';

// ── Pattern definitions ────────────────────────────────────────────────

/** Greetings, help, casual chat — maps to off_topic. */
const OFF_TOPIC_PATTERN = /\b(hola|hi|hello|hey|heya?|yo|sup|what'?s\s+up|good\s+(morning|afternoon|evening)|howdy|bonjour|ciao|help|what\s+(can|do)\s+you\s+do|how\s+does\s+this\s+work|commands|thanks|thank\s+you|gracias|merci)\b/i;

/** Balance-related queries — maps to check_balance. */
const BALANCE_PATTERN = /\b((?:show|check|my|what'?s\s+my)?\s*balance|how\s+much\s+(?:do\s+i\s+have|money|usd|usdc|crypto)|what\s+do\s+i\s+have)\b/i;

/** Product search / catalog — maps to search_products. */
const SEARCH_PATTERN = /\b(search|what\s+(?:gift\s*)?cards?|what\s+can\s+(?:i|you)\s+buy|what\s+do\s+you\s+have|show\s+products?|list|catalog|available)\b/i;

/** Cash-out actions — buy, purchase, cash out, top up. */
const SUPPORTED_ACTION_PATTERN = /\b(cash\s*out|cashout|buy|purchase|top\s*up|topup|refill)\b/i;

const DOLLAR_AMOUNT_PATTERN = /\$(\d+(?:\.\d{1,2})?)/i;
const USD_AMOUNT_PATTERN = /(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b/i;
const TARGET_PATTERN = /\b(?:to|for)\s+([a-z0-9][a-z0-9 .&+\-]*)$/i;

function inferCategory(message: string): OffRampCategory {
  const normalized = message.toLowerCase();

  if (normalized.includes('esim') || normalized.includes('e-sim')) {
    return 'esim';
  }

  if (
    normalized.includes('top up') ||
    normalized.includes('top-up') ||
    normalized.includes('topup') ||
    normalized.includes('refill')
  ) {
    return 'topup';
  }

  if (normalized.includes('bill')) {
    return 'billpay';
  }

  return 'giftcard';
}

function extractAmount(message: string): number | null {
  const match = DOLLAR_AMOUNT_PATTERN.exec(message) ?? USD_AMOUNT_PATTERN.exec(message);

  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeBrand(rawBrand: string | undefined): string | undefined {
  if (!rawBrand) {
    return undefined;
  }

  return rawBrand
    .trim()
    .replace(/\b(gift\s*card|top\s*up|topup|esim|e-sim|mobile\s*refill)\b/gi, '')
    .trim()
    .toLowerCase() || undefined;
}

export interface IntentParserStrategy {
  parse(message: string): Promise<Result<CashOutIntent, DomainError>>;
}

export class IntentParser implements IntentParserStrategy {
  async parse(message: string): Promise<Result<CashOutIntent, DomainError>> {
    const normalized = message.toLowerCase().trim();

    // ── 1. Greetings / off-topic ──────────────────────────────────────
    if (OFF_TOPIC_PATTERN.test(normalized)) {
      return ok({ action: 'off_topic', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
    }

    // ── 2. Balance check ──────────────────────────────────────────────
    if (BALANCE_PATTERN.test(normalized)) {
      return ok({ action: 'check_balance', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
    }

    // ── 3. Product search ─────────────────────────────────────────────
    if (SEARCH_PATTERN.test(normalized)) {
      return ok({ action: 'search_products', category: 'giftcard', amount: { value: 50, currency: 'USD' } });
    }

    // ── 4. Cash-out ───────────────────────────────────────────────────
    if (!SUPPORTED_ACTION_PATTERN.test(normalized)) {
      return err({
        type: 'UNSUPPORTED_INTENT',
        message: 'I can help you cash out crypto, check your balance, or search for gift cards. Try saying "Cash out $50 to Amazon" or "Show my balance".',
      });
    }

    const amount = extractAmount(normalized);

    if (amount === null || amount <= 0) {
      return err({
        type: 'INVALID_INTENT_AMOUNT',
        message: 'Could not determine the USD amount to cash out.',
      });
    }

    const brandMatch = TARGET_PATTERN.exec(normalized);
    const brand = normalizeBrand(brandMatch?.[1]);

    return ok({
      action: 'cash_out',
      category: inferCategory(normalized),
      ...(brand ? { brand } : {}),
      amount: {
        value: amount,
        currency: 'USD',
      },
    });
  }
}
