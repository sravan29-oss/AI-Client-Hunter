import axios from 'axios';
import { classifyProviderError, ProviderFailure } from './providerErrors';

// Only return known codes and local messages. Google can echo request data in any free-text field.
const reasons: Record<string, string> = {
  ACCESS_DENIED: 'Google reports access denied for this service. Check Places API (New) enablement and API key restrictions.',
  API_KEY_INVALID: 'Google identified invalid credentials.',
  API_KEY_EXPIRED: 'Google reports that the API key expired.',
  API_KEY_NOT_FOUND: 'Google could not find the supplied API key.',
  BILLING_DISABLED: 'Google reports that billing is disabled for the owning project.',
  BILLING_NOT_ACTIVE: 'Google reports that billing is inactive for the owning project.',
  BILLING_NOT_ENABLED: 'Google reports that billing is disabled for the owning project.',
  SERVICE_DISABLED: 'Google reports that this API is disabled in the owning project.',
  API_KEY_SERVICE_BLOCKED: 'Google reports that the API restriction on this key blocks this service.',
  API_KEY_IP_ADDRESS_BLOCKED: 'Google reports that the backend IP is blocked by the key restriction.',
  API_KEY_HTTP_REFERRER_BLOCKED: 'Google reports that the referrer restriction rejected this server request.',
  API_KEY_ANDROID_APP_BLOCKED: 'Google reports that an Android application restriction rejected the request.',
  API_KEY_IOS_APP_BLOCKED: 'Google reports that an iOS application restriction rejected the request.',
  INVALID_ARGUMENT: 'Google reports an invalid request argument.',
  UNAUTHENTICATED: 'Google reports that authentication failed.',
  RESOURCE_EXHAUSTED: 'Google reports that a quota or resource limit was reached.',
  UNAVAILABLE: 'Google reports that the provider is temporarily unavailable.',
  NOT_FOUND: 'Google reports that the requested resource could not be found.',
};

export class GoogleDiagnostic extends ProviderFailure {
  constructor(id: string, failure: ProviderFailure, readonly reason: string | null, message: string) {
    super(id, failure.kind, failure.upstreamStatus, message, failure.retryAfterMs);
  }
}

export function googleDiagnostic(id: string, error: unknown) {
  const failure = classifyProviderError(id, error);
  if (!axios.isAxiosError(error) || !error.response) return failure;
  const body = error.response.data?.error;
  const details: unknown[] = Array.isArray(body?.details) ? body.details : [];
  const code = details.flatMap(detail => {
    const value = (detail as { reason?: unknown } | null)?.reason;
    return typeof value === 'string' && Object.hasOwn(reasons, value) ? [value] : [];
  })[0];
  const plain: unknown = body?.message;
  const explicit = typeof plain === 'string' && /^API key not valid[.\s]|^The provided API key is invalid\./i.test(plain) ? 'API_KEY_INVALID'
    : typeof plain === 'string' && /^Billing has not been enabled|^Billing is disabled|^You must enable Billing on the Google Cloud Project/i.test(plain) ? 'BILLING_DISABLED'
    : undefined;
  const reason: string | null = code ?? explicit ?? (typeof body?.status === 'string' &&
    (Object.hasOwn(reasons, body.status) || body.status === 'PERMISSION_DENIED') ? body.status : null);
  const status = error.response.status;
  const message = reason && Object.hasOwn(reasons, reason) ? reasons[reason]
    : status === 403 ? 'Google denied access. Google did not identify a failed setting.'
    : 'Google returned an error without a specific diagnostic.';
  return new GoogleDiagnostic(id, failure, reason, 'HTTP ' + status + '. ' + message);
}
