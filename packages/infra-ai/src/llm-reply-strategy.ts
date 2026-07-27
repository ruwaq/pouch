import type { LiveWalletContext, ReplyContext, ReplyScenario, ReplyStrategy } from '@pouch/domain';
import { isOk } from '@pouch/shared';

import type { LLMProvider, LlmTextRequest } from './llm-provider';
import { POUCH_SYSTEM_PROMPT } from './system-prompt';

/**
 * Renders the live wallet context into a clearly-delimited block appended to
 * the prompt so the LLM can ground specific answers. Returns '' when there is
 * no liveContext. Privacy: only labels + truncated addresses are present here
 * (the chat service truncates before populating).
 */
function renderLiveContext(live: LiveWalletContext | undefined): string {
  if (!live) return '';

  const lines: string[] = ['\n\n## Live wallet context (real, current)'];
  lines.push(`Total: $${live.totalUsd.toFixed(2)}`);

  if (live.assets.length > 0) {
    lines.push('Assets:');
    for (const a of live.assets.slice(0, 8)) {
      const label = a.walletLabel ? ` [${a.walletLabel}]` : '';
      lines.push(`  - ${a.amount} ${a.symbol} on chain ${a.chainId}${label} ($${a.usdValue.toFixed(2)})`);
    }
  }

  if (live.wallets.length > 0) {
    lines.push('Wallets:');
    for (const w of live.wallets.slice(0, 6)) {
      lines.push(`  - ${w.label} ${w.addressTruncated}`);
    }
  }

  if (live.recentTransactions && live.recentTransactions.length > 0) {
    lines.push('Recent real transactions:');
    for (const t of live.recentTransactions.slice(0, 5)) {
      const tok = t.token ? ` ${t.token}` : '';
      lines.push(`  - ${t.type} ${t.amount}${tok} on chain ${t.chainId} — ${t.txHash} @ ${t.timestamp}`);
    }
  }

  if (live.technologies.length > 0) {
    lines.push(`Active technologies/bounties: ${live.technologies.join(', ')}`);
  }

  lines.push('Ground your answer in this real data when relevant. Be specific (e.g. "you have X TOKEN in Wallet Y on CHAIN"), not generic.');
  return lines.join('\n');
}

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
  // Inject live wallet context only for scenarios where grounding in the user's
  // real balance/wallets helps. Skip it for success/error/cancelled (success
  // explicitly tells the model NOT to mention wallets/chains; the others don't
  // benefit from a wallet dump).
  const SCENARIOS_WITHOUT_LIVE_CONTEXT: ReadonlySet<ReplyScenario> = new Set([
    'success',
    'error',
    'cancelled',
  ]);
  const liveBlock = SCENARIOS_WITHOUT_LIVE_CONTEXT.has(context.scenario)
    ? ''
    : renderLiveContext(context.liveContext);
  const historyBlock = context.history?.length
    ? `\n\nRecent conversation:\n${context.history.map((m) => `${m.role === 'user' ? 'User' : 'Pouch'}: ${m.content}`).join('\n')}`
    : '';

  switch (context.scenario) {
    case 'greeting': {
      const lastUserMsg = context.history?.filter((m) => m.role === 'user').pop()?.content;
      const userSaid = lastUserMsg && lastUserMsg !== context.intent.brand
        ? `"${lastUserMsg.slice(0, 150)}"`
        : 'a greeting';
      return `The user said: ${userSaid}. Write a short, friendly reply. If the user asked for something Pouch cannot do (send crypto, swap tokens, transfer between chains), politely explain that Pouch is a crypto off-ramp agent — it converts crypto to gift cards, mobile top-ups, and eSIMs. If the user is just greeting you, introduce yourself briefly in 1-2 sentences and suggest one concrete thing they can try. Length should match the message — a plain "hi" gets a short reply.${historyBlock}${liveBlock}`;
    }

    case 'balance':
      return balancePrompt(context) + historyBlock + liveBlock;

    case 'search':
      return searchPrompt(context) + historyBlock + liveBlock;

    case 'confirmation':
      return confirmationPrompt(context) + historyBlock + liveBlock;

    case 'success':
      return successPrompt(context) + historyBlock + liveBlock;

    case 'cancelled':
      return `The user cancelled their pending cash-out. Write a friendly reply acknowledging the cancellation and asking what they'd like to do instead. Keep it brief.${historyBlock}${liveBlock}`;

    case 'insufficient':
      return insufficientPrompt(context) + historyBlock + liveBlock;

    case 'error':
      return `Something went wrong while processing the user's request. The error was: "${context.error ?? 'unknown error'}". Write a friendly reply apologizing and suggesting they try again or ask for help. Keep it brief (1-2 sentences) — the user is already aware something went wrong. Do NOT expose raw stack traces or internal error codes, but you MAY name the general problem in plain words (e.g. "the Arbitrum network seems slow").${historyBlock}${liveBlock}`;

    case 'help': {
      const topic = context.topic ?? 'general';
      return `The user asked about: "${topic}". They want to learn how Pouch works. Use your technical knowledge (from the system prompt) to explain thoroughly in plain language — use analogies, break the concept into steps, and explicitly connect it to how Pouch uses this technology and why it matters for the hackathon. Scale the length to the topic: a quick definition can be 2-3 sentences, but a deep concept like EIP-7702 or chain abstraction deserves a fuller paragraph or two. Map the topic to the right technology (eip-7702, chain-abstraction, particle-ua, openfort, magic, no-popups, security, fees, chains, how-it-works, general). End with one concrete suggestion the user can act on (e.g. "try Show my balance" or "cash out $5 to Amazon").${historyBlock}${liveBlock}`;
    }

    case 'send': {
      const amount = context.intent.amount.value.toFixed(2);
      const token = context.intent.brand ?? 'tokens';
      const walletList = context.error ?? '';
      return `The user wants to send ${amount} ${token} between their wallets. Available wallets:\n${walletList}\n\nWrite a friendly response listing the available wallets and asking which ones to send from and to. Mention that this transfer uses Particle UA EIP-7702 consolidation and executes with no popups. Keep it concise — a short list plus one question.${historyBlock}${liveBlock}`;
    }

    case 'send_confirmation': {
      const planSummary = context.planSummary ?? 'transfer';
      const gasEstimate = context.error ?? '~$0.03';
      return `The user is about to confirm a wallet-to-wallet transfer: ${planSummary}. Estimated gas: ${gasEstimate}. Write a friendly confirmation message showing the details (from, to, amount, token, network Arbitrum, gas sponsored by Openfort). End by asking the user to reply "yes" to confirm or "no" to cancel. Length should fit the details — no filler.${historyBlock}${liveBlock}`;
    }

    case 'swap_confirmation': {
      const planSummary = context.planSummary ?? 'swap';
      return `The user is about to confirm a token swap: ${planSummary}. This uses Uniswap V3 on Arbitrum to swap ARB → ETH (so they can pay for gas). Write a friendly confirmation message showing the details (amount, token in, token out, network Arbitrum). End by asking the user to reply "yes" to confirm or "no" to cancel. Length should fit the details — no filler.${historyBlock}${liveBlock}`;
    }

    case 'fallback':
    default:
      return `The user said something Pouch doesn't understand. Write a friendly reply gently steering them back to what Pouch can do: cash out crypto to gift cards, mobile top-ups, or eSIM, plus wallet operations (send between wallets, swap ARB→ETH, fund gas). Suggest they try "Cash out $50 to Amazon" or "Show my balance". Keep it brief.${historyBlock}${liveBlock}`;
  }
}

