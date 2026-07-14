// Re-export the AgentWalletPort from types for ergonomic imports.
// The port is defined in types.ts so all domain interfaces live together;
// this module exists so callers can `import { AgentWalletPort } from '@pouch/domain'`
// without reaching into types.
export type { AgentWalletPort } from './types';
