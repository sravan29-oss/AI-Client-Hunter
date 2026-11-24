import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Download, Printer, Sparkles } from 'lucide-react';
import { apiClient } from '../api/client';
import type { BusinessReport, BusinessReportHistory, BusinessReportInterpretationStatus, ReportDestination, ReportKind } from '../types/businessReports';
import type { GrowthMetric } from '../types/businessGrowth';
import { formatGrowthAmount } from '../utils/reportAmounts';

const labels: Record<GrowthMetric, string> = {
  totalLeads: 'CRM leads added', qualifiedLeads: 'Qualified leads', activeOpportunities: 'Active opportunities',
  proposalsCreated: 'Proposals created', wonDeals: 'Won opportunities', lostDeals: 'Lost opportunities',
  followUpsDue: 'Follow-ups due', completedFollowUps: 'Follow-ups completed',
};
const priorityLabels: Record<string, string> = {
  high: 'High Priority', medium: 'Medium Priority', low: 'Low Priority', insufficient: 'Insufficient Data',
};
const statuses: Record<BusinessReportInterpretationStatus, string> = {
  generated: 'Saved a separate Gemini interpretation.',
  already_saved: 'Opened the saved Gemini interpretation.',
  unavailable: 'Gemini is unavailable here. The saved deterministic report is ready.',
  no_data: 'This snapshot has too little recorded activity for interpretation.',
  cooldown: 'Gemini is on cooldown. The saved deterministic report is ready.',
  fallback: 'Gemini could not return a validated interpretation. The original report is ready.',
};
const box = 'report-section min-w-0 rounded-xl border border-slate-800 bg-navy-900/70 p-4';
const field = 'min-h-10 w-full min-w-0 rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400';
const action = 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-electric-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-400 disabled:opacity-50';
const title = (kind: ReportKind) => kind === 'weekly' ? 'Weekly business report' : 'Monthly business report';
const formatTime = (date: string, timezone: string) => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: timezone,
}).format(new Date(date));

function MetricList({ rows }: {
  rows: Array<{ label: string; value: number; comparison?: { value: number; delta: number } | null }>;
}) {
  return <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
    {rows.map(({ label, value, comparison }) => (
      <div className="report-item min-w-0 rounded-lg border border-slate-800 p-3" key={label}>
        <dt className="text-xs text-slate-300">{label}</dt>
        <dd className="mt-1 text-lg font-bold tabular-nums text-white">{value.toLocaleString()}</dd>
        {comparison && <dd className="text-xs text-slate-400">Previous {comparison.value} · {comparison.delta >= 0 ? '+' : ''}{comparison.delta}</dd>}
      </div>
    ))}
  </dl>;
}

