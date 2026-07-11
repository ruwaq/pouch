import type { AccountProvider } from '@pouch/domain';
import type { Config } from '@pouch/shared';

import { DemoAccountProvider } from './demo-account-provider';

function resolveMode(config: Config): 'demo' | 'particle' {
  if (config.WEB3_PROVIDER_MODE) {
    return config.WEB3_PROVIDER_MODE;
  }

  return config.NODE_ENV === 'production' ? 'particle' : 'demo';
}

function assertParticleModeSupported(): never {
  throw new Error(
    'Particle account provider is not implemented yet. Use WEB3_PROVIDER_MODE=demo in development until infra-web3/particle is wired.',
  );
}

export function createAccountProvider(config: Config): AccountProvider {
  const mode = resolveMode(config);

  switch (mode) {
    case 'demo':
      return new DemoAccountProvider(config);
    case 'particle':
      return assertParticleModeSupported();
  }
}
