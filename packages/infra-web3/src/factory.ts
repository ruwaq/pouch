import type { AccountProvider, AgentWalletPort, LoggerPort } from '@pouch/domain';
import type { Config } from '@pouch/shared';

import { DemoAccountProvider } from './demo-account-provider';
import { OpenfortAgentWallet, createRealOpenfortClientFactory } from './openfort/openfort-provider';
import { ParticleAccountProvider } from './particle/universal-account';
import { PrivateKeyAccountProvider } from './private-key/private-key-provider';

function resolveMode(config: Config): 'demo' | 'particle' | 'private-key' {
  if (config.WEB3_PROVIDER_MODE) {
    return config.WEB3_PROVIDER_MODE;
  }

  return config.NODE_ENV === 'production' ? 'particle' : 'demo';
}

function createParticleProvider(config: Config): AccountProvider {
  if (!config.PARTICLE_PROJECT_ID || !config.PARTICLE_CLIENT_KEY || !config.PARTICLE_APP_ID) {
    throw new Error(
      'Particle mode requires PARTICLE_PROJECT_ID, PARTICLE_CLIENT_KEY, PARTICLE_APP_ID. Set them in .env or use WEB3_PROVIDER_MODE=demo.',
    );
  }

  return new ParticleAccountProvider({
    projectId: config.PARTICLE_PROJECT_ID,
    projectClientKey: config.PARTICLE_CLIENT_KEY,
    projectAppUuid: config.PARTICLE_APP_ID,
    settlementChainId: config.SETTLEMENT_CHAIN_ID,
  });
}

export function createAccountProvider(config: Config): AccountProvider {
  const mode = resolveMode(config);

  switch (mode) {
    case 'demo':
      return new DemoAccountProvider(config);
    case 'particle':
      return createParticleProvider(config);
    case 'private-key':
      return new PrivateKeyAccountProvider(config);
  }
}

/**
 * Creates the agent wallet for gasless settlement. Returns:
 * - `undefined` when OPENFORT_* env vars are unset → executor takes the demo
 *   (direct UA payment) path.
 * - An `OpenfortAgentWallet` when all three OPENFORT_* vars are set.
 * - Throws in production when SECRET_KEY is set but WALLET_SECRET or
 *   FEE_SPONSORSHIP_ID is missing (fail-fast on incomplete config).
 * - In dev with incomplete config, returns undefined (demo path, never breaks).
 *
 * SYNCHRONOUS by design: the SDK import is deferred inside the clientFactory
 * (called lazily on first getAddress/settlePayment), so this function never
 * blocks boot. Mirrors the createAccountProvider pattern.
 */
export function createAgentWallet(
  config: Config,
  logger: LoggerPort,
): AgentWalletPort | undefined {
  const hasSecret = Boolean(config.OPENFORT_SECRET_KEY);
  const hasWalletSecret = Boolean(config.OPENFORT_WALLET_SECRET);
  const hasFeeSponsorship = Boolean(config.OPENFORT_FEE_SPONSORSHIP_ID);

  if (!hasSecret) {
    return undefined;
  }

  // Secret is set but config is incomplete.
  if (!hasWalletSecret || !hasFeeSponsorship) {
    const missing = [
      !hasWalletSecret ? 'OPENFORT_WALLET_SECRET' : null,
      !hasFeeSponsorship ? 'OPENFORT_FEE_SPONSORSHIP_ID' : null,
    ]
      .filter(Boolean)
      .join(', ');

    if (config.NODE_ENV === 'production') {
      throw new Error(
        `OPENFORT_SECRET_KEY is set but ${missing} is missing. Set all three or unset OPENFORT_SECRET_KEY to use demo mode.`,
      );
    }

    logger.error({ missing }, 'Openfort config incomplete — falling back to demo agent wallet path.');
    return undefined;
  }

  const clientFactory = createRealOpenfortClientFactory({
    secretKey: config.OPENFORT_SECRET_KEY!,
    walletSecret: config.OPENFORT_WALLET_SECRET!,
  });

  return new OpenfortAgentWallet(clientFactory, config.OPENFORT_FEE_SPONSORSHIP_ID!, logger);
}
