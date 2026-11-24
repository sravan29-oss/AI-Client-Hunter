import { LEAD_STATUSES, websiteStatusLabels } from '../utils/crmDiscovery';
import React, { useState } from 'react';
import {
  ExternalLink,
  Zap,
  Send,
  Trash2,
  Globe2,
  Users,
  Eye,
  Edit,
  ArrowUpDown,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Lead, LeadStatus } from '../types';
import { Badge } from './Badge';

interface LeadTableProps {
  leads: Lead[];
  loading?: boolean;
  onViewDetails?: (lead: Lead) => void;
  onEditLead?: (lead: Lead) => void;
  onAnalyze: (lead: Lead) => void;
  onPitch: (lead: Lead) => void;
  onUpdateStatus?: (leadId: string, status: LeadStatus) => void;
  onDelete?: (leadId: string) => void;
  onSortByScore?: () => void;
  sortScoreOrder?: 'asc' | 'desc';
  emptyTitle?: string;
  emptyDescription?: string;
  onActionClick?: () => void;
}

const ALL_STATUSES = LEAD_STATUSES;

export const LeadTable: React.FC<LeadTableProps> = ({
  leads,
  loading = false,
  onViewDetails,
  onEditLead,
  onAnalyze,
  onPitch,
  onUpdateStatus,
  onDelete,
  onSortByScore,
  sortScoreOrder,
  emptyTitle = 'No leads found',
  emptyDescription = 'Add a lead manually, import via CSV, or discover prospects using AI Client Hunter.',
  onActionClick,
}) => {
  // Delete confirmation state
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-6 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 w-full rounded-xl bg-slate-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-navy-900/40 p-12 text-center flex flex-col items-center justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-electric-500/20 to-violet-500/20 border border-electric-500/30 text-electric-400 mb-3 shadow-glow-blue">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">{emptyTitle}</h3>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">{emptyDescription}</p>
        {onActionClick && (
          <button
            onClick={onActionClick}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-glow-blue hover:opacity-95 transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Discover Prospects</span>
          </button>
        )}
      </div>
    );
  }

  const confirmDelete = () => {
    if (leadToDelete && onDelete) {
      onDelete(leadToDelete.id);
      setLeadToDelete(null);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-800 bg-navy-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-navy-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-3.5 px-4">Business Name</th>
                <th className="py-3.5 px-4">Country</th>
                <th className="py-3.5 px-4">Industry</th>
                <th className="py-3.5 px-4">Website</th>
                <th className="py-3.5 px-4 text-center">
                  <button
                    onClick={onSortByScore}
                    className="inline-flex items-center gap-1 hover:text-white uppercase font-semibold transition"
                    title="Sort by Opportunity Score"
                  >
                    <span>Opportunity Score</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                    {sortScoreOrder && (
                      <span className="text-electric-400 text-[9px]">({sortScoreOrder.toUpperCase()})</span>
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">Suggested Service</th>
                <th className="py-3.5 px-4">Lead Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {leads.map((lead) => {
                const name = lead.businessName || (lead as any).companyName || 'Unnamed Business';
                const websiteUrl = lead.website || lead.websiteUrl || '';
                const cleanUrl = websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                const score = lead.opportunityScore ?? 70;
                const currentStatus = (lead.leadStatus || (lead as any).status || 'New') as LeadStatus;
                const firstService =
                  lead.suggestedServices?.[0] ||
                  lead.suggestedService ||
                  lead.services?.[0] ||
                  'Business website';

                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-navy-850/50 transition-colors group cursor-pointer"
                    onClick={() => onViewDetails && onViewDetails(lead)}
                  >
                    {/* 1. Business Name */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-800 border border-slate-700/80 text-electric-300 font-bold text-xs shrink-0">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div
                            onClick={() => onViewDetails && onViewDetails(lead)}
                            className="font-bold text-white hover:text-electric-300 transition-colors cursor-pointer"
                          >
                            {name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            {lead.contactName && <span>{lead.contactName}</span>}
                            {lead.contactName && lead.city && <span>•</span>}
                            {lead.city && <span>{lead.city}</span>}
                          </div>
                          {lead.discoveryEvidence && <p className="max-w-52 truncate text-[10px] text-slate-400" title={lead.source}>
                            {lead.source}{lead.discoveryDate && ` · ${new Date(lead.discoveryDate).toLocaleDateString()}`}
                          </p>}
                        </div>
                      </div>
                    </td>

                    {/* 2. Country */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="region"
                          value={(lead.country || '').toLowerCase() === 'india' ? 'INDIA' : 'US'}
                          size="xs"
                        >
                          {lead.country || 'Global'}
                        </Badge>
                      </div>
                    </td>

                    {/* 3. Industry */}
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="line-clamp-1">{lead.industry}</span>
                    </td>

                    {/* 4. Website */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {websiteUrl ? (
                        <a
                          href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-electric-400 hover:text-electric-300 hover:underline max-w-[140px] truncate"
                        >
                          <Globe2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{cleanUrl}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                        </a>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">N/A</span>
                      )}
                      {lead.websiteAnalysisStatus && <p className="mt-1 text-[10px] text-slate-400">{websiteStatusLabels[lead.websiteAnalysisStatus]}</p>}
                    </td>

                    {/* 5. Opportunity Score */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 justify-center">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            score >= 85
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                              : score >= 70
                              ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.7)]'
                              : 'bg-amber-400'
                          }`}
                        />
                        <span className="font-extrabold text-xs text-slate-200">{score}%</span>
                      </div>
                    </td>

                    {/* 6. Suggested Service */}
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-navy-950 border border-slate-800 text-[11px] text-slate-300 truncate max-w-[150px]">
                        {firstService}
                      </span>
                    </td>

                    {/* 7. Lead Status (Tracking) */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      {onUpdateStatus ? (
                        <select
                          value={currentStatus}
                          onChange={(e) => onUpdateStatus(lead.id, e.target.value as LeadStatus)}
                          className="rounded-lg bg-navy-950 border border-slate-700/80 text-[11px] font-medium text-slate-200 py-1 px-2 focus:outline-none focus:border-electric-500 cursor-pointer"
                        >
                          {ALL_STATUSES.map((st) => (
                            <option key={st.key} value={st.key}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant="status" value={currentStatus} size="xs">
                          {currentStatus.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </td>

                    {/* 8. Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {onViewDetails && (
                          <button
                            onClick={() => onViewDetails(lead)}
                            title="View Lead Details"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {onEditLead && (
                          <button
                            onClick={() => onEditLead(lead)}
                            title="Edit Lead Information"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => onAnalyze(lead)}
                          title="Run Technical Website Audit"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => onPitch(lead)}
                          title="Draft AI Outreach Pitch"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-800 transition"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>

                        {onDelete && (
                          <button
                            onClick={() => setLeadToDelete(lead)}
                            title="Delete Lead"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {leadToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-navy-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Lead</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Are you sure you want to permanently delete{' '}
                  <span className="font-semibold text-white">
                    {leadToDelete.businessName || (leadToDelete as any).companyName}
                  </span>
                  ? This will also remove associated audits and generated pitches.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setLeadToDelete(null)}
                className="px-4 py-2 rounded-xl bg-navy-950 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