function balancePrompt(context: ReplyContext): string {
  const b = context.balance;
  if (!b) return 'The user asked for their balance but no data is available. Write a friendly message saying you cannot retrieve the balance right now.';

  const assets = b.assets.map((a) => {
    const label = a.walletLabel ? `[${a.walletLabel}] ` : '';
    return `  ${label}${a.amount} ${a.symbol}: $${a.usdValue.toFixed(2)}`;
  }).join('\n');
  return [
    `The user asked for their balance. Here's what they have:`,
    `Total: $${b.total.toFixed(2)} across ${b.assets.length} asset${b.assets.length === 1 ? '' : 's'}:`,
    assets,
    '',
    `Write a friendly summary of their balance. Mention the total and the per-asset breakdown by symbol and wallet label (never chain IDs). Hint at what they could cash out. Scale the length to how many assets they hold — one or two assets gets a sentence, many assets gets a short list.`,
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
    `Write a friendly message presenting these results and asking if they want to cash out to one of them. Length should fit the number of results shown.`,
  ].join('\n');
}

function confirmationPrompt(context: ReplyContext): string {
  const plan = context.planSummary ?? `cash out $${context.intent.amount.value.toFixed(2)}`;
  const balance = context.balance;
  const balanceLine = balance ? `\nThey have $${balance.total.toFixed(2)} available.` : '';

  return [
    `The user wants to ${plan}.${balanceLine}`,
    `Write a friendly message confirming the plan and asking them to confirm (reply "yes" or "sí"). Keep it to a sentence or two — confirm what will happen, then ask.`,
  ].join('\n');
}

function successPrompt(context: ReplyContext): string {
  const brand = context.order?.product.brand ?? context.intent.brand ?? 'your selected product';
  const amount = context.intent.amount.value.toFixed(2);
  const orderId = context.result?.orderId ?? '';

  return [
    `The cash-out just completed successfully.`,
    `Brand: ${brand}; Amount: $${amount}; Order ID: ${orderId}.`,
    `Write a friendly message confirming the order. Address the user directly. Do NOT invent a gift card code. Do NOT mention wallets, chains, or gas — keep the celebration focused on the result. A sentence or two is right.`,
  ].join(' ');
}

function insufficientPrompt(context: ReplyContext): string {
  const balance = context.balance;
  const amount = context.intent.amount.value.toFixed(2);
  const total = balance?.total.toFixed(2) ?? '0.00';

  return [
    `The user wants to cash out $${amount} but only has $${total}.`,
    `Write a friendly message explaining they don't have enough and suggesting a smaller amount they CAN afford. A sentence or two is right.`,
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