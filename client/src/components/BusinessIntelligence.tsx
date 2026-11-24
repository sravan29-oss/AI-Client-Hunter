import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowUpRight, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDot, FileText, Trophy, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../api/client';
import type { BusinessGrowthReport, GrowthMetric, GrowthPoint, GrowthRange, GrowthSelection } from '../types/businessGrowth';
import { MarketIntelligence } from './MarketIntelligence';
import { formatGrowthAmount } from '../utils/reportAmounts';
import { BusinessReports } from './BusinessReports';
import type { ReportDestination } from '../types/businessReports';

export type GrowthDestination = 'leads' | 'projects' | 'followups';

const periods: Record<GrowthRange, string> = {
  last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days',
  thisMonth: 'This month', previousMonth: 'Previous month', custom: 'Custom range',
};
const metrics = {
  totalLeads: { label: 'Total leads', basis: 'Added to the CRM', empty: 'No leads added', to: 'leads', icon: Users },
  qualifiedLeads: { label: 'Qualified leads', basis: 'Currently qualified in this cohort', empty: 'No qualified leads in this cohort', to: 'leads', icon: CheckCircle2 },
  activeOpportunities: { label: 'Active opportunities', basis: 'Currently open in this cohort', empty: 'No active opportunities in this cohort', to: 'leads', icon: BriefcaseBusiness },
  proposalsCreated: { label: 'Proposals created', basis: 'Saved proposal snapshots', empty: 'No saved proposals', to: 'projects', icon: FileText },
  wonDeals: { label: 'Won deals', basis: 'Dated CRM stage records', empty: 'No recorded wins', to: 'leads', icon: Trophy },
  lostDeals: { label: 'Lost deals', basis: 'Dated CRM stage records', empty: 'No recorded losses', to: 'leads', icon: CircleDot },
  followUpsDue: { label: 'Follow-ups due', basis: 'Still pending as of now', empty: 'No pending follow-ups due', to: 'followups', icon: CalendarDays },
  completedFollowUps: { label: 'Completed follow-ups', basis: 'Recorded completion events', empty: 'No recorded completions', to: 'followups', icon: Activity },
} satisfies Record<GrowthMetric, { label: string; basis: string; empty: string; to: GrowthDestination; icon: typeof Users }>;

const field = 'min-h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400';
const panel = 'min-w-0 rounded-2xl border border-slate-800 bg-navy-900/60 p-4 sm:p-5';
const smallDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const calendar = (value: string) => smallDate.format(new Date(value + 'T00:00:00Z'));
const periodText = (from: string, to: string) => from === to ? calendar(from) : `${calendar(from)} – ${calendar(to)}`;
const count = (value: number) => value.toLocaleString();

