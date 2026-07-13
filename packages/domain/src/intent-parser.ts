import { err, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { CashOutIntent, OffRampCategory } from './types';

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
  parse(message: string): Result<CashOutIntent, DomainError>;
}

export class IntentParser implements IntentParserStrategy {
  parse(message: string): Result<CashOutIntent, DomainError> {
    if (!SUPPORTED_ACTION_PATTERN.test(message)) {
      return err({
        type: 'UNSUPPORTED_INTENT',
        message: 'Only cash-out purchase requests are supported right now.',
      });
    }

    const amount = extractAmount(message);

    if (amount === null || amount <= 0) {
      return err({
        type: 'INVALID_INTENT_AMOUNT',
        message: 'Could not determine the USD amount to cash out.',
      });
    }

    const brandMatch = TARGET_PATTERN.exec(message);
    const brand = normalizeBrand(brandMatch?.[1]);

    return ok({
      action: 'cash_out',
      category: inferCategory(message),
      ...(brand ? { brand } : {}),
      amount: {
        value: amount,
        currency: 'USD',
      },
    });
  }
}
