import type { AccountProvider } from '@pouch/domain';
import type { Config } from '@pouch/shared';

import { DemoAccountProvider } from './demo-account-provider';
import { ParticleAccountProvider } from './particle/universal-account';

function resolveMode(config: Config): 'demo' | 'particle' {
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
  }
}
