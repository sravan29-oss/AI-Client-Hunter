import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, RefreshCw, ShieldCheck, AlertTriangle, Activity, Wrench } from 'lucide-react';
import { apiClient, ApiError } from '../api/client';
import type { ProviderId, ReadinessDashboard, ProviderSummary } from '../types/providerReadiness';

const names: Record<ProviderId, string> = {
  gemini: 'Gemini AI',
  google_places: 'Google Places',
  serpapi: 'SerpApi',
  overpass: 'OpenStreetMap Overpass',
};

export const readinessLabels: Record<string, string> = {
  missing_configuration: 'Missing configuration',
  blocked: 'Blocked',
  untested: 'Untested',
  verified: 'Verified',
  failed: 'Failed',
  rate_limited: 'Rate limited',
  interrupted: 'Interrupted',
  running: 'Checking',
  target_changed: 'Target changed',
};

const button = 'rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-electric-400 focus-visible:outline-electric-400 disabled:opacity-50 transition flex items-center justify-center gap-1.5';
const select = 'mt-1 w-full rounded-lg border border-slate-700 bg-navy-950 px-2 py-2 text-xs text-white';
const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'None recorded';

export function ProviderReadinessPanel() {
  const [data, setData] = useState<ReadinessDashboard | null>(null);
  const [busy, setBusy] = useState<ProviderId | 'refresh' | null>('refresh');
  const [error, setError] = useState('');
  const [location, setLocation] = useState('');
  const [leadId, setLeadId] = useState('');
  const selected = data?.locations.some(l => l.key === location) ? location : data?.locations[0]?.key ?? '';
  const lead = data?.leads.some(l => l.id === leadId) ? leadId : '';

  useEffect(() => {
    let mounted = true;
    apiClient.getProviderReadiness()
      .then(result => { if (mounted) setData(result); })
      .catch(() => { if (mounted) setError('Could not load provider verification records.'); })
      .finally(() => { if (mounted) setBusy(null); });
    return () => { mounted = false; };
  }, []);

  async function run(id?: ProviderId) {
    setBusy(id ?? 'refresh');
    setError('');
    try {
      const updated = id
        ? await apiClient.verifyProvider(
            id,
            id === 'overpass' ? { locationKey: selected } : id === 'gemini' && lead ? { leadId: lead } : {}
          )
        : await apiClient.getProviderReadiness();
      setData(updated);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not retrieve the verification result.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ReadinessView
      data={data}
      busy={busy}
      error={error}
      selected={selected}
      lead={lead}
      setLocation={setLocation}
      setLeadId={setLeadId}
      run={run}
    />
  );
}

type ViewProps = {
  data: ReadinessDashboard | null;
  busy: ProviderId | 'refresh' | null;
  error: string;
  selected: string;
  lead: string;
  setLocation: (key: string) => void;
  setLeadId: (id: string) => void;
  run: (id?: ProviderId) => void;
};

export function ReadinessView({ data, busy, error, selected, lead, setLocation, setLeadId, run }: ViewProps) {
  const passedCount = data?.providers.filter(p => p.passed).length ?? 0;
  const totalCount = data?.providers.length ?? 4;

  return (
    <section aria-label="Provider configuration and readiness" className="space-y-4 rounded-2xl border border-slate-700 bg-navy-900/70 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <ShieldCheck className="h-5 w-5 text-electric-400" />
            Provider configuration &amp; readiness
          </h2>
          <p aria-live="polite" className="mt-1 text-sm text-slate-300">
            {data
              ? `Phase 17 acceptance ${data.acceptance} · ${passedCount} of ${totalCount} provider checks passed`
              : busy
              ? 'Loading verification records…'
              : 'Verification status unavailable'}
          </p>
        </div>
        <button type="button" className={button} disabled={!!busy} onClick={() => void run()}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
          Refresh status
        </button>
      </header>

    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {data?.googleRevocationConfirmed === false && <p className="text-xs text-amber-200">Google Cloud revocation confirmation is pending.</p>}
      {data && !data.databaseAvailable && (
        <p role="alert" className="text-sm text-amber-300">
          Connect a migrated PostgreSQL database to run and record live checks.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data?.providers.map((provider: ProviderSummary) => (
          <article
            key={provider.id}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-800 bg-navy-950/70 p-4 shadow-sm"
          >
            {/* Header: Title & Verified Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <h3 className="font-bold text-white text-sm">{names[provider.id] || provider.id}</h3>
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  provider.state === 'verified'
                    ? 'text-emerald-300'
                    : provider.state === 'failed' || provider.state === 'blocked'
                    ? 'text-rose-300'
                    : 'text-amber-300'
                }`}
              >
                {provider.state === 'verified' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {readinessLabels[provider.state] ?? 'Unknown'}
              </span>
            </div>

            {/* Badges: Configured & Enabled */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  provider.configured
                    ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50'
                    : 'bg-rose-950/50 text-rose-300 border border-rose-800/50'
                }`}
              >
                {provider.configured ? 'Configured' : 'Missing configuration'}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  provider.enabled
                    ? 'bg-blue-950/50 text-blue-300 border border-blue-800/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {provider.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <p className="break-words font-mono text-[11px] text-slate-400">
              <code>{provider.setting}</code>
            </p>

            {provider.issue && (
              <p className="text-xs text-amber-200 bg-amber-950/30 p-2 rounded border border-amber-800/40">
                {provider.issue}
              </p>
            )}

            {/* Usage count & Daily allowance */}
            {provider.usage && (
              <div className="rounded-lg bg-navy-900/60 p-2.5 border border-slate-800/70 text-xs">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Daily usage</span>
                  <span className="font-semibold text-slate-200">
                    {provider.usage.requestsToday} / {provider.usage.dailyLimit}
                  </span>
                </div>
                <div className="mt-1 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-electric-400 h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        provider.usage.dailyLimit > 0
                          ? (provider.usage.requestsToday / provider.usage.dailyLimit) * 100
                          : 0
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400 text-right">
                  {provider.usage.remaining} requests remaining today
                </p>
              </div>
            )}

            {/* Latest Result Message */}
            {provider.latest && (
              <div aria-live="polite" className="space-y-1 break-words text-xs text-slate-200">
                <p>{provider.latest.message}</p>
                {(provider.latest.httpStatus || provider.latest.reason) && (
                  <p className="font-mono text-slate-400">
                    {[
                      provider.latest.httpStatus && 'HTTP ' + provider.latest.httpStatus,
                      provider.latest.reason,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {provider.latest.evidence?.city && (
                  <p className="text-slate-300">
                    {provider.latest.evidence.city}, {provider.latest.evidence.country} ·{' '}
                    {provider.latest.evidence.object || provider.latest.evidence.placeId}
                  </p>
                )}
                {provider.latest.leadId && (
                  <a className="text-electric-300 underline" href={'/?lead=' + provider.latest.leadId}>
                    Open verified CRM lead
                  </a>
                )}
              </div>
            )}

            {/* Latency & Timestamps */}
            <dl className="text-xs space-y-1 pt-1 border-t border-slate-800/60">
              <div className="flex justify-between">
                <dt className="text-slate-400">Last checked</dt>
                <dd className="text-slate-200 text-right">
                  {date(provider.latest?.finishedAt ?? provider.latest?.startedAt ?? null)}
                  {provider.latencyMs != null && (
                    <span className="ml-1 text-[11px] text-electric-300">({provider.latencyMs}ms)</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Last verified successfully</dt>
                <dd className="text-slate-200 text-right">{date(provider.lastSuccessAt)}</dd>
              </div>
            </dl>

            {/* Diagnostics Accordion */}
            {provider.diagnostics && (
              <details className="text-xs text-slate-300 rounded-lg border border-slate-800 bg-navy-950 p-2">
                <summary className="cursor-pointer font-semibold text-slate-400 hover:text-white flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    View Diagnostics
                  </span>
                </summary>
                <div className="mt-2 space-y-1.5 border-t border-slate-800/80 pt-2 text-[11px]">
                  {provider.diagnostics.httpStatus && (
                    <p className="font-mono text-slate-300">
                      <strong className="text-slate-400">HTTP Status:</strong> HTTP {provider.diagnostics.httpStatus}
                    </p>
                  )}
                  {provider.diagnostics.lastError && (
                    <p className="break-words text-rose-300">
                      <strong className="text-slate-400">Error:</strong> {provider.diagnostics.lastError}
                    </p>
                  )}
                  {provider.diagnostics.requestUrl && (
                    <p className="break-all font-mono text-slate-400 text-[10px]">
                      <strong className="text-slate-400">Request:</strong> {provider.diagnostics.requestUrl}
                    </p>
                  )}
                  {provider.diagnostics.suggestedFix && (
                    <div className="mt-1 rounded bg-amber-950/40 p-2 text-amber-200 border border-amber-800/50">
                      <strong>Suggested Fix:</strong> {provider.diagnostics.suggestedFix}
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Test Action Controls */}
            <div className="mt-auto space-y-2 pt-2">
              {provider.id === 'overpass' && (
                <label className="block text-xs text-slate-400">
                  Target city
                  <select value={selected} onChange={e => setLocation(e.target.value)} className={select}>
                    {!data.locations.length && <option value="">Add a city to the active profile</option>}
                    {data.locations.map(l => (
                      <option key={l.key} value={l.key}>
                        {l.city}, {l.country}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {provider.id === 'gemini' && (
                <>
                  <label className="block text-xs text-slate-400">
                    Generation test
                    <select value={lead} onChange={e => setLeadId(e.target.value)} className={select}>
                      <option value="">Connection challenge</option>
                      {data.leads.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.businessName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    {provider.grounded
                      ? 'A grounded CRM ranking is recorded.'
                      : 'Select a discovered lead to verify and save its evidence ranking for acceptance.'}
                  </p>
                </>
              )}

              <button
                type="button"
                className={button}
                disabled={
                  !!busy ||
                  !data.databaseAvailable ||
                  !!provider.issue ||
                  (provider.id === 'overpass' && !selected)
                }
                onClick={() => void run(provider.id)}
              >
                {busy === provider.id ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Checking…
                  </>
                ) : provider.id === 'gemini' ? (
                  'Test live generation'
                ) : provider.id === 'overpass' ? (
                  'Test city query'
                ) : provider.id === 'serpapi' ? (
                  'Test SerpApi live'
                ) : (
                  'Test Places API (New)'
                )}
              </button>
            </div>

            {/* Historical Checks */}
            {provider.history.length > 0 && (
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer">Recent checks</summary>
                <ul className="mt-2 space-y-1">
                  {provider.history.map(h => (
                    <li key={h.id}>
                      {date(h.finishedAt ?? h.startedAt)} · {readinessLabels[h.status]} · {h.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
