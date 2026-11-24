import { LEAD_STATUSES } from '../utils/crmDiscovery';
import React, { useState, useMemo, useEffect } from 'react';
import {
  KanbanSquare,
  List,
  Search,
  Plus,
  Zap,
  Send,
  Trash2,
  Filter,
  Download,
  Upload,
  ArrowUpDown,
  RefreshCw,
  Eye,
  Edit,
  ExternalLink,
} from 'lucide-react';
import { Lead, LeadStatus } from '../types';
import { Badge } from '../components/Badge';
import { LeadTable } from '../components/LeadTable';
import { LeadDetailModal } from '../components/LeadDetailModal';
import { LeadEditModal } from '../components/LeadEditModal';
import { CsvImportModal } from '../components/CsvImportModal';
import { apiClient } from '../api/client';
import { initialDiscoveryFilters, matchesDiscoveryFilters, websiteStatusLabels } from '../utils/crmDiscovery';

interface CrmPageProps {
  leads: Lead[];
  notificationLeadId: string;
  onClearNotificationLead: () => void;
  onRefreshLeads: () => void;
  onOpenNewLead: () => void;
  onAuditLead: (lead: Lead) => void;
  onPitchLead: (lead: Lead) => void;
  onQuoteLead: (lead: Lead) => void;
  onFollowUpLead: (lead: Lead) => void;
  onEngagementLead: (lead: Lead) => void;
}

const ALL_STATUSES = LEAD_STATUSES;

