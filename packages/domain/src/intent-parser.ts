import { err, ok, type Result } from '@pouch/shared';

import type { DomainError } from './errors';
import type { CashOutIntent, OffRampCategory } from './types';

// ── Pattern definitions ────────────────────────────────────────────────

/** Greetings, help, casual chat — maps to off_topic. Bilingual (EN + ES).
 *  NOTE: Educational queries (how does it work, what is chain abstraction, etc.)
 *  are handled by HELP_PATTERN, not here. */
const OFF_TOPIC_PATTERN = /\b(hola|hi|hello|hey|heya?|yo|sup|what'?s\s+up|good\s+(morning|afternoon|evening)|howdy|bonjour|ciao|help|what\s+(can|do)\s+you\s+do|commands|thanks|thank\s+you|gracias|merci|buenos?\s*(d[ií]as|tardes|noches)|qu[eé]\s+tal|qu[eé]\s+puedes?\s+hacer|ayuda|comandos)\b/i;

/** Balance-related queries — maps to check_balance. Bilingual (EN + ES). */
const BALANCE_PATTERN = /\b((?:show|check|my|what'?s\s+my)?\s*balance|how\s+much\s+(?:do\s+i\s+have|money|usd|usdc|crypto)|what\s+do\s+i\s+have|(?:revis|ver|mira|checa|chequea|mu[eé]strame|cu[aá]nto\s+(?:tengo|hay)|mi\s+)?\s*(?:saldo|billeter|billetera|cartera|balance|fondos|cuenta|wallet|dinero|plata)|cu[aá]nto\s+(?:tengo|hay|dinero|plata))\b/i;

/** Product search / catalog — maps to search_products. Bilingual (EN + ES). */
const SEARCH_PATTERN = /\b(search|what\s+(?:gift\s*)?cards?|what\s+can\s+(?:i|you)\s+buy|what\s+do\s+you\s+have|show\s+products?|list|catalog|available|qu[eé]\s+(?:puedo|puedes)\s+comprar|qu[eé]\s+(?:tienes?|hay)|mu[eé]strame|productos|cat[aá]logo|disponible|buscar)\b/i;

/** Help / educational queries — how does it work, what is chain abstraction, etc. Bilingual. */
const HELP_PATTERN = /\b(how\s+(does\s+(it|this|that)\s+work|do\s+you\s+work|is\s+(it|this)\s+(safe|secure))|what\s+is\s+(chain\s+abstraction|eip.?7702|a\s+universal\s+account|this)|what\s+are\s+the\s+fees|what\s+chains?\s+(do\s+you\s+)?support|why\s+no\s+popups?|is\s+(it|this)\s+(safe|secure)|c[oó]mo\s+funciona|qu[eé]\s+es\s+(chain\s+abstraction|eip.?7702|universal\s+account|esto)|es\s+seguro|c[oó]mo\s+(es\s+que|se\s+hace)\s+sin\s+popups?|qu[eé]\s+comisiones?\s+(tiene|cobras?)|qu[eé]\s+es\s+esto)\b/i;

/** Cash-out actions — buy, purchase, cash out, top up. Bilingual (EN + ES).
 *  NOTE: "enviar" is NOT here — it's ambiguous (send to wallet vs send gift card).
 *  Send-to-wallet is unsupported; it's caught by UNSUPPORTED_ACTION_PATTERN above. */
const SUPPORTED_ACTION_PATTERN = /\b(cash\s*out|cashout|buy|purchase|top\s*up|topup|refill|comprar|cambiar|recargar|recarga|pagar|retirar|sacar|gastar)\b/i;

/** Actions the user might try that Pouch doesn't support — send, swap, transfer, etc.
 *  When matched, we give a helpful message explaining what Pouch CAN do.
 *  Bilingual: English + Spanish (enviar, mandar, transferir, intercambiar). */
const UNSUPPORTED_ACTION_PATTERN = /\b(send|transfer|withdraw|swap|exchange|convert|bridge|stake|lend|borrow|deposit|unwrap|wrap|env[ií]a[r]?|mandar|transferir|intercambiar|cambiar\s+a|mover\s+a)\b/i;

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

    // ── 2. Unsupported actions (send, swap, transfer, etc.) ─────────
    // Check BEFORE balance/search so "send to my wallet" doesn't match
    // the balance pattern just because it contains "wallet".
    if (UNSUPPORTED_ACTION_PATTERN.test(normalized)) {
      return err({
        type: 'UNSUPPORTED_INTENT',
        message: "Pouch is a crypto off-ramp agent — I convert crypto to gift cards, mobile top-ups, and eSIMs. I don't support sending crypto to wallets, swapping tokens, or transferring between chains. Try 'Cash out $50 to Amazon' or 'Show my balance'.",
      });
    }

    // ── 3. Balance check ──────────────────────────────────────────────
    if (BALANCE_PATTERN.test(normalized)) {
      return ok({ action: 'check_balance', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
    }

    // ── 4. Product search ─────────────────────────────────────────────
    if (SEARCH_PATTERN.test(normalized)) {
      return ok({ action: 'search_products', category: 'giftcard', amount: { value: 50, currency: 'USD' } });
    }

    // ── 5. Help / educational ────────────────────────────────────────
    if (HELP_PATTERN.test(normalized)) {
      return ok({ action: 'help', category: 'giftcard', amount: { value: 0, currency: 'USD' } });
    }

    // ── 6. Cash-out ───────────────────────────────────────────────────
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
