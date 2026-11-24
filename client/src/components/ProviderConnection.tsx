import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ProviderConnectionState, ProviderStatus } from '../types';

const states: Record<ProviderConnectionState, { label: string; style: string }> = {
  connected: { label: 'Connected', style: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' },
  missing_configuration: { label: 'Missing Configuration', style: 'border-amber-500/25 bg-amber-500/10 text-amber-300' },
  unavailable: { label: 'Unavailable', style: 'border-rose-500/25 bg-rose-500/10 text-rose-300' },
  rate_limited: { label: 'Rate Limited', style: 'border-amber-500/25 bg-amber-500/10 text-amber-300' },
  not_tested: { label: 'Not tested', style: 'border-slate-600 bg-slate-800 text-slate-300' },
  ready: { label: 'Ready', style: 'border-slate-600 bg-slate-800 text-slate-300' },
};

interface ProviderConnectionProps {
  provider: ProviderStatus;
  onStatus: (status: ProviderStatus) => void;
  disabled?: boolean;
}

export function ProviderConnection({ provider, onStatus, disabled }: ProviderConnectionProps) {
  const [testing, setTesting] = useState(false);
  const [requestError, setRequestError] = useState(false);
  const state = states[provider.connectionState];

  async function testConnection() {
    setTesting(true);
    setRequestError(false);
    try {
      onStatus(await apiClient.checkProviderHealth(provider.id));
    } catch {
      setRequestError(true);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5" aria-live="polite">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${state.style}`}>
          {provider.enabled === false ? 'Disabled' : state.label}
        </span>
        {provider.configured && provider.envVarKey && (
          <p className="text-[11px] text-slate-400">
            {provider.configurationKind === 'endpoint' ? 'Authorized endpoint' : 'Backend API key'}{' '}
            <code className="break-all text-slate-300">{provider.envVarKey}</code>
          </p>
        )}
        {provider.error && <p className="text-[11px] leading-relaxed text-slate-300">{provider.error}</p>}
        {provider.dailyRequestLimit !== undefined && <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <div><dt>Requests today (UTC)</dt><dd className="text-slate-200">{provider.requestsToday ?? 0} / {provider.dailyRequestLimit}</dd></div>
          <div><dt>Remaining</dt><dd className="text-slate-200">{provider.dailyRequestsRemaining ?? 0}</dd></div>
          <div><dt>Availability</dt><dd className="text-slate-200">{provider.enabled ? 'Enabled' : 'Disabled'}</dd></div>
          <div><dt>Last success</dt><dd className="text-slate-200">{provider.lastSuccessfulRequestAt ? new Date(provider.lastSuccessfulRequestAt).toLocaleString() : 'No request recorded'}</dd></div>
          {provider.lastRequestError && <div className="col-span-2"><dt>Last request error</dt><dd className="text-amber-300">{provider.lastRequestError}</dd></div>}
        </dl>}
        {provider.lastChecked && (
          <p className="text-[10px] text-slate-400">
            Checked <time dateTime={provider.lastChecked}>{new Date(provider.lastChecked).toLocaleTimeString()}</time>
            {provider.latencyMs !== undefined && ` · ${provider.latencyMs} ms`}
          </p>
        )}
      </div>
      {provider.configurationKind !== 'none' && (
        <button
          type="button"
          onClick={testConnection}
          disabled={disabled || testing || !provider.configured || provider.enabled === false}
          aria-label={`Test Connection for ${provider.name}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-navy-950 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`h-3 w-3 ${testing ? 'animate-spin text-electric-400' : ''}`} />
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
      )}
      {requestError && <p role="alert" className="text-[11px] text-rose-300">Could not run the connection test. Try again.</p>}
    </div>
  );
}
