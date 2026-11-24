import type { AutoHunterLogItem } from '../types';

export function DiscoveryRunDetails({ run }: { run: AutoHunterLogItem }) {
  const metrics = run.qualificationMetrics;
  const counts = [
    ['Discovered', run.discoveredCount], ['Enriched', metrics?.enriched], ['Analyzed', run.websitesAuditedCount],
    ['Qualified', run.qualifiedCount], ['Rejected', metrics?.rejected], ['Duplicates', run.duplicatesCount],
    ['Inspection failures', metrics?.inspectionFailures], ['Directory requests', metrics?.directoryRequests],
    ['Gemini requests', metrics?.geminiRequests],
  ].filter(([, value]) => value !== undefined);
  return <div className="space-y-2 text-xs text-slate-300">
    <p className="break-words text-slate-400">
      {[run.profileSnapshot?.profileName, run.city, run.country, metrics?.providerId ?? run.providerUsed].filter(Boolean).join(' · ')}
      {run.durationMs != null && ` · ${(run.durationMs / 1000).toFixed(1)} s`}
    </p>
    <dl className="flex flex-wrap gap-x-4 gap-y-2">
      {counts.map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="font-semibold text-white">{value}</dd></div>)}
    </dl>
    {metrics?.providerError && <p className="break-words text-amber-300">{metrics.providerError}</p>}
    {Boolean(metrics?.qualifiedLeads?.length) && <ul aria-label="Newly qualified leads" className="space-y-1">
      {metrics?.qualifiedLeads.map((lead) => <li key={lead.id}>
        <a href={`/?lead=${encodeURIComponent(lead.id)}`} className="text-electric-300 hover:underline">{lead.businessName} · {lead.score}/100</a>
      </li>)}
    </ul>}
    {Boolean(metrics?.rejectionReasons?.length) && <details>
      <summary className="cursor-pointer text-slate-300">Rejection reasons</summary>
      <ul className="mt-1 space-y-1">
        {metrics?.rejectionReasons.map((item, index) => <li key={index}>
          {item.businessName} · {item.reason} {item.score !== undefined && `(${item.score}/100)`} {item.inspectionError && `· ${item.inspectionError}`}
        </li>)}
      </ul>
    </details>}
  </div>;
}
