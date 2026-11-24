import type { Lead } from '../types';
import { websiteStatusLabels } from '../utils/crmDiscovery';

const names: Record<string, string> = {
  businessName: 'Business name', website: 'Website', address: 'Address', category: 'Category', city: 'City',
  country: 'Country', status: 'Business status', description: 'Description', email: 'Public email', phone: 'Public phone',
};
const aiLabels = { pending: 'Pending', available: 'Available', temporarily_unavailable: 'Temporarily unavailable', failed: 'Failed' };

function dateLabel(value: string) {
  return new Date(value).toLocaleString();
}

function sourceLink(value: unknown) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined;
}

export function LeadDiscoveryEvidence({ lead }: { lead: Lead }) {
  const data = lead.discoveryEvidence;
  const inspection = data?.inspection;
  const target = data?.targetLocation;
  const analysis = data?.analysis;
  const report = lead.audits?.[0];
  const sources = lead.discoverySources ?? [];
  const history = lead.activityHistory ?? [];
  const verification = lead.providerVerifications?.[0];
  if (!data && !verification && !lead.aiStatus && !sources.length && !history.length) return null;
  return <section className="space-y-4 rounded-xl border border-slate-800 bg-navy-900/60 p-4" aria-label="Qualification evidence">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-white">Qualification evidence</h3>
      {data?.classification && <span className="rounded-full bg-electric-950 px-2 py-1 text-xs font-semibold text-electric-300">{data.classification}</span>}
    </div>
    {lead.aiStatus && <p className="text-xs text-slate-300">AI status · {aiLabels[lead.aiStatus]}</p>}
    {verification && <div className="rounded-lg border border-emerald-700/40 p-3 text-xs text-slate-300">
      <h4 className="font-semibold text-emerald-300">Gemini verified ranking</h4>
      <p>{verification.evidence.model} · {dateLabel(verification.finishedAt)} · {verification.origin === 'production' ? 'Production ranking' : 'Acceptance check'}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">{verification.evidence.ranked.map(item => <li key={item}>{item}</li>)}</ol>
    </div>}
    {data && <>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        {target && <div><dt className="text-slate-400">Target</dt><dd>{[target.city, target.country].filter(Boolean).join(', ')} {data.profileName && `· ${data.profileName}`}</dd></div>}
        <div><dt className="text-slate-400">Discovered</dt><dd>{lead.discoveryDate ? dateLabel(lead.discoveryDate) : 'Unknown'} · {lead.source}</dd></div>
        <div><dt className="text-slate-400">Website inspection</dt><dd>{websiteStatusLabels[lead.websiteAnalysisStatus ?? 'UNKNOWN']} {inspection?.httpStatus && `· HTTP ${inspection.httpStatus}`}</dd></div>
        {typeof analysis?.confidence === 'number' && <div><dt className="text-slate-400">Evidence confidence</dt><dd>{analysis.confidence}/100 · {analysis.generatedBy === 'gemini' ? 'Gemini ranked findings' : 'Measured evidence'}</dd></div>}
      </dl>
      {analysis?.websiteCondition && <p className="text-xs text-slate-300">{analysis.websiteCondition}</p>}
      {inspection?.status === 'ANALYZED' && report && <div className="rounded-lg border border-slate-800 p-2 text-xs text-slate-300">
        <p className="font-semibold text-white">Website report</p>
        <p>{report.summary || analysis?.websiteCondition}</p>
        {report.techStackDetected?.length > 0 && <p className="mt-1">Technology indicators · {report.techStackDetected.join(', ')}</p>}
      </div>}
      {(Array.isArray(analysis?.opportunities) ? analysis.opportunities : []).map((item) => <article key={item.id} className="space-y-1 rounded-lg border border-slate-800 p-3 text-xs">
        <h4 className="font-semibold text-white">{item.opportunity}</h4>
        <p className="text-slate-400">{item.evidence}</p>
        <p className="text-slate-300">{item.service} · {item.scope}</p>
      </article>)}
      <details className="text-xs text-slate-300">
        <summary className="cursor-pointer font-semibold text-white">Business fields and sources</summary>
        <dl className="mt-2 grid gap-2 break-words sm:grid-cols-2">
          {Object.entries(data.fields ?? {}).filter(([, entry]) => entry && typeof entry.value === 'string').map(([key, entry]) => <div key={key}>
            <dt className="text-slate-400">{names[key] || key}</dt>
            <dd>{entry.value}</dd>
            <dd className="break-all text-[11px] text-slate-400">
              {sourceLink(entry.source) ? <a href={entry.source} target="_blank" rel="noreferrer" className="text-electric-300 hover:underline">View source</a> : entry.source}
            </dd>
          </div>)}
          {(Array.isArray(data.socialLinks) ? data.socialLinks : []).map((entry) => <div key={entry.platform}><dt className="capitalize text-slate-400">{entry.platform}</dt>
            <dd>{sourceLink(entry.url) && <a href={entry.url} target="_blank" rel="noreferrer" className="text-electric-300 hover:underline">Open profile</a>}</dd>
          </div>)}
        </dl>
      </details>
    </>}
    {(sources.length > 0 || history.length > 0) && <details className="text-xs text-slate-300">
      <summary className="cursor-pointer font-semibold text-white">Discovery and activity history</summary>
      <ul className="mt-2 space-y-2">
        {sources.map((item) => <li key={item.providerId + item.reference} className="break-words">
          <span className="font-semibold">{item.providerId.replace(/_/g, ' ')}</span> · {dateLabel(item.firstDiscoveredAt)}
          {item.firstDiscoveredAt !== item.lastDiscoveredAt && ` · Last seen ${dateLabel(item.lastDiscoveredAt)}`}
          {item.sourceUrl && sourceLink(item.sourceUrl) && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-electric-300 hover:underline">Original listing</a>}
        </li>)}
        {history.map((item) => <li key={item.id}>{dateLabel(item.createdAt)} · {item.description}</li>)}
      </ul>
    </details>}
  </section>;
}
