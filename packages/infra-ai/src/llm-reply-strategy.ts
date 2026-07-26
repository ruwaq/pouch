import type { ReplyContext, ReplyStrategy } from '@pouch/domain';
import { isOk } from '@pouch/shared';

import type { LLMProvider, LlmTextRequest } from './llm-provider';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * Composes a conversational reply via the LLM for ANY scenario (greeting, balance,
 * search, confirmation, success, cancelled, insufficient, error, fallback).
 * On ANY failure it falls back to a deterministic template so the agent always responds.
 */
export class LlmReplyStrategy implements ReplyStrategy {
  constructor(private readonly llm: LLMProvider) {}

  async buildReply(context: ReplyContext): Promise<string> {
    const fallback = () => templateReply(context);

    try {
      const prompt = buildPrompt(context);
      const historyContents = (context.history ?? []).map((m) => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.content,
      }));
      const request: LlmTextRequest = {
        systemInstruction: POUCH_SYSTEM_PROMPT,
        message: prompt,
      };
      if (historyContents.length > 0) {
        request.contents = historyContents;
      }

      const MAX_ATTEMPTS = 3; // 1 initial + 2 retries.
      let lastError: unknown = undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await this.llm.generateText(request);
          if (isOk(result) && result.value.trim()) {
            return result.value.trim();
          }
          lastError = new Error('LLM returned empty response');
        } catch (e) {
          lastError = e;
        }
        if (attempt < MAX_ATTEMPTS) {
          await sleep(300 * 2 ** (attempt - 1)); // 300ms, then 600ms.
        }
      }

      const message = lastError instanceof Error ? lastError.message : String(lastError);
      console.warn(`[LLM] reply strategy exhausted ${MAX_ATTEMPTS} attempts; falling back to template. Last error: ${message}`);
      return fallback();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[LLM] reply strategy hit an unexpected error; falling back to template. Error: ${message}`);
      return fallback();
    }
  }
}

// ── Prompt builders per scenario ──────────────────────────────────────────

function buildPrompt(context: ReplyContext): string {
  const historyBlock = context.history?.length
    ? `\n\nRecent conversation:\n${context.history.map((m) => `${m.role === 'user' ? 'User' : 'Pouch'}: ${m.content}`).join('\n')}`
    : '';

  switch (context.scenario) {
    case 'greeting': {
      const lastUserMsg = context.history?.filter((m) => m.role === 'user').pop()?.content;
      const userSaid = lastUserMsg && lastUserMsg !== context.intent.brand
        ? `"${lastUserMsg.slice(0, 150)}"`
        : 'a greeting';
      return `The user said: ${userSaid}. Write a single short, friendly sentence. If the user asked for something Pouch cannot do (send crypto, swap tokens, transfer between chains), politely explain that Pouch is a crypto off-ramp agent — it converts crypto to gift cards, mobile top-ups, and eSIMs. If the user is just greeting you, introduce yourself briefly. Keep it under 2 lines.${historyBlock}`;
    }

    case 'balance':
      return balancePrompt(context) + historyBlock;

    case 'search':
      return searchPrompt(context) + historyBlock;

    case 'confirmation':
      return confirmationPrompt(context) + historyBlock;

    case 'success':
      return successPrompt(context) + historyBlock;

    case 'cancelled':
      return `The user cancelled their pending cash-out. Write a single short, friendly sentence acknowledging the cancellation and asking what they'd like to do instead.${historyBlock}`;

    case 'insufficient':
      return insufficientPrompt(context) + historyBlock;

    case 'error':
      return `Something went wrong while processing the user's request. The error was: "${context.error ?? 'unknown error'}". Write a single short, friendly sentence apologizing and suggesting they try again or ask for help. Do NOT mention technical details. Keep it under 2 lines.${historyBlock}`;

    case 'help': {
      const topic = context.topic ?? 'general';
      return `The user asked about: "${topic}". They want to learn how Pouch works. Use your educational knowledge (from the system prompt) to explain clearly in plain language. Use analogies. Keep it under 3 sentences. Never use technical jargon. Be encouraging — offer to help them cash out after.${historyBlock}`;
    }

    case 'send': {
      const balance = context.balance;
      const amount = context.intent.amount.value.toFixed(2);
      const token = context.intent.brand ?? 'tokens';
      const walletList = context.error ?? '';
      return `The user wants to send ${amount} ${token} between their wallets. Available wallets:\n${walletList}\n\nWrite a short, friendly response listing the available wallets and asking which ones to send from and to. Mention that this transfer uses Particle UA EIP-7702 consolidation. Keep it under 3 lines.${historyBlock}`;
    }

    case 'send_confirmation': {
      const planSummary = context.planSummary ?? 'transfer';
      const gasEstimate = context.error ?? '~$0.03';
      return `The user is about to confirm a wallet-to-wallet transfer: ${planSummary}. Estimated gas: ${gasEstimate}. Write a short, friendly confirmation message showing the details (from, to, amount, token, network Arbitrum, gas sponsored by Openfort). End with asking the user to reply "yes" to confirm or "no" to cancel. Keep it under 4 lines.${historyBlock}`;
    }

    case 'swap_confirmation': {
      const planSummary = context.planSummary ?? 'swap';
      return `The user is about to confirm a token swap: ${planSummary}. This uses Uniswap V3 on Arbitrum to swap ARB → ETH (so they can pay for gas). Write a short, friendly confirmation message showing the details (amount, token in, token out, network Arbitrum). End with asking the user to reply "yes" to confirm or "no" to cancel. Keep it under 4 lines.${historyBlock}`;
    }

    case 'fallback':
    default:
      return `The user said something Pouch doesn't understand. Write a single short, friendly sentence gently steering them back to what Pouch can do: cash out crypto to gift cards, mobile top-ups, or eSIM. Suggest they try "Cash out $50 to Amazon" or "Show my balance".${historyBlock}`;
  }
}

