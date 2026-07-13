// Config for the Particle AccountProvider. Declared locally so the domain and
// other packages never import the UA SDK directly (it has a broken package.json
// "exports" field that breaks TS resolution outside this package).
export interface ParticleProviderConfig {
  projectId: string;
  projectClientKey: string;
  projectAppUuid: string;
  settlementChainId: number;
}
