import { z } from 'zod';

function parseStringList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const StringListSchema = z.string().transform((value) => parseStringList(value));

const NumberListSchema = z.string().transform((value, ctx) => {
  const parsed = parseStringList(value).map((item) => Number(item));
  const hasInvalidNumber = parsed.some((item) => Number.isNaN(item));

  if (hasInvalidNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expected a comma-separated list of numbers.',
    });

    return z.NEVER;
  }

  return parsed;
});

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  DEMO_MODE: z.string().optional(),
  APP_URL: z.string().url(),

  SETTLEMENT_CHAIN_ID: z.coerce.number().int().positive(),
  SUPPORTED_CHAINS: NumberListSchema,

  OFFRAMP_PROVIDERS: StringListSchema.default('bitrefill'),
  BITREFILL_API_KEY: z.string().optional(),
  BITREFILL_BASE_URL: z.string().url().default('https://api.bitrefill.com/v2'),
  WEB3_PROVIDER_MODE: z.enum(['demo', 'particle', 'private-key']).optional(),
  DEMO_USER_BALANCE_USD: z.coerce.number().positive().default(150),

  // Private-key mode: a pre-funded wallet for demo with real on-chain balances.
  PRIVATE_KEY: z.string().optional(),
  RPC_URL_42161: z.string().url().optional(),
  RPC_URL_8453: z.string().url().optional(),

  MAGIC_PUBLISHABLE_KEY: z.string().optional(),
  MAGIC_SECRET_KEY: z.string().optional(),
  PARTICLE_PROJECT_ID: z.string().optional(),
  PARTICLE_CLIENT_KEY: z.string().optional(),
  PARTICLE_APP_ID: z.string().optional(),
  OPENFORT_SECRET_KEY: z.string().optional(),
  OPENFORT_WALLET_SECRET: z.string().optional(),
  OPENFORT_FEE_SPONSORSHIP_ID: z.string().optional(),

  LLM_PROVIDER: z.enum(['gemini']).optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(32),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return ConfigSchema.parse(env);
}