function balancePrompt(context: ReplyContext): string {
  const b = context.balance;
  if (!b) return 'The user asked for their balance but no data is available. Write a friendly message saying you cannot retrieve the balance right now.';

  const assets = b.assets.map((a) => `  ${a.symbol} on chain ${a.chainId}: $${a.usdValue.toFixed(2)}`).join('\n');
  return [
    `The user asked for their balance. Here's what they have:`,
    `Total: $${b.total.toFixed(2)} across ${b.assets.length} asset${b.assets.length === 1 ? '' : 's'}:`,
    assets,
    '',
    `Write a single short, friendly sentence summarizing their balance naturally. Mention the total and hint they can cash out. Do NOT mention chain IDs or technical details. Keep it under 3 lines.`,
  ].join('\n');
}

function searchPrompt(context: ReplyContext): string {
  const products = context.products ?? [];
  const brand = context.intent.brand ?? '';
  const category = context.intent.category;

  if (products.length === 0) {
    return `The user searched for ${category} products${brand ? ` matching "${brand}"` : ''} but nothing was found. Write a friendly sentence suggesting they try a different search.`;
  }

  const lines = products.slice(0, 3).map((p) => `  • ${p.name} — from $${p.denominations?.[0] ?? 10}`);
  return [
    `The user searched for ${category} products${brand ? ` matching "${brand}"` : ''}. Results:`,
    ...lines,
    '',
    `Write a single short, friendly sentence presenting these results and asking if they want to cash out to one of them. Keep it under 3 lines.`,
  ].join('\n');
}

function confirmationPrompt(context: ReplyContext): string {
  const plan = context.planSummary ?? `cash out $${context.intent.amount.value.toFixed(2)}`;
  const balance = context.balance;
  const balanceLine = balance ? `\nThey have $${balance.total.toFixed(2)} available.` : '';

  return [
    `The user wants to ${plan}.${balanceLine}`,
    `Write a single short, friendly sentence confirming the plan and asking them to confirm (say "yes" or "sí"). Keep it under 2 lines.`,
  ].join('\n');
}

function successPrompt(context: ReplyContext): string {
  const brand = context.order?.product.brand ?? context.intent.brand ?? 'your selected product';
  const amount = context.intent.amount.value.toFixed(2);
  const orderId = context.result?.orderId ?? '';

  return [
    `The cash-out just completed successfully.`,
    `Brand: ${brand}; Amount: $${amount}; Order ID: ${orderId}.`,
    `Write a single short, friendly sentence confirming the order. Do NOT invent a gift card code. Do NOT mention wallets, chains, or gas. Address the user directly. Keep it under 2 lines.`,
  ].join(' ');
}

function insufficientPrompt(context: ReplyContext): string {
  const balance = context.balance;
  const amount = context.intent.amount.value.toFixed(2);
  const total = balance?.total.toFixed(2) ?? '0.00';

  return [
    `The user wants to cash out $${amount} but only has $${total}.`,
    `Write a single short, friendly sentence explaining they don't have enough and suggesting a smaller amount. Keep it under 2 lines.`,
  ].join('\n');
}

// ── Deterministic template fallback (used when LLM is unavailable) ─────────

