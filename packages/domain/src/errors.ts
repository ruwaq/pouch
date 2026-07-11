import type { OffRampCategory, ProviderId } from './types';

export type DomainError =
  | { type: 'UNSUPPORTED_INTENT'; message: string }
  | { type: 'INVALID_INTENT_AMOUNT'; message: string }
  | { type: 'NO_PROVIDER_AVAILABLE'; category: OffRampCategory }
  | { type: 'ALL_PROVIDERS_FAILED' }
  | { type: 'INSUFFICIENT_FUNDS'; available: number; required: number }
  | { type: 'INVALID_PROVIDER_RESPONSE'; providerId: ProviderId; message: string }
  | { type: 'PROVIDER_NOT_FOUND'; providerId: ProviderId }
  | { type: 'PAYMENT_ADDRESS_MISSING'; orderId: string }
  | { type: 'UNKNOWN'; message: string };

export function toUnknownDomainError(message: string): DomainError {
  return {
    type: 'UNKNOWN',
    message,
  };
}
