import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { AnalyticsData } from '../types';
import { formatQuoteAmount } from '../utils/salesConversion';
import { channelLabels, responseLabels } from '../utils/engagement';
import { BarChart3, TrendingUp, Globe2, Award, Send, Users } from 'lucide-react';

interface AnalyticsPageProps {
  analytics: AnalyticsData | null;
}

const REGION_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#64748b'];

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ analytics }) => {
  const summary = analytics?.summary || {
    totalLeads: 0,
    newLeads: 0,
    highPriorityLeads: 0,
    contactedLeads: 0,
    repliesReceived: 0,
    meetingsBooked: 0,
    dealsWon: 0,
    qualifiedLeads: 0,
    winRatePercentage: 0,
  };

  const regionData = (analytics?.regionDistribution || []).filter((r) => r.count > 0);
  const funnelData = analytics?.leadConversionChart || [];
  const serviceData = analytics?.serviceBreakdown || [];
  const outreach = analytics?.outreachMetrics || {
    totalGenerated: 0,
    sent: 0,
    replied: 0,
    converted: 0,
    replyRatePercentage: 0,
  };

  const hasData = summary.totalLeads > 0;
  const sales = analytics?.salesPerformance;
  const engagement = analytics?.engagementPerformance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-white tracking-tight">All-time analytics</h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Workspace totals and recent activity across all dates.
        </p>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Total Leads</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">{summary.totalLeads}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Qualified Leads</span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">{summary.qualifiedLeads}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Pitches Sent</span>
            <Send className="h-4 w-4 text-violet-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">{outreach.sent}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            {outreach.sent > 0
              ? `${outreach.replied} replied (${outreach.replyRatePercentage ?? 0}% response rate)`
              : 'No recorded deliveries'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Deals Closed Won</span>
            <Award className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">{summary.dealsWon}</div>
          <div className="mt-1 text-[11px] text-emerald-400">
            {sales && sales.won + sales.lost > 0 ? `${summary.winRatePercentage}% of closed leads` : 'No closed leads'}
          </div>
        </div>
      </div>

      {sales && <section className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5" aria-labelledby="sales-performance">
        <h2 id="sales-performance" className="mb-4 text-sm font-bold text-white">Sales performance</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1 text-xs text-slate-400">
            <h3 className="font-semibold text-slate-200">Closed leads</h3>
            <p>{sales.won} won · {sales.lost} lost</p>
          </div>
          <div className="space-y-1 text-xs text-slate-400">
            <h3 className="font-semibold text-slate-200">Proposals</h3>
            <p>{sales.proposals.drafts} drafts · {sales.proposals.sent} delivered · {sales.proposals.accepted} accepted</p>
            {sales.proposals.totals.map(({ currency, quotedMinor, acceptedMinor }) => (
              <p key={currency}>{currency} · {formatQuoteAmount(currency, quotedMinor)} quoted · {formatQuoteAmount(currency, acceptedMinor)} accepted</p>
            ))}
          </div>
          <div className="space-y-1 text-xs text-slate-400">
            <h3 className="font-semibold text-slate-200">Follow-ups</h3>
            <p>{sales.followUps.pending} pending · {sales.followUps.due} due</p>
            <p>{sales.followUps.completed} completed · {sales.followUps.cancelled} cancelled</p>
          </div>
        </div>
      </section>}

      {engagement && <section className="space-y-3 rounded-2xl border border-slate-800 bg-navy-900/60 p-5" aria-labelledby="engagement-performance">
        <h2 id="engagement-performance" className="text-sm font-bold text-white">Outreach performance</h2>
        <p className="text-xs text-slate-400">Delivered and replied counts come from manually recorded events. Replies count the distinct delivered drafts with a recorded response.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-xs text-slate-300">
            <thead><tr className="border-b border-slate-800 text-slate-400">
              {['Channel or campaign', 'Drafts', 'Delivered', 'Replied', 'Won'].map((column) => <th className="p-2" scope="col" key={column}>{column}</th>)}
            </tr></thead>
            <tbody>
              {[...engagement.channels.map((row) => ({ ...row, label: channelLabels[row.id] })),
                ...engagement.campaigns.map((row) => ({ ...row, label: row.name + (row.archivedAt ? ' (archived)' : '') }))].map((row) => (
                <tr className="border-b border-slate-800/70" key={row.id}>
                  <th className="p-2 font-semibold text-white" scope="row">{row.label}</th>
                  <td className="p-2">{row.drafts}</td><td className="p-2">{row.delivered}</td>
                  <td className="p-2">{row.replied}</td><td className="p-2">{row.won}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-300">
          {engagement.objections.length
            ? engagement.objections.map(({ kind, count }) => `${responseLabels[kind]} (${count})`).join(' · ')
            : 'Zero recorded objections or opt-out responses.'}
        </p>
      </section>}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Stage Funnel Chart */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Current Pipeline Stages
            </h3>
            <span className="text-[10px] text-slate-500">Leads by stage</span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {!hasData ? (
              <div className="text-xs text-slate-500 text-center">
                No leads recorded. Saved CRM leads populate the stage chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#162238" vertical={false} />
                  <XAxis
                    dataKey="stage"
                    stroke="#64748b"
                    fontSize={10}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0a101f',
                      borderColor: '#243656',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Regional Distribution Pie Chart */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              CRM Leads by Country
            </h3>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {regionData.length === 0 ? (
              <div className="text-xs text-slate-500 text-center">
                No countries are recorded on CRM leads.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={regionData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={4}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {regionData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={REGION_COLORS[index % REGION_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0a101f',
                      borderColor: '#243656',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Service Demand Breakdown */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Suggested Services on CRM Leads
            </h3>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {!hasData ? (
              <div className="text-xs text-slate-500 text-center">
                No suggested services are recorded.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={serviceData}
                  margin={{ top: 10, right: 20, left: 100, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#162238" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={10} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="service"
                    stroke="#94a3b8"
                    fontSize={11}
                    width={160}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0a101f',
                      borderColor: '#243656',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      {Boolean(analytics?.recentActivity?.length) && <section className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5">
        <h2 className="text-sm font-bold text-white">Recent workspace activity</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {analytics?.recentActivity?.map((item) => <li key={item.id} className="rounded-lg border border-slate-800 p-3">
            <p>{item.description}</p>
            <time dateTime={item.createdAt} className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</time>
          </li>)}
        </ul>
      </section>}
    </div>
  );
};