function templateReply(context: ReplyContext): string {
  const amount = context.intent.amount.value.toFixed(2);
  const brand = context.order?.product.brand ?? context.intent.brand;

  switch (context.scenario) {
    case 'greeting': {
      const b = context.balance;
      if (b) {
        return `Hey! 👋 I'm Pouch, your AI cash-out agent. You have $${b.total.toFixed(2)} across ${b.assets.length} asset${b.assets.length !== 1 ? 's' : ''}. Try "Cash out $10 to Amazon" or "Show my balance".`;
      }
      return "Hey! 👋 I'm Pouch — your AI cash-out agent. I can convert your crypto into gift cards, mobile top-ups, and more. Try \"Cash out $50 to Amazon\" or \"Show my balance\".";
    }

    case 'balance': {
      const b = context.balance;
      if (!b) return "I couldn't retrieve your balance right now. Try again in a moment.";
      const lines = b.assets.map((a) => `  ${a.symbol} on chain ${a.chainId}: $${a.usdValue.toFixed(2)}`);
      return `You have $${b.total.toFixed(2)} across ${b.assets.length} asset${b.assets.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
    }

    case 'search': {
      const products = context.products ?? [];
      if (products.length === 0) return `I couldn't find any ${context.intent.category} products. Try a different search.`;
      const lines = products.slice(0, 3).map((p) => `  • ${p.name} — from $${p.denominations?.[0] ?? 10}`);
      return `Here's what I found for ${context.intent.category}:\n${lines.join('\n')}\n\nWant to cash out to one of these?`;
    }

    case 'confirmation':
      return `I'm ready to ${context.planSummary ?? `cash out $${amount} to ${brand ?? 'your selection'}`}. Confirm?`;

    case 'success': {
      const displayBrand = brand
        ? brand.split(/\s+/).filter(Boolean).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ')
        : 'your selected product';
      return `✅ Done! Your ${displayBrand} cash-out for $${amount} is complete. Order ${context.result?.orderId ?? ''}.`;
    }

    case 'cancelled':
      return 'Cancelled. What would you like to do instead?';

    case 'insufficient':
      return `You only have $${context.balance?.total.toFixed(2) ?? '0.00'} — not enough for $${amount}. Try a smaller amount.`;

    case 'error':
      return `⚠ Something went wrong. Please try again or ask for help.`;

case 'help': {
      const topic = context.topic ?? 'general';
      const helpReplies: Record<string, string> = {
        'how-it-works': "Pouch is an AI agent that converts your crypto into gift cards, mobile top-ups, and eSIMs — all through a simple chat. Under the hood, it uses Particle Network's Universal Accounts with EIP-7702 to find your money across any blockchain and consolidate it invisibly.",
        'chain-abstraction': "Chain abstraction means you don't need to know which blockchain your money is on. Pouch uses Particle Network's Universal Accounts to scan all your wallets across Arbitrum, Base, Ethereum, and more — then consolidates everything into one place using EIP-7702.",
        'eip-7702': "EIP-7702 is a new Ethereum standard that lets a regular wallet temporarily become a smart contract. This is the key tech that makes chain abstraction possible: your wallet can execute complex operations across multiple blockchains without you ever seeing a popup.",
        'no-popups': "Zero popups — you sign in once with your email, and every transaction after that happens without a single wallet confirmation screen. This is possible because of EIP-7702: your wallet delegates authority to Particle's Universal Account.",
        'security': "Every transaction goes through a security firewall: amounts over $100 require confirmation, over $200 get a warning, and over $500 are blocked. Your private keys never leave your wallet.",
        'fees': "Pouch charges zero fees. You pay exactly what the gift card costs. Blockchain gas is sponsored by Openfort — you never pay gas.",
        'chains': "Pouch supports Arbitrum, Base, Ethereum, and more. Your crypto is automatically found and consolidated across all chains using Particle Network's Universal Account.",
        'general': "I'm Pouch, your AI cash-out agent! I convert crypto into gift cards, mobile top-ups, and eSIMs using Particle Network's EIP-7702 chain abstraction. Try 'Cash out $50 to Amazon', 'Show my balance', or ask me 'How does it work?'",
      };
      return helpReplies[topic] ?? helpReplies['general']!;
    }

    case 'send': {
      const wallets = context.error ?? '(no wallets found)';
      const amount = context.intent.amount.value.toFixed(2);
      const token = context.intent.brand ?? 'tokens';
      return `Available wallets:\n${wallets}\n\nTo send ${amount} ${token}, specify the wallet: "send ${amount} ${token} from Wallet 1 to Wallet 3".`;
    }

    case 'send_confirmation': {
      const gasInfo = context.error ?? '~$0.03';
      return `💸 **${context.planSummary ?? 'Confirm transfer'}**\n\n⛽ Estimated gas: ${gasInfo}\n\nReady to send? Reply "yes" to confirm or "no" to cancel.`;
    }

    case 'swap_confirmation': {
      return `🔄 **${context.planSummary ?? 'Confirm swap'}**\n\nThis will use Uniswap V3 on Arbitrum.\n\nReady to swap? Reply "yes" to confirm or "no" to cancel.`;
    }

    case 'fallback':
    default: {
      const b = context.balance;
      if (b) {
        return `I can help you cash out crypto to gift cards, top-ups, and eSIMs. You have $${b.total.toFixed(2)} across ${b.assets.length} asset${b.assets.length !== 1 ? 's' : ''}. Try "Cash out $10 to Amazon" or "Show my balance".`;
      }
      return "I can help you cash out crypto, check your balance, or search for gift cards. Try saying \"Cash out $50 to Amazon\" or \"Show my balance\".";
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}