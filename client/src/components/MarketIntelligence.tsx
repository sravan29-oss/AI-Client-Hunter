import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../api/client';
import type { GrowthSelection } from '../types/businessGrowth';
import type { IndustryGroup, LocationGroup, MarketIntelligenceReport, MarketRecommendation, PriorityCategory } from '../types/marketIntelligence';

const labels: Record<PriorityCategory, { label: string; color: string }> = {
  high: { label: 'High Priority', color: '#75d8c7' },
  medium: { label: 'Medium Priority', color: '#5c9cff' },
  low: { label: 'Low Priority', color: '#f9bb73' },
  insufficient: { label: 'Insufficient Data', color: '#94a3b8' },
};
const panel = 'min-w-0 rounded-2xl border border-slate-800 bg-navy-900/60 p-4 sm:p-5';
const notice = 'mt-3 rounded-xl border border-dashed border-slate-700 bg-navy-950/70 p-3 text-sm leading-relaxed text-slate-300';
const action = 'inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-electric-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400';
const colors = ['#5c9cff', '#75d8c7', '#ba9dff', '#f9bb73', '#f78c9e', '#74c7e8', '#94a3b8'];
const calendar = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortDate = (value: string) => calendar.format(new Date(value + 'T00:00:00Z'));

function GroupTable({ title, rows, minimum, kind }: {
  title: string; rows: (IndustryGroup | LocationGroup)[]; minimum: number; kind: 'industry' | 'location';
}) {
  const isIndustry = kind === 'industry';
  return (
    <section className={panel} aria-label={title}>
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {isIndustry ? 'CRM industry labels with provider category coverage.' : 'Provider-verified cities and countries. Unverified locations are grouped separately.'}
        {' '}Win rates require {minimum} dated closures in the group{isIndustry ? `, and qualification rates require ${minimum} assessed leads` : ''}.
      </p>
      {rows.length === 0 ? <p className={notice}>No CRM leads were added during the selected range.</p> : (
        <div role="region" tabIndex={0} aria-label={title + ' results'} className="mt-3 overflow-x-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400">
          <table className="w-full min-w-[41rem] text-left text-xs text-slate-300">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>{[isIndustry ? 'Industry' : 'Location', 'Leads', 'Qualified', 'High priority', 'Proposals', 'Closed', 'Won / lost', 'Win rate', 'Sourced'].map((label) =>
                <th key={label} scope="col" className="whitespace-nowrap p-2 font-semibold">{label}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-800">
                <th scope="row" className="max-w-48 break-words p-2 font-semibold text-white">{row.label}</th>
                <td className="p-2 tabular-nums">{row.leads}</td>
                <td className="p-2 tabular-nums">
                  {row.qualified} <span className="whitespace-nowrap text-slate-400">/ {row.assessed} assessed</span>
                  {'qualificationRate' in row && row.qualificationRate !== null && <span className="block text-slate-400">{row.qualificationRate}% qualified</span>}
                </td>
                <td className="p-2 tabular-nums">{row.highPriority}</td>
                <td className="p-2 tabular-nums">{row.proposals}</td>
                <td className="p-2 tabular-nums">{row.closed}</td>
                <td className="p-2 tabular-nums">{row.won === null ? 'Unavailable' : `${row.won} / ${row.lost}`}</td>
                <td className="p-2 tabular-nums">{row.winRate === null ? 'Unavailable' : `${row.winRate}%`}</td>
                <td className="p-2 tabular-nums">{row.sourced} / {row.leads}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IndustryTrend({ trend }: { trend: MarketIntelligenceReport['industryTrend'] }) {
  return (
    <section className={panel} aria-label="Industry distribution over time">
      <h3 className="text-sm font-bold text-white">Industry distribution over time</h3>
      <p className="mt-1 text-xs text-slate-400">Leads added by CRM industry and reporting period.</p>
      {trend.series.length === 0 ? <p className={notice}>Saved leads in the selected range are needed to show industry distribution.</p> : (
        <>
          <div className="mt-3 h-60 min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend.points} maxBarSize={26} margin={{ top: 5, left: 0, right: 8, bottom: 0 }} accessibilityLayer>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="from" tickFormatter={shortDate} minTickGap={22} tick={{ fill: '#cbd5e1', fontSize: 10 }} tickLine={false} />
                <YAxis allowDecimals={false} width={34} tick={{ fill: '#cbd5e1', fontSize: 10 }} tickLine={false} />
                <Tooltip cursor={{ fill: '#1e293b', opacity: 0.5 }}
                  labelFormatter={(value) => shortDate(String(value))}
                  contentStyle={{ background: '#121b2e', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#f1f5f9' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {trend.series.map((item, index) => <Bar key={item.id} dataKey={'counts.' + item.id} name={item.label}
                  stackId="cohort" fill={colors[index]} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-xs text-slate-300">
            <summary className="cursor-pointer font-semibold text-electric-300">View recorded industry counts</summary>
            <ul className="mt-2 space-y-1">
              {trend.points.filter((row) => Object.values(row.counts).some(Boolean)).map((row) => <li key={row.from}>
                {shortDate(row.from)}{row.from !== row.to ? ` to ${shortDate(row.to)}` : ''} ·{' '}
                {trend.series.filter(({ id }) => row.counts[id]).map(({ id, label }) => `${label} ${row.counts[id]}`).join(' · ')}
              </li>)}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

function Recommendation({ item, onOpenLead }: { item: MarketRecommendation; onOpenLead: (id: string) => void }) {
  return (
    <article className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-sm font-semibold text-white">{item.businessName}</h4>
          <p className="mt-1 break-words text-xs text-slate-400">{[
            item.industry, item.location && [item.location.city, item.location.country].filter(Boolean).join(', '),
          ].filter(Boolean).join(' · ') || 'Industry and location coverage unavailable'}</p>
        </div>
        <div className="text-xs font-semibold text-slate-300">
          <span style={{ color: labels[item.category].color }}>{labels[item.category].label}</span>
          <span className="ml-2 tabular-nums">{item.score}/100</span>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-200">{item.increases[0]?.reason ?? 'The saved record has limited scoring evidence.'}</p>
      <p className="mt-2 text-sm text-slate-300"><span className="font-semibold text-white">Next action</span> · {item.nextAction}</p>
      <details className="mt-3 text-xs leading-relaxed text-slate-300">
        <summary className="cursor-pointer font-semibold text-electric-300">Score evidence and missing information</summary>
        <div className="mt-2 space-y-2">
          <p className="font-semibold text-white">Increased score</p>
          {item.increases.length ? <ul className="space-y-1">{item.increases.map((factor) => <li key={factor.code}>+{factor.points} · {factor.reason}</li>)}</ul>
            : <p>No positive factors are documented.</p>}
          <p className="font-semibold text-white">Reduced score</p>
          {item.decreases.length ? <ul className="space-y-1">{item.decreases.map((factor) => <li key={factor.code}>{factor.points} · {factor.reason}</li>)}</ul>
            : <p>No deduction factors are documented.</p>}
          <p className="font-semibold text-white">Missing information</p>
          {item.missing.length ? <ul className="list-disc space-y-1 pl-4">{item.missing.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            : <p>All evaluated evidence categories are present.</p>}
        </div>
      </details>
      <div className="mt-4 border-t border-slate-800 pt-3">
        <h5 className="text-xs font-semibold text-white">Service opportunity matching</h5>
        {item.services.length ? <ul className="mt-2 space-y-2 text-xs text-slate-300">{item.services.map((service) => (
          <li key={service.service} className="rounded-lg border border-slate-800 p-2">
            <p className="font-semibold text-white">{service.service}</p>
            <p className="mt-1">{service.evidence.join(' ')}</p>
          </li>))}</ul> : <p className="mt-1 text-xs text-slate-400">No configured service has enough saved evidence for a match.</p>}
      </div>
      <button type="button" onClick={() => onOpenLead(item.id)} className={`${action} mt-3`}
        aria-label={`Open CRM lead ${item.businessName}`}>Open CRM lead <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></button>
    </article>
  );
}

export function MarketIntelligenceContent({ report, onOpenLead }: { report: MarketIntelligenceReport; onOpenLead: (id: string) => void }) {
  const open = report.priority.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="min-w-0 space-y-4">
      <section className={panel} aria-label="Lead Priority Overview">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">Lead Priority Overview</h2>
            <p className="mt-1 text-xs text-slate-400">{report.period.from} to {report.period.to} · {report.timezone}</p>
          </div>
          <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300">Deterministic evidence scoring</span>
        </div>
        {open === 0 ? <p className={notice}>Open CRM leads in this date range are needed to show priority distribution.</p> : (
          <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Priority distribution">
            {report.priority.map(({ category, count }) => <li key={category} className="rounded-lg border border-slate-800 p-3">
              <p className="text-xs font-semibold text-slate-300">{labels[category].label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-white">{count}</p>
              <div aria-hidden="true" className="mt-2 h-1.5 rounded bg-slate-800">
                <div className="h-full rounded" style={{ width: `${100 * count / open}%`, background: labels[category].color }} />
              </div>
            </li>)}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          {open} open leads in this cohort · {report.excludedClosed} closed or archived leads excluded from priorities.
          {' '}{report.coverage.withProvider} of {report.coverage.leads} leads have structured provider references.
        </p>
        <details className="mt-3 text-xs text-slate-300">
          <summary className="cursor-pointer font-semibold text-electric-300">How scores are calculated</summary>
          <p className="mt-1 leading-relaxed">
            Profile fit {report.rules.weights.profileFit}, opportunity evidence {report.rules.weights.opportunity},
            sales activity {report.rules.weights.salesActivity}, and follow-up urgency {report.rules.weights.followUp}.
            High starts at {report.rules.high} and medium at {report.rules.medium}.
            Leads need {report.rules.minimumSignals} evidence categories for a priority classification.
          </p>
        </details>
      </section>
      <section aria-labelledby="lead-recommendations">
        <h3 id="lead-recommendations" className="text-sm font-bold text-white">Recommended leads to review</h3>
        <p className="mt-1 text-xs text-slate-400">Current priority for leads added during the selected date range.</p>
        {report.recommendations.length ? <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {report.recommendations.map((item) => <Recommendation key={item.id} item={item} onOpenLead={onOpenLead} />)}
        </div> : <p className={notice}>No open leads are available to review in this range.</p>}
      </section>
      <GroupTable title="Industry performance" rows={report.industries} minimum={report.minimumSample} kind="industry" />
      <p className="text-xs text-slate-400">{report.coverage.withIndustry} leads have a CRM industry label. {report.coverage.sourcedIndustry} have a matching provider category.</p>
      <IndustryTrend trend={report.industryTrend} />
      <GroupTable title="Location intelligence" rows={report.locations} minimum={report.minimumSample} kind="location" />
      <p className="text-xs text-slate-400">Verified coverage · {report.coverage.verifiedCity} of {report.coverage.leads} leads by city, {report.coverage.verifiedCountry} by country.</p>
    </div>
  );
}

export function MarketIntelligence({ selection, revision, onOpenLead }: {
  selection: GrowthSelection; revision: number; onOpenLead: (id: string) => void;
}) {
  const [state, setState] = useState<{ selection: GrowthSelection; revision: number; report: MarketIntelligenceReport } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setError('');
    apiClient.getMarketIntelligence(selection, request.signal).then((report) => {
      if (!request.signal.aborted) setState({ selection, revision, report });
    }).catch((err: unknown) => {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load market intelligence.');
    });
    return () => request.abort();
  }, [selection, revision, retry]);
  if (error) return <div role="alert" className={panel}><p className="text-sm text-rose-300">{error}</p>
    <button type="button" onClick={() => setRetry((value) => value + 1)} className={`${action} mt-2`}>Retry market intelligence</button></div>;
  if (!state || state.selection !== selection || state.revision !== revision) {
    return <p role="status" className={`${panel} text-sm text-slate-300`}>Loading lead priorities and markets…</p>;
  }
  return <MarketIntelligenceContent report={state.report} onOpenLead={onOpenLead} />;
}
