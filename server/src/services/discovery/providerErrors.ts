import axios from 'axios';
import { AppError } from '../../utils/errors';

const failures = {
  missing_credentials: { status: 400, message: 'Search provider is not configured.', retryable: false },
  invalid_input: { status: 400, message: 'The search input could not be used.', retryable: false },
  authentication: { status: 502, message: 'Search provider rejected its credentials.', retryable: false },
  request_rejected: { status: 502, message: 'Search provider rejected the request.', retryable: false },
  rate_limit: { status: 429, message: 'Search provider rate limit reached.', retryable: true },
  timeout: { status: 504, message: 'Search provider timed out.', retryable: true },
  unavailable: { status: 503, message: 'Search provider is temporarily unavailable.', retryable: true },
  upstream_error: { status: 502, message: 'Search provider returned an upstream error.', retryable: true },
  invalid_response: { status: 502, message: 'Search provider returned an invalid response.', retryable: false },
} as const;

export type ProviderFailureKind = keyof typeof failures;

export class ProviderFailure extends AppError {
  readonly retryable: boolean;
  constructor(readonly providerId: string, readonly kind: ProviderFailureKind, readonly upstreamStatus?: number, message?: string, readonly retryAfterMs?: number) {
    const failure = failures[kind];
    super(message ?? failure.message, failure.status, { providerId, kind, upstreamStatus, retryable: failure.retryable, retryAfterMs });
    this.retryable = failure.retryable;
  }
}

export function providerHttpFailure(providerId: string, status: number, retryAfterMs?: number): ProviderFailure {
  const kind = status === 400 ? 'request_rejected'
    : status === 401 || status === 403 ? 'authentication'
    : status === 429 ? 'rate_limit'
    : status === 408 || status === 504 ? 'timeout'
    : status === 503 ? 'unavailable' : 'upstream_error';
  return new ProviderFailure(providerId, kind, status, undefined, retryAfterMs);
}

function retryDelay(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const text = String(value).trim();
  const milliseconds = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - Date.now();
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : undefined;
}

export function classifyProviderError(providerId: string, error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  if (axios.isAxiosError(error)) {
    if (error.response?.status) return providerHttpFailure(providerId, error.response.status, retryDelay(error.response.headers?.['retry-after']));
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new ProviderFailure(providerId, 'timeout');
    return new ProviderFailure(providerId, 'unavailable');
  }
  return new ProviderFailure(providerId, 'invalid_response');
}