export const CrmPage: React.FC<CrmPageProps> = ({
  leads,
  notificationLeadId,
  onClearNotificationLead,
  onRefreshLeads,
  onOpenNewLead,
  onAuditLead,
  onPitchLead,
  onQuoteLead,
  onFollowUpLead,
  onEngagementLead,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('ALL');
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [sortScoreOrder, setSortScoreOrder] = useState<'desc' | 'asc'>('desc');
  const [discoveryFilters, setDiscoveryFilters] = useState(initialDiscoveryFilters);

  // Modals state
  const [selectedLeadForDetail, setSelectedLeadForDetail] = useState<Lead | null>(null);
  const [selectedLeadForEdit, setSelectedLeadForEdit] = useState<Lead | null>(null);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!notificationLeadId) return;
    let active = true;
    apiClient.getLeadById(notificationLeadId).then((lead) => {
      if (active) setSelectedLeadForDetail(lead);
    }).catch((error: Error) => {
      if (active) alert(error.message);
    }).finally(() => {
      if (active) onClearNotificationLead();
    });
    return () => { active = false; };
  }, [notificationLeadId, onClearNotificationLead]);

  // Dynamic filter lists from existing leads
  const distinctCountries = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.country).filter(Boolean) as string[])).sort();
  }, [leads]);

  const distinctIndustries = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.industry).filter(Boolean) as string[])).sort();
  }, [leads]);
  const distinctCities = useMemo(() => Array.from(new Set(leads.flatMap((lead) => lead.city ? [lead.city] : []))).sort(), [leads]);
  const distinctSources = useMemo(() => Array.from(new Set(leads.flatMap((lead) => lead.discoverySources?.length
    ? lead.discoverySources.map((entry) => entry.providerId) : [lead.source]))).sort(), [leads]);

  const distinctServices = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => {
      (l.suggestedServices || l.services || []).forEach((srv) => s.add(srv));
      if (l.suggestedService) s.add(l.suggestedService);
    });
    return Array.from(s).sort();
  }, [leads]);

  // Filtering & Sorting
  const filteredAndSortedLeads = useMemo(() => {
    let result = leads.filter((lead) => {
      if (!matchesDiscoveryFilters(lead, discoveryFilters)) return false;
      // 1. Country filter
      if (selectedCountry !== 'ALL') {
        if ((lead.country || '').toLowerCase() !== selectedCountry.toLowerCase()) return false;
      }

      // 2. Industry filter
      if (selectedIndustry !== 'ALL') {
        if ((lead.industry || '').toLowerCase() !== selectedIndustry.toLowerCase()) return false;
      }

      // 3. Status filter
      if (selectedStatus !== 'ALL') {
        const leadSt = lead.leadStatus || (lead as any).status;
        const targetSt = selectedStatus;
        if (leadSt !== targetSt && leadSt !== targetSt.replace(/\s+/g, '_')) return false;
      }

      // 4. Service filter
      if (selectedService !== 'ALL') {
        const servicesList = [
          ...(lead.suggestedServices || []),
          ...(lead.services || []),
          lead.suggestedService,
        ].filter(Boolean);
        const matches = servicesList.some(
          (s) => s?.toLowerCase() === selectedService.toLowerCase()
        );
        if (!matches) return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const businessName = (lead.businessName || (lead as any).companyName || '').toLowerCase();
        const website = (lead.website || lead.websiteUrl || '').toLowerCase();
        const contactName = (lead.contactName || '').toLowerCase();
        const email = (lead.businessEmail || (lead as any).contactEmail || '').toLowerCase();
        const city = (lead.city || '').toLowerCase();
        const country = (lead.country || '').toLowerCase();
        const industry = (lead.industry || '').toLowerCase();

        const match =
          businessName.includes(q) ||
          website.includes(q) ||
          contactName.includes(q) ||
          email.includes(q) ||
          city.includes(q) ||
          country.includes(q) ||
          industry.includes(q);

        if (!match) return false;
      }

      return true;
    });

    // Sort by opportunity score
    result.sort((a, b) => {
      const scoreA = a.opportunityScore ?? 70;
      const scoreB = b.opportunityScore ?? 70;
      return sortScoreOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
    });

    return result;
  }, [
    leads,
    selectedCountry,
    selectedIndustry,
    selectedService,
    selectedStatus,
    searchQuery,
    sortScoreOrder,
    discoveryFilters,
  ]);

  function viewLead(lead: Lead) {
    setSelectedLeadForDetail(lead);
    void apiClient.getLeadById(lead.id).then((detail) => {
      setSelectedLeadForDetail((current) => current?.id === detail.id ? detail : current);
    }).catch(() => {});
  }

  const toggleScoreSort = () => {
    setSortScoreOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  const handleUpdateStatus = async (leadId: string, nextStatus: LeadStatus) => {
    try {
      await apiClient.updateLead(leadId, { leadStatus: nextStatus });
      onRefreshLeads();
      if (selectedLeadForDetail && selectedLeadForDetail.id === leadId) {
        setSelectedLeadForDetail((prev) => (prev ? { ...prev, leadStatus: nextStatus } : null));
      }
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    try {
      await apiClient.deleteLead(leadId);
      onRefreshLeads();
      if (selectedLeadForDetail && selectedLeadForDetail.id === leadId) {
        setSelectedLeadForDetail(null);
      }
    } catch (err: any) {
      alert(`Failed to delete lead: ${err.message}`);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const csv = await apiClient.exportLeadsCsv();
      const url = URL.createObjectURL(csv);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'leads.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to export leads.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white tracking-tight">Leads & Pipeline CRM</h1>
            <span className="rounded-full bg-electric-500/10 px-2.5 py-0.5 text-xs font-bold text-electric-400 border border-electric-500/30">
              {filteredAndSortedLeads.length} Leads
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real PostgreSQL-backed lead management system with duplicate detection, CSV import/export, and full lifecycle tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* CSV Export */}
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            title="Export Leads to CSV"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition"
          >
            <Download className="h-3.5 w-3.5 text-electric-400" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          {/* CSV Import */}
          <button
            onClick={() => setIsCsvImportOpen(true)}
            title="Import Leads from CSV"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition"
          >
            <Upload className="h-3.5 w-3.5 text-violet-400" />
            <span>Import CSV</span>
          </button>

          {/* View Mode Switcher */}
          <div className="flex items-center rounded-xl bg-navy-900 border border-slate-800 p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'table'
                  ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'kanban'
                  ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KanbanSquare className="h-3.5 w-3.5" />
              <span>Board</span>
            </button>
          </div>

          {/* Add Lead */}
          <button
            onClick={onOpenNewLead}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 hover:opacity-95 text-white px-3.5 py-2 text-xs font-bold transition shadow-glow-blue"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-navy-900/60 border border-slate-800/80 p-3.5 rounded-2xl">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by business name, website, email, contact..."
            className="w-full rounded-xl border border-slate-700 bg-navy-950 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-electric-500 focus:outline-none"
          />
        </div>

        {/* Country Filter */}
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="rounded-xl border border-slate-700 bg-navy-950 px-3 py-1.5 text-xs text-white focus:border-electric-500 focus:outline-none"
        >
          <option value="ALL">All Countries</option>
          <option value="India">India</option>
          <option value="United States">United States</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="Germany">Germany</option>
          {distinctCountries
            .filter((c) => !['India', 'United States', 'United Kingdom', 'Germany'].includes(c))
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>

        {/* Industry Filter */}
        <select
          value={selectedIndustry}
          onChange={(e) => setSelectedIndustry(e.target.value)}
          className="rounded-xl border border-slate-700 bg-navy-950 px-3 py-1.5 text-xs text-white focus:border-electric-500 focus:outline-none"
        >
          <option value="ALL">All Industries</option>
          {distinctIndustries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>

        {/* Suggested Service Filter */}
        <select
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
          className="rounded-xl border border-slate-700 bg-navy-950 px-3 py-1.5 text-xs text-white focus:border-electric-500 focus:outline-none"
        >
          <option value="ALL">All Services</option>
          <option value="Business website">Business websites</option>
          <option value="E-commerce website">E-commerce websites</option>
          <option value="React Native mobile application">React Native apps</option>
          <option value="Admin dashboard">Admin dashboards</option>
          <option value="Backend API development">Backend APIs</option>
          <option value="AI application and integration">AI integrations</option>
          {distinctServices
            .filter(
              (s) =>
                ![
                  'Business website',
                  'E-commerce website',
                  'React Native mobile application',
                  'Admin dashboard',
                  'Backend API development',
                  'AI application and integration',
                ].includes(s)
            )
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="rounded-xl border border-slate-700 bg-navy-950 px-3 py-1.5 text-xs text-white focus:border-electric-500 focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          {ALL_STATUSES.map((st) => (
            <option key={st.key} value={st.key}>
              {st.label}
            </option>
          ))}
        </select>

        {/* Sort by Score Toggle */}
        <div className="flex basis-full flex-wrap gap-2">
          {([
            ['city', 'City', distinctCities.map((city) => [city, city])],
            ['provider', 'Discovery source', distinctSources.map((source) => [source, source.replace(/_/g, ' ')])],
            ['website', 'Website status', Object.entries(websiteStatusLabels)],
            ['qualification', 'Qualification', [['QUALIFIED', 'Qualified'], ['UNASSESSED', 'Unassessed']]],
          ] as const).map(([key, label, options]) => <label key={key} className="text-[11px] text-slate-400">
            <span className="mb-1 block">{label}</span>
            <select className="max-w-48 rounded-lg border border-slate-700 bg-navy-950 px-2 py-1.5 text-xs text-white"
              value={discoveryFilters[key]} onChange={(event) => setDiscoveryFilters({ ...discoveryFilters, [key]: event.target.value })}>
              <option value="">Any</option>
              {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>)}
          <label className="text-[11px] text-slate-400">
            <span className="mb-1 block">Minimum lead score</span>
            <input type="number" min="0" max="100" className="w-24 rounded-lg border border-slate-700 bg-navy-950 px-2 py-1.5 text-xs text-white"
              value={discoveryFilters.score} onChange={(event) => setDiscoveryFilters({ ...discoveryFilters, score: event.target.value })} />
          </label>
          <label className="text-[11px] text-slate-400">
            <span className="mb-1 block">Discovered on or after (UTC)</span>
            <input type="date" className="rounded-lg border border-slate-700 bg-navy-950 px-2 py-1.5 text-xs text-white"
              value={discoveryFilters.discoveredAfter} onChange={(event) => setDiscoveryFilters({ ...discoveryFilters, discoveredAfter: event.target.value })} />
          </label>
        </div>

        <button
          onClick={toggleScoreSort}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-950 border border-slate-700 hover:border-slate-600 text-xs font-semibold text-slate-300 transition"
          title={`Sort by Opportunity Score (${sortScoreOrder === 'desc' ? 'Highest first' : 'Lowest first'})`}
        >
          <ArrowUpDown className="h-3.5 w-3.5 text-electric-400" />
          <span>Score: {sortScoreOrder === 'desc' ? 'High → Low' : 'Low → High'}</span>
        </button>

        {/* Reset filters */}
        {(selectedCountry !== 'ALL' ||
          selectedIndustry !== 'ALL' ||
          selectedService !== 'ALL' ||
          selectedStatus !== 'ALL' ||
          searchQuery || Object.values(discoveryFilters).some(Boolean)) && (
          <button
            onClick={() => {
              setSelectedCountry('ALL');
              setSelectedIndustry('ALL');
              setSelectedService('ALL');
              setSelectedStatus('ALL');
              setSearchQuery('');
              setDiscoveryFilters(initialDiscoveryFilters);
            }}
            className="text-xs text-slate-400 hover:text-white underline px-1"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* TABLE VIEW (Default) */}
      {viewMode === 'table' ? (
        <LeadTable
          leads={filteredAndSortedLeads}
          onViewDetails={viewLead}
          onEditLead={(lead) => setSelectedLeadForEdit(lead)}
          onAnalyze={onAuditLead}
          onPitch={onPitchLead}
          onUpdateStatus={handleUpdateStatus}
          onDelete={handleDeleteLead}
          onSortByScore={toggleScoreSort}
          sortScoreOrder={sortScoreOrder}
          emptyTitle="No leads matching criteria"
          emptyDescription="Try clearing filters, importing leads from CSV, or adding a new lead manually."
          onActionClick={onOpenNewLead}
        />
      ) : (
        /* KANBAN BOARD VIEW */
        <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-[550px]">
          {ALL_STATUSES.map((stage) => {
            const stageLeads = filteredAndSortedLeads.filter((l) => {
              const st = l.leadStatus || (l as any).status;
              return st === stage.key || st === stage.label;
            });

            return (
              <div
                key={stage.key}
                className="w-72 shrink-0 rounded-2xl border border-slate-800 bg-navy-900/40 p-3 space-y-3"
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">{stage.label}</span>
                    <span className="rounded-md bg-navy-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="space-y-3 min-h-[150px]">
                  {stageLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800/80 p-4 text-center text-[11px] text-slate-600">
                      No leads in this stage
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const name = lead.businessName || (lead as any).companyName;
                      const score = lead.opportunityScore ?? 70;
                      return (
                        <div
                          key={lead.id}
                          className="rounded-xl border border-slate-800 bg-navy-950/80 p-3.5 hover:border-slate-700 transition shadow-sm space-y-2.5 cursor-pointer"
                          onClick={() => viewLead(lead)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-white leading-snug hover:text-electric-300 transition">
                                {name}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {lead.country || 'Global'} {lead.city ? `• ${lead.city}` : ''}
                              </div>
                            </div>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                score >= 85
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-navy-900 text-slate-300'
                              }`}
                            >
                              {score}%
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 line-clamp-1">
                            {lead.industry}
                          </div>

                          {/* Suggested Service Badge */}
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500">Service:</span>
                            <span className="font-medium text-slate-300 truncate max-w-[130px]">
                              {lead.suggestedServices?.[0] || lead.suggestedService || 'Web Platform'}
                            </span>
                          </div>

                          {/* Actions & Stage Move */}
                          <div
                            className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => viewLead(lead)}
                                title="View Details"
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-navy-800 transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setSelectedLeadForEdit(lead)}
                                title="Edit Lead"
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-navy-800 transition"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onAuditLead(lead)}
                                title="Analyze Website"
                                className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-navy-800 transition"
                              >
                                <Zap className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onPitchLead(lead)}
                                title="Generate Pitch"
                                className="p-1 rounded text-slate-400 hover:text-violet-400 hover:bg-navy-800 transition"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Move stage dropdown */}
                            <select
                              value={lead.leadStatus || (lead as any).status || stage.key}
                              onChange={(e) =>
                                handleUpdateStatus(lead.id, e.target.value as LeadStatus)
                              }
                              className="rounded bg-navy-900 border border-slate-700 text-[10px] text-slate-300 py-0.5 px-1.5 focus:outline-none"
                            >
                              {ALL_STATUSES.map((st) => (
                                <option key={st.key} value={st.key}>
                                  {st.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lead Details Modal */}
      <LeadDetailModal
        isOpen={!!selectedLeadForDetail}
        lead={selectedLeadForDetail}
        onClose={() => setSelectedLeadForDetail(null)}
        onEdit={(lead) => {
          setSelectedLeadForDetail(null);
          setSelectedLeadForEdit(lead);
        }}
        onAnalyze={onAuditLead}
        onPitch={onPitchLead}
        onQuote={onQuoteLead}
        onFollowUp={onFollowUpLead}
        onEngagement={onEngagementLead}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Lead Edit Modal */}
      <LeadEditModal
        isOpen={!!selectedLeadForEdit}
        lead={selectedLeadForEdit}
        onClose={() => setSelectedLeadForEdit(null)}
        onLeadUpdated={() => {
          onRefreshLeads();
          setSelectedLeadForEdit(null);
        }}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
        onImportComplete={() => {
          onRefreshLeads();
        }}
      />
    </div>
  );
};
