import type { ProviderFailure } from './providerErrors';
import type { ProviderStatus } from './types';

export function completeProviderCheck(
  provider: ProviderStatus,
  startedAt: number,
  failure?: ProviderFailure,
  error = failure?.message,
): ProviderStatus {
  const latencyMs = Date.now() - startedAt;
  return {
    ...provider,
    connectionState: failure ? (failure.kind === 'rate_limit' ? 'rate_limited' : 'unavailable') : 'connected',
    isHealthy: !failure,
    lastChecked: new Date().toISOString(),
    latencyMs,
    statusMessage: error ?? `Connected and verified live (${latencyMs}ms latency).`,
    error: error ?? null,
  };
}
