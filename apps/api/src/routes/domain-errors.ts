import type { DomainError } from '@pouch/domain';

export type DomainErrorStatus = 422 | 409 | 503 | 500;

export function toDomainErrorStatus(error: DomainError): DomainErrorStatus {
  switch (error.type) {
    case 'UNSUPPORTED_INTENT':
    case 'INVALID_INTENT_AMOUNT':
      return 422;
    case 'INSUFFICIENT_FUNDS':
      return 409;
    case 'NO_PROVIDER_AVAILABLE':
    case 'ALL_PROVIDERS_FAILED':
      return 503;
    default:
      return 500;
  }
}

export function toDomainErrorMessage(error: DomainError): string {
  switch (error.type) {
    case 'UNSUPPORTED_INTENT':
    case 'INVALID_INTENT_AMOUNT':
    case 'INVALID_PROVIDER_RESPONSE':
    case 'UNKNOWN':
      return error.message;
    case 'INSUFFICIENT_FUNDS':
      return `Insufficient funds. Available: $${error.available.toFixed(2)}, required: $${error.required.toFixed(2)}.`;
    case 'NO_PROVIDER_AVAILABLE':
      return `No provider is available for ${error.category}.`;
    case 'ALL_PROVIDERS_FAILED':
      return 'All provider quote attempts failed.';
    case 'PROVIDER_NOT_FOUND':
      return `Configured provider ${error.providerId} could not be found.`;
    case 'PAYMENT_ADDRESS_MISSING':
      return `Order ${error.orderId} is missing a payment address.`;
  }
}
