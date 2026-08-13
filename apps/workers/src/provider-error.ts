export type DeliveryErrorCode = 'TEMPORARY_FAILURE' | 'PERMANENT_FAILURE' | 'RATE_LIMITED' | 'INVALID_RECIPIENT' | 'PROVIDER_ERROR' | 'TIMEOUT';

export class DeliveryError extends Error {
  constructor(readonly code: DeliveryErrorCode, message: string, readonly retryable: boolean) { super(message); }
}
