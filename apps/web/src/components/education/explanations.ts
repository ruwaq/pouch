/**
 * Single source of truth for ALL educational explanations.
 * To update copy, edit this file — no JSX changes needed.
 *
 * Design principles:
 * - Data separate from UI: this file is pure data, no React
 * - Scalable: add a new key = add a new explanation everywhere
 * - Internationalization-ready: replace with i18n later
 */

export interface StepExplanation {
  title: string;
  body: string;
}

export interface FlowStep {
  emoji: string;
  title: string;
  description: string;
}

// ── Trace step explanations ──────────────────────────────────────────
// Keys match trace step labels. "Creating order with" and "Paid via"
// use prefix matching (startsWith).

export const STEP_EXPLANATIONS: Record<string, StepExplanation> = {
  'Reading unified balance': {
    title: 'Unified Balance',
    body: 'Pouch reads your crypto balances across all chains (Arbitrum, Base, Polygon) using your Universal Account. EIP-7702 aggregates everything into one view — no need to check each chain separately.',
  },
  'Finding best provider': {
    title: 'Provider Routing',
    body: 'Pouch compares off-ramp providers to find the best price for your cash-out. Providers compete on price, delivery speed, and available denominations — you always get the cheapest option.',
  },
  'Creating order with': {
    title: 'Order Creation',
    body: 'Pouch places the order with the selected provider. Every order is idempotent — retries will never create duplicate purchases. Your funds are safe throughout the process.',
  },
  'Consolidating via Universal Account': {
    title: 'Cross-Chain Consolidation',
    body: 'Your funds are spread across multiple chains. EIP-7702 Universal Accounts consolidate them into a single chain in one atomic transaction — invisible to you. No bridging, no manual steps, no gas management.',
  },
  'Funding agent wallet': {
    title: 'Agent Wallet Funding',
    body: 'Pouch moves your consolidated funds to a secure agent wallet that will handle the final payment. This uses EIP-7702 delegation — the agent wallet acts on your behalf without you signing every transaction.',
  },
  'Paid via': {
    title: 'Gasless Settlement',
    body: 'The agent wallet pays the provider using gas sponsorship. You never pay gas fees and never see a wallet popup. Openfort covers the gas, making the experience feel like Web2 — just like buying with a credit card.',
  },
  'Signing payment': {
    title: 'Blind Signature',
    body: 'Your wallet signs the transaction using blind signatures via Magic Link. No popup, no confirmation dialog, no gas estimation. The signature happens invisibly in the background.',
  },
};

// ── Badge tooltip explanations ───────────────────────────────────────

export const BADGE_EXPLANATIONS: Record<string, string> = {
  'UA 7702':
    'EIP-7702 Universal Accounts: manage assets across multiple chains from a single account. No need for gas tokens on each chain — the account delegates transactions atomically.',
  'NO POPUP':
    'Zero wallet popups. Blind signatures via Magic Link + gas sponsorship via Openfort. The user experience is identical to Web2 — no confirmations, no gas estimates, no chain switching.',
  cheapest:
    'Provider routing: Pouch compares multiple off-ramp providers in real-time to find the lowest price. Competition drives better rates for you.',
};

// ── How It Works flow steps ──────────────────────────────────────────

export const LANDING_STEPS: FlowStep[] = [
  {
    emoji: '🗣️',
    title: 'You speak',
    description: 'Type what you want in natural language — "Cash out $50 to Amazon". No wallet addresses, no chain selection, no gas settings.',
  },
  {
    emoji: '🧠',
    title: 'AI understands',
    description: 'Gemini LLM parses your intent: extracts the amount, product, and provider. Multi-turn confirmation ensures accuracy before executing.',
  },
  {
    emoji: '🔗',
    title: 'UA 7702 consolidates',
    description: 'Your crypto across Arbitrum, Base, and Polygon is consolidated into a single Universal Account. One transaction, invisible to you.',
  },
  {
    emoji: '🔍',
    title: 'Routes to best provider',
    description: 'Pouch compares Bitrefill and other off-ramp providers to find the cheapest price. Competition drives better rates.',
  },
  {
    emoji: '⚡',
    title: 'Gasless settlement',
    description: 'Openfort agent wallet pays the provider with zero gas fees for you. Magic blind signatures mean no wallet popups — ever.',
  },
  {
    emoji: '🎁',
    title: 'Redeem instantly',
    description: 'Your gift card, top-up, or eSIM is delivered immediately. Copy the code and redeem — no waiting, no blockchain confirmations to track.',
  },
];

export const EMPTY_STATE_STEPS: FlowStep[] = [
  {
    emoji: '🧠',
    title: 'AI parses your request',
    description: 'Gemini LLM understands natural language — no commands, no forms.',
  },
  {
    emoji: '🔗',
    title: 'UA 7702 consolidates multi-chain',
    description: 'Your crypto across chains is merged atomically. Invisible to you.',
  },
  {
    emoji: '⚡',
    title: 'Gasless payment via Openfort',
    description: 'Zero wallet popups. Zero gas fees. Just like Web2.',
  },
];