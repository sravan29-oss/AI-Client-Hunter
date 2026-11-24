import React from 'react';
import { Award, ChevronRight, Clock, Send, Sparkles, Zap } from 'lucide-react';
import type { Lead } from '../types';
import type { GrowthSelection } from '../types/businessGrowth';
import type { SidebarTab } from '../components/Sidebar';
import { Badge } from '../components/Badge';
import { BusinessIntelligence } from '../components/BusinessIntelligence';
import { LeadTable } from '../components/LeadTable';

interface DashboardPageProps {
  selection: GrowthSelection;
  onSelection: (selection: GrowthSelection) => void;
  revision: number;
  onOpenBusinessIntelligence: () => void;
  leads: Lead[];
  onNavigate: (tab: SidebarTab) => void;
  onAuditLead: (lead: Lead) => void;
  onPitchLead: (lead: Lead) => void;
  onOpenNewLead: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  selection,
  onSelection,
  revision,
  onOpenBusinessIntelligence,
  leads,
  onNavigate,
  onAuditLead,
  onPitchLead,
  onOpenNewLead,
}) => {
  const recentLeads = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const topOpportunities = leads.filter((lead) => !['Won', 'Lost'].includes(lead.leadStatus))
    .sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5);

  return (
    <div className="space-y-7">
      {/* Top Banner & Quick Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Overview
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Open your lead workspace and review business performance.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('find-clients')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold shadow-glow-blue hover:opacity-95 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Find Clients</span>
          </button>

          <button
            onClick={() => onNavigate('analyzer')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-900 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-semibold transition"
          >
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
            <span>Analyze Website</span>
          </button>

          <button
            onClick={() => onNavigate('outreach')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-900 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-semibold transition"
          >
            <Send className="h-3.5 w-3.5 text-violet-400" />
            <span>Draft AI Outreach</span>
          </button>

          <button
            onClick={() => onNavigate('followups')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-900 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-semibold transition"
          >
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span>View Follow-ups</span>
          </button>
        </div>
      </div>

      <BusinessIntelligence compact selection={selection} onSelection={onSelection} revision={revision}
        onNavigate={onNavigate} onAlternate={onOpenBusinessIntelligence} />

      {/* RECENT LEADS TABLE (Required Component) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Recent Leads</h2>
            <p className="text-xs text-slate-400">Latest entries across the workspace</p>
          </div>
          <button
            onClick={() => onNavigate('leads')}
            className="flex items-center gap-1 text-xs font-semibold text-electric-400 hover:text-electric-300 transition"
          >
            <span>View All Leads</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <LeadTable
          leads={recentLeads}
          onAnalyze={onAuditLead}
          onPitch={onPitchLead}
          emptyTitle="No leads in pipeline yet"
          emptyDescription="Start your acquisition engine by scanning high-value Indian or International prospects."
          onActionClick={() => onNavigate('find-clients')}
        />
      </div>

      {/* BOTTOM ROW: Top Opportunities & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Opportunities */}
        <div className="lg:col-span-12 rounded-2xl border border-slate-800 bg-navy-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Top High-Score Opportunities
              </h3>
              <p className="text-[11px] text-slate-500">Workspace leads ranked by stored opportunity score</p>
            </div>
            <Award className="h-4 w-4 text-violet-400" />
          </div>

          {topOpportunities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
              Zero active opportunities. Use Find Clients to import prospects.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topOpportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="rounded-xl border border-slate-800/80 bg-navy-950/80 p-3.5 hover:border-slate-700 transition flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white text-xs truncate max-w-[130px]">
                        {opp.businessName || opp.companyName}
                      </div>
                      <Badge variant="score" value={opp.opportunityScore} size="xs">
                        {opp.opportunityScore}%
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>{opp.industry}</span>
                      <span>•</span>
                      <span>{opp.city || opp.country || 'Global'}</span>
                    </div>

                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-400 line-clamp-1">
                      {opp.suggestedServices?.[0] || opp.suggestedService || opp.services?.[0] || 'Service to review'}
                    </span>
                    <button
                      onClick={() => onPitchLead(opp)}
                      className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition"
                    >
                      Draft Pitch →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