function ReportGroups({ heading, groups, minimum }: {
  heading: string; groups: BusinessReport['snapshot']['market']['industries'] | BusinessReport['snapshot']['market']['locations']; minimum: number;
}) {
  return <section className={box}>
    <h3 className="text-sm font-bold text-white">{heading}</h3>
    <p className="mt-1 text-xs text-slate-400">Rate comparisons require {minimum} eligible records. Counts describe the saved cohort.</p>
    {groups.length ? <div className="report-table mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={heading + ' results'}>
      <table className="min-w-[31rem] w-full text-left text-xs text-slate-300">
        <thead><tr className="border-b border-slate-700">
          {['Group', 'Leads', 'Qualified', 'High', 'Proposals', 'Closures', 'Win rate'].map((label) =>
            <th scope="col" key={label} className="px-2 py-2">{label}</th>)}
        </tr></thead>
        <tbody>{groups.map((group) => <tr key={group.key} className="border-b border-slate-800">
          <th scope="row" className="break-words px-2 py-2 text-white">{group.label}</th>
          <td className="p-2">{group.leads}</td><td className="p-2">{group.qualified}</td><td className="p-2">{group.highPriority}</td>
          <td className="p-2">{group.proposals}</td><td className="p-2">{group.closed}</td>
          <td className="p-2">{group.winRate === null ? 'Unavailable' : `${group.winRate}%`}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="mt-3 text-sm text-slate-400">No groups are documented in this period.</p>}
  </section>;
}

export function BusinessReportDocument({ report, onNavigate, onOpenLead }: {
  report: BusinessReport; onNavigate: (to: ReportDestination) => void; onOpenLead: (id: string) => void;
}) {
  const s = report.snapshot;
  const { coverage } = s.market;
  return <article className="business-report-print space-y-4" aria-label="Saved business report">
    <header className={box}>
      <h2 className="text-xl font-bold text-white">{title(report.kind)}</h2>
      <p className="mt-2 text-sm text-slate-300">{report.periodFrom} to {report.periodTo} · {report.timezone} {s.partialToday && '· Current day partial'}</p>
      <p className="mt-1 text-xs text-slate-400">Saved snapshot · Generated {formatTime(report.createdAt, report.timezone)} · Measured {formatTime(s.measuredAt, report.timezone)}</p>
      <p className="mt-1 text-xs text-slate-400">
        {s.previous ? `Comparison period ${s.previous.from} to ${s.previous.to}. Differences appear where both periods support them.` : 'No equivalent comparison period is available.'}
      </p>
    </header>
    <section className={box}>
      <h3 className="text-base font-bold text-white">Measured CRM performance</h3>
      <p className="mt-1 text-xs text-slate-400">Qualification, open stages, priority, and pending reminders reflect the recorded state at generation time.</p>
      <MetricList rows={[
        { label: 'New leads discovered', ...s.discovered },
        ...s.growth.kpis.map((row) => ({ ...row, label: labels[row.key] })),
        { label: 'Proposal deliveries recorded', value: s.proposalsDelivered },
        { label: 'Assessed leads in the cohort', value: s.growth.qualification.assessed },
      ]} />
    </section>
    <div className="report-columns grid gap-4 lg:grid-cols-2">
      <section className={box}>
        <h3 className="text-sm font-bold text-white">Lead priority and sales pipeline</h3>
        <MetricList rows={s.market.priority.map(({ category, count }) => ({ label: priorityLabels[category] ?? category, value: count }))} />
        {s.growth.statusDistribution.length ? <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-300">
          {s.growth.statusDistribution.map(({ stage, count }) => <li key={stage}>{stage.replace(/_/g, ' ')} · {count}</li>)}
        </ul> : <p className="mt-3 text-sm text-slate-400">There are no recorded lead stages in this cohort.</p>}
      </section>
      <section className={box}>
        <h3 className="text-sm font-bold text-white">Proposals and revenue</h3>
        <p className="mt-2 font-semibold text-white">Actual revenue unavailable</p>
        <p className="mt-1 text-xs text-slate-400">Verified payment records are required to report actual revenue.</p>
        <h4 className="mt-3 text-xs font-semibold text-slate-300">Saved quote face value</h4>
        {s.growth.quoteValues.length ? <dl className="mt-2 space-y-1 text-sm text-slate-200">
          {s.growth.quoteValues.map(({ currency, totalMinor, quotes }) => <div key={currency} className="flex flex-wrap gap-x-4 gap-y-1">
            <dt>{currency} · {quotes} saved</dt><dd>{formatGrowthAmount(currency, totalMinor)}</dd>
          </div>)}
        </dl> : <p className="mt-2 text-xs text-slate-400">No priced proposals were saved during this period.</p>}
        {s.growth.excludedQuoteAmounts > 0 && <p className="mt-2 text-xs text-slate-400">{s.growth.excludedQuoteAmounts} proposals lack a usable INR or USD amount.</p>}
      </section>
    </div>
    <section className={box}>
      <h3 className="text-sm font-bold text-white">Recorded engagement</h3>
      <MetricList rows={[
        { label: 'Manual deliveries', ...s.engagement.deliveries },
        { label: 'Pitches with linked responses', ...s.engagement.replies },
        { label: 'Recorded responses', value: s.engagement.responses },
        ...s.engagement.objections.map(({ label, count }) => ({ label: label + ' responses', value: count })),
      ]} />
    </section>
    <ReportGroups heading="Industry performance" groups={s.market.industries} minimum={s.market.minimumSample} />
    <ReportGroups heading="Location performance" groups={s.market.locations} minimum={s.market.minimumSample} />
    <section className={box}>
      <h3 className="text-sm font-bold text-white">Data coverage</h3>
      <p className="mt-2 text-sm text-slate-300">{coverage.withProvider} of {coverage.leads} cohort leads have a provider reference.
        {' '}{coverage.sourcedIndustry} have a matching sourced industry, {coverage.verifiedCountry} a verified country, and {coverage.verifiedCity} a verified city.</p>
    </section>
    <section className={box}>
      <h3 className="text-sm font-bold text-white">Opportunities to review</h3>
      {s.review.length ? <ul className="mt-3 grid gap-2 lg:grid-cols-2">{s.review.map((lead) => (
        <li key={lead.id} className="report-item min-w-0 rounded-lg border border-slate-800 p-3">
          <p className="break-words font-semibold text-white">{lead.businessName}</p>
          <p className="mt-1 text-xs text-slate-300">{priorityLabels[lead.category]} · {lead.score}/100</p>
          <p className="mt-1 text-xs text-slate-400">{lead.nextAction}</p>
          <button type="button" className={`report-screen-only mt-2 ${action}`} onClick={() => onOpenLead(lead.id)}>Open CRM lead <ArrowUpRight className="h-3 w-3" aria-hidden /></button>
        </li>
      ))}</ul> : <p className="mt-2 text-sm text-slate-400">This period has no open cohort leads to review.</p>}
    </section>
    <section className={box}>
      <h3 className="text-base font-bold text-white">Business insights and recommended actions</h3>
      <p className="mt-1 text-xs text-slate-400">{report.origin === 'gemini'
        ? `Gemini interpretation · ${s.model}. Gemini chose order and emphasis from supported findings.` : 'Deterministic recommendations from saved CRM evidence.'}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{s.insights.map((insight) => <article key={insight.id} className="report-item rounded-lg border border-slate-800 p-3 text-xs">
        <h4 className="text-sm font-semibold text-white">{insight.observation}</h4>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-300">{insight.support.map((item) => <li key={item}>{item}</li>)}</ul>
        <p className="mt-2 text-slate-200">{insight.emphasis === 'coverage' ? insight.coverageImplication : insight.implication}</p>
        <p className="mt-1 text-slate-400">Data quality · {insight.quality}</p>
        <p className="report-print-only mt-2">{insight.action.label}</p>
        <button type="button" className={`report-screen-only mt-2 ${action}`} onClick={() => onNavigate(insight.action.destination)}>
          {insight.action.label}<ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
        </button>
      </article>)}</div>
    </section>
  </article>;
}

export function BusinessReports({ onNavigate, onOpenLead }: {
  onNavigate: (to: ReportDestination) => void; onOpenLead: (id: string) => void;
}) {
  const [history, setHistory] = useState<BusinessReportHistory | null>(null);
  const [record, setRecord] = useState<BusinessReport | null>(null);
  const [kind, setKind] = useState<ReportKind>('weekly');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const request = new AbortController();
    apiClient.getBusinessReportHistory(request.signal).then((data) => {
      if (!request.signal.aborted) setHistory(data);
    }).catch(() => {
      if (!request.signal.aborted) setHistoryError(true);
    });
    return () => request.abort();
  }, []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try { await task(); } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete this report action.');
    } finally { setBusy(false); }
  }

  async function refreshHistory() {
    setHistory(await apiClient.getBusinessReportHistory());
    setHistoryError(false);
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const saved = await apiClient.generateBusinessReport(kind, date || undefined);
      setRecord(saved);
      setNotice('Saved a new report snapshot.');
      await refreshHistory();
    });
  }

  function interpret() {
    if (!record) return;
    void run(async () => {
      const result = await apiClient.interpretBusinessReport(record.id);
      setRecord(result.report);
      setNotice(statuses[result.status]);
      if (result.status === 'generated') await refreshHistory();
    });
  }

  function download() {
    if (!record) return;
    void run(async () => {
      const blob = await apiClient.exportBusinessReport(record.id);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), {
        href: url, download: `${record.kind}-business-report-${record.periodFrom}.csv`,
      });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  return <div className="min-w-0 space-y-4">
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className={box}>
        <h2 className="text-base font-bold text-white">Business Reports</h2>
        <p className="mt-1 text-sm text-slate-400">Choose a date in the week or month you want to report. Each generation saves a new snapshot.</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={generate}>
          <label className="text-xs font-semibold text-slate-300">Report type
            <select className={field} value={kind} onChange={(event) => setKind(event.target.value as ReportKind)}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">Date in reporting period
            <input className={field} type="date" min="1900-01-01" max={history?.today} value={date}
              onChange={(event) => setDate(event.target.value)} />
          </label>
          <p className="text-xs text-slate-400 sm:col-span-2">Weeks start Monday. A blank date uses today{history ? ` in ${history.timezone}` : ''}.</p>
          <button type="submit" className={`${action} w-fit`} disabled={busy}>Generate report</button>
        </form>
      </section>
      <section className={box}>
        <h2 className="text-base font-bold text-white">Report history</h2>
        {history ? history.records.length ? <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto">
          {history.records.map((item) => <li key={item.id}>
            <button type="button" disabled={busy} aria-pressed={record?.id === item.id}
              className="w-full rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-slate-500 focus-visible:outline focus-visible:outline-electric-400"
              onClick={() => void run(async () => { setRecord(await apiClient.openBusinessReport(item.id)); })}>
              <span className="block text-xs font-semibold text-white">{title(item.kind)} · {item.periodFrom} to {item.periodTo}</span>
              <span className="block text-xs text-slate-400">{formatTime(item.createdAt, item.timezone)} · {item.origin === 'gemini' ? 'Gemini interpretation' : 'Deterministic'}</span>
            </button>
          </li>)}
        </ul> : <p className="mt-2 text-sm text-slate-400">No reports have been saved yet.</p>
          : !historyError && <p role="status" className="mt-2 text-sm text-slate-400">Loading report history…</p>}
        {historyError && <div className="mt-2">
          <p role="alert" className="text-sm text-rose-300">Unable to load report history.</p>
          <button type="button" className={`mt-2 ${action}`} disabled={busy}
            onClick={() => void run(refreshHistory)}>Retry report history</button>
        </div>}
        {history?.nextCursor && <button type="button" className={`mt-2 ${action}`} disabled={busy}
          onClick={() => void run(async () => {
            const page = await apiClient.getBusinessReportHistory(undefined, history.nextCursor ?? undefined);
            setHistory({ ...page, records: [...history.records, ...page.records] });
          })}>Load older reports</button>}
      </section>
    </div>
    {busy && <p role="status" className="text-sm text-slate-300">Working on the report…</p>}
    {notice && <p role="status" className="text-sm text-slate-300">{notice}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {record && <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={action} disabled={busy} onClick={download}><Download className="h-4 w-4" aria-hidden />Download CSV</button>
        <button type="button" className={action} disabled={busy} onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print or save PDF</button>
        {record.origin !== 'gemini' && history?.geminiAvailable && (
          <button type="button" className={action} disabled={busy} onClick={interpret}><Sparkles className="h-4 w-4" aria-hidden />Request Gemini interpretation</button>
        )}
      </div>
      {record.origin !== 'gemini' && history && !history.geminiAvailable && <p className="text-xs text-slate-400">
        Gemini interpretations are unavailable in this environment. The deterministic report and exports are ready.
      </p>}
      <BusinessReportDocument report={record} onNavigate={onNavigate} onOpenLead={onOpenLead} />
    </>}
  </div>;
}