function EmptyChart({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-xl border border-dashed border-slate-700 bg-navy-950/50 p-4 text-sm leading-relaxed text-slate-300">{children}</p>;
}

type Series = { key: Exclude<keyof GrowthPoint, 'from' | 'to'>; label: string; color: string };

function ActivityChart({ title, caption, empty, data, series }: {
  title: string; caption: string; empty: string; data: GrowthPoint[]; series: Series[];
}) {
  const observed = data.filter((row) => series.some(({ key }) => row[key] > 0));
  return (
    <section className={panel} aria-label={title}>
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
      {observed.length === 0 ? <EmptyChart>{empty}</EmptyChart> : (
        <>
          <div className="mt-3 h-56 min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 7, left: 0, bottom: 0 }} maxBarSize={20} accessibilityLayer>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="from" tickFormatter={calendar} minTickGap={22} tick={{ fill: '#cbd5e1', fontSize: 10 }} tickLine={false} />
                <YAxis width={34} allowDecimals={false} tick={{ fill: '#cbd5e1', fontSize: 10 }} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#1e293b', opacity: 0.5 }}
                  labelFormatter={(_, points) => {
                    const point = points[0]?.payload as GrowthPoint | undefined;
                    return point ? periodText(point.from, point.to) : '';
                  }}
                  contentStyle={{ background: '#121b2e', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {series.map(({ key, label, color }) => <Bar key={key} dataKey={key} name={label} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-xs text-slate-300">
            <summary className="cursor-pointer font-semibold text-electric-300">View recorded periods</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="border-b border-slate-700"><th scope="col" className="p-2">Period</th>
                  {series.map(({ key, label }) => <th scope="col" className="p-2" key={key}>{label}</th>)}</tr></thead>
                <tbody>{observed.map((row) => <tr key={row.from} className="border-b border-slate-800">
                  <th scope="row" className="p-2 font-medium">{periodText(row.from, row.to)}</th>
                  {series.map(({ key }) => <td className="p-2" key={key}>{count(row[key])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function CountBars({ items }: { items: Array<{ label: string; value: number }> }) {
  const largest = Math.max(1, ...items.map(({ value }) => value));
  return <ul className="mt-4 space-y-3">{items.map(({ label, value }) => (
    <li key={label} className="space-y-1">
      <div className="flex justify-between gap-3 text-xs text-slate-200">
        <span>{label}</span><span className="tabular-nums">{count(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800" aria-hidden="true">
        <div className="h-full rounded-full bg-electric-400/80" style={{ width: `${100 * value / largest}%` }} />
      </div>
    </li>
  ))}</ul>;
}

export function BusinessGrowthContent({ report, compact = false, onNavigate }: {
  report: BusinessGrowthReport; compact?: boolean; onNavigate: (to: GrowthDestination) => void;
}) {
  const { coverage, qualification, timeline } = report;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">{report.period.from} to {report.period.to}</span>
        <span>{report.timezone}</span>
        {report.partialToday && <span>Today is in progress</span>}
        {report.previous && <span>Previous range {report.previous.from} to {report.previous.to}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Business KPIs">
        {report.kpis.map(({ key, value, comparison }) => {
          const metric = metrics[key];
          const Icon = metric.icon;
          return (
            <button type="button" key={key} onClick={() => onNavigate(metric.to)}
              className="min-w-0 rounded-xl border border-slate-800 bg-navy-900/70 px-3 py-3 text-left hover:border-electric-500/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400 sm:px-4">
              <span className="flex items-start justify-between gap-2 text-xs font-semibold text-slate-300">
                <span>{metric.label}</span><Icon className="h-4 w-4 shrink-0 text-electric-300" aria-hidden="true" />
              </span>
              <span className="mt-2 block text-2xl font-extrabold tabular-nums text-white">{count(value)}</span>
              <span className="mt-1 block text-xs text-slate-400">{value > 0 ? metric.basis : metric.empty}</span>
              <span className={`mt-2 block text-xs ${comparison ? 'text-electric-300' : 'text-slate-400'}`}>
                {comparison ? `${comparison.delta > 0 ? '+' : ''}${count(comparison.delta)} vs previous (${count(comparison.value)})`
                  : 'Comparison unavailable'}
              </span>
            </button>
          );
        })}
      </div>
      {compact && <p className="text-xs text-slate-400">Actual revenue unavailable</p>}
      {!compact && <>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityChart title="Lead acquisition trend" caption="CRM creation date. Provider references show structured attribution."
            empty="No leads were added in this range. Saved CRM leads populate the trend." data={timeline}
            series={[{ key: 'leads', label: 'CRM leads added', color: '#5c9cff' }, { key: 'providerLeads', label: 'With provider reference', color: '#75d8c7' }]} />
          <section className={panel}>
            <h3 className="text-sm font-bold text-white">Lead qualification funnel</h3>
            <p className="mt-1 text-xs text-slate-400">Current qualification of leads added during the selected range.</p>
            {qualification.assessed > 0 ? <CountBars items={[
              { label: 'Added', value: qualification.added },
              { label: 'Assessed', value: qualification.assessed },
              { label: 'Qualified', value: qualification.qualified },
            ]} /> : <EmptyChart>Qualification assessments for leads added in this range are needed to show the funnel.</EmptyChart>}
          </section>
          <section className={panel}>
            <h3 className="text-sm font-bold text-white">Lead status distribution</h3>
            <p className="mt-1 text-xs text-slate-400">Current CRM stage of leads added during the selected range.</p>
            {report.statusDistribution.length > 0 ? <CountBars items={report.statusDistribution.map(({ stage, count }) => ({
              label: stage.replace(/_/g, ' '), value: count,
            }))} /> : <EmptyChart>No leads were added in this range. Saved leads with CRM stages populate this view.</EmptyChart>}
          </section>
          <ActivityChart title="Follow-up activity" caption="Pending reminders by due date and recorded completions by event date."
            empty="This range has no pending reminders due or recorded completions." data={timeline}
            series={[{ key: 'followUpsDue', label: 'Pending and due', color: '#f9bb73' }, { key: 'followUpsCompleted', label: 'Completed', color: '#75d8c7' }]} />
          <ActivityChart title="Proposal activity" caption="Saved proposals by creation date and manual deliveries by their recorded date."
            empty="This range has no saved proposals or recorded proposal deliveries." data={timeline}
            series={[{ key: 'proposalsCreated', label: 'Created', color: '#5c9cff' }, { key: 'proposalsDelivered', label: 'Delivery recorded', color: '#ac9efa' }]} />
          <section className={panel}>
            <h3 className="text-sm font-bold text-white">Quote value and revenue</h3>
            <div className="mt-4 rounded-xl border border-slate-700 bg-navy-950/60 p-3">
              <p className="font-semibold text-white">Actual revenue unavailable</p>
              <p className="mt-1 text-xs text-slate-400">Verified payment records are required to report actual revenue.</p>
            </div>
            <h4 className="mt-4 text-xs font-semibold text-slate-300">Face value of saved proposals</h4>
            {report.quoteValues.length > 0 ? (
              <dl className="mt-2 space-y-2">{report.quoteValues.map(({ currency, totalMinor, quotes }) => (
                <div key={currency} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-800 p-2 text-sm">
                  <dt>{currency} · {count(quotes)} saved</dt><dd className="font-semibold text-white">{formatGrowthAmount(currency, totalMinor)}</dd>
                </div>
              ))}</dl>
            ) : <p className="mt-2 text-xs text-slate-400">No priced proposals were saved in this range.</p>}
            {report.excludedQuoteAmounts > 0 && <p className="mt-2 text-xs text-amber-300">{count(report.excludedQuoteAmounts)} proposals lack a usable INR or USD amount.</p>}
          </section>
        </div>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">Data coverage</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Leads available', value: count(coverage.totalLeads) },
              { label: 'With provider reference', value: `${count(coverage.providerLeads)} of ${count(coverage.totalLeads)}` },
              { label: 'Saved proposals', value: count(coverage.proposals) },
              { label: 'Recorded closed deals', value: count(coverage.closedDeals) },
              { label: 'Payment records', value: 'Unavailable' },
            ].map(({ label, value }) => <div key={label} className="rounded-lg border border-slate-800 p-3">
              <dt className="text-slate-400">{label}</dt><dd className="mt-1 text-sm font-bold text-white">{value}</dd>
            </div>)}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            {count(coverage.assessedLeads)} of {count(coverage.totalLeads)} leads have qualification evidence in this cohort.
            Closed deals require dated stage history. Comparisons require supporting records in both ranges.
          </p>
        </section>
      </>}
    </div>
  );
}

export function BusinessIntelligence({ selection, onSelection, revision, compact = false, onNavigate, onAlternate, onOpenLead }: {
  selection: GrowthSelection;
  onSelection: (selection: GrowthSelection) => void;
  revision: number;
  compact?: boolean;
  onNavigate: (to: ReportDestination) => void;
  onAlternate: () => void;
  onOpenLead?: (id: string) => void;
}) {
  const [view, setView] = useState<'performance' | 'markets' | 'reports'>('performance');
  const [mode, setMode] = useState<GrowthRange>(selection.range);
  const [from, setFrom] = useState(selection.from ?? '');
  const [to, setTo] = useState(selection.to ?? '');
  const [result, setResult] = useState<{ selection: GrowthSelection; revision: number; report: BusinessGrowthReport } | null>(null);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [retry, setRetry] = useState(0);
  const report = result?.selection === selection && result.revision === revision ? result.report : null;

  useEffect(() => {
    if (view !== 'performance') return;
    const request = new AbortController();
    setError('');
    apiClient.getBusinessGrowth(selection, request.signal).then((data) => {
      if (!request.signal.aborted) setResult({ selection, revision, report: data });
    }).catch((cause: unknown) => {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the dashboard.');
    });
    return () => request.abort();
  }, [selection, revision, retry, view]);

  function choosePreset(range: GrowthRange) {
    setMode(range);
    setValidation('');
    if (range !== 'custom') onSelection({ range });
    else if (result?.report && !from && !to) {
      setFrom(result.report.period.from);
      setTo(result.report.period.to);
    }
  }

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) {
      setValidation('Enter a start date on or before the end date.');
      return;
    }
    setValidation('');
    onSelection({ range: 'custom', from, to });
  }

  const Heading = compact ? 'h2' : 'h1';
  return (
    <section className="min-w-0 space-y-4" aria-label={compact ? 'Business snapshot' : 'Business Intelligence'}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <Heading className={compact ? 'text-base font-bold text-white' : 'text-2xl font-extrabold tracking-tight text-white'}>
            {compact ? 'Business snapshot' : 'Business Intelligence'}
          </Heading>
          <p className="mt-1 text-sm text-slate-400">Lead activity and sales records for the selected period.</p>
        </div>
        <button type="button" onClick={onAlternate}
          className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-electric-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400">
          {compact ? 'Open Business Intelligence' : 'All-time analytics'}<ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {view !== 'reports' && <div className="flex flex-wrap items-end gap-3">
        <label className="w-full text-xs font-semibold text-slate-300 sm:w-auto">
          <span className="mb-1 block">Date range</span>
          <select className={field} value={mode} onChange={(event) => choosePreset(event.target.value as GrowthRange)}>
            {Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {mode === 'custom' && <form onSubmit={applyDates} className="grid w-full min-w-0 grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <label className="min-w-0 text-xs font-semibold text-slate-300">
            <span className="mb-1 block">Start date</span>
            <input required type="date" value={from} max={to || result?.report.today}
              onChange={(event) => setFrom(event.target.value)} className={field} />
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-300">
            <span className="mb-1 block">End date</span>
            <input required type="date" value={to} min={from || undefined} max={result?.report.today}
              onChange={(event) => setTo(event.target.value)} className={field} />
          </label>
          <button type="submit" className="col-span-2 min-h-10 rounded-lg bg-electric-600 px-4 py-2 text-sm font-bold text-white hover:bg-electric-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400">
            Apply range
          </button>
        </form>}
      </div>}
      {view !== 'reports' && validation && <p role="alert" className="text-sm text-rose-300">{validation}</p>}
      {!compact && onOpenLead && <div className="flex flex-wrap gap-2" aria-label="Business Intelligence views">
        {(['performance', 'markets', 'reports'] as const).map((item) => <button type="button" key={item} aria-pressed={view === item}
          onClick={() => setView(item)}
          className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400 ${view === item
            ? 'border-electric-400/60 bg-electric-500/15 text-electric-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
          {{ performance: 'Performance', markets: 'Lead priorities and markets', reports: 'Business Reports' }[item]}
        </button>)}
      </div>}
      {view === 'performance' && error && <div role="alert" className={panel}>
        <p className="text-sm text-rose-300">{error}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 text-sm font-semibold text-electric-300">Retry dashboard</button>
      </div>}
      {view === 'performance' && !report && !error && <p role="status" className={`${panel} text-sm text-slate-300`}>Loading business metrics…</p>}
      {view === 'performance' && report && !error && <BusinessGrowthContent report={report} compact={compact} onNavigate={onNavigate} />}
      {view === 'markets' && onOpenLead && <MarketIntelligence selection={selection} revision={revision} onOpenLead={onOpenLead} />}
      {view === 'reports' && onOpenLead && <BusinessReports onOpenLead={onOpenLead} onNavigate={onNavigate} />}
    </section>
  );
}
