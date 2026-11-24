import React, { useState, useEffect } from 'react';
import { DraftActions } from '../components/DraftActions';
import {
  Send,
  Sparkles,
  Check,
  Mail,
  Linkedin,
  Instagram,
  FileText,
  Clock,
  Loader2,
  Edit3,
  Save,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  History,
  Building2,
  Globe,
  ExternalLink,
  Eye,
  Compass,
  ArrowRight,
  MessageSquare,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { Lead, Pitch, OutreachMessageType, Region } from '../types';
import type { OutreachCampaign } from '../types/engagement';
import { apiClient } from '../api/client';
import { Badge } from '../components/Badge';

interface PitchStudioPageProps {
  initialLead?: Lead | null;
  campaign?: OutreachCampaign | null;
  initialPitchId?: string;
  leads: Lead[];
  onPitchUpdated: () => void;
}

const MESSAGE_TYPES: Array<{
  id: OutreachMessageType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  charLimit?: number;
}> = [
  {
    id: 'COLD_EMAIL',
    label: 'Cold Email',
    icon: Mail,
    description: 'High-converting structured cold email with subject line',
  },
  {
    id: 'WHATSAPP_MESSAGE',
    label: 'WhatsApp message',
    icon: MessageSquare,
    description: 'Short, personalized conversation starter',
  },
  {
    id: 'LINKEDIN_CONNECT',
    label: 'LinkedIn Connect',
    icon: Linkedin,
    description: 'Concise connection invite note (under 300 characters)',
    charLimit: 300,
  },
  {
    id: 'LINKEDIN_FOLLOWUP',
    label: 'LinkedIn Follow-up',
    icon: Linkedin,
    description: 'Low-pressure follow-up for 1st-degree connections',
  },
  {
    id: 'INSTAGRAM_DM',
    label: 'Instagram DM',
    icon: Instagram,
    description: 'Friendly, natural direct message for business accounts',
  },
  {
    id: 'FREELANCE_PROPOSAL',
    label: 'Freelance Proposal',
    icon: FileText,
    description: 'Structured proposal with deliverables & tech stack depth',
  },
  {
    id: 'PROJECT_INTRO',
    label: 'Project Introduction',
    icon: Compass,
    description: 'Strategic executive technical brief for stakeholders',
  },
  {
    id: 'FOLLOW_UP',
    label: 'Follow-up Message',
    icon: Clock,
    description: 'Polite, value-first follow-up on a previous touchpoint',
  },
];

const AVAILABLE_SERVICES = [
  'Business website',
  'E-commerce website',
  'React Native mobile application',
  'Admin dashboard',
  'Backend API development',
  'AI application and integration',
];

const TONE_OPTIONS = [
  { id: 'professional_friendly', label: 'Professional & Natural (Recommended)' },
  { id: 'value_roi', label: 'Value & ROI Focused' },
  { id: 'direct_technical', label: 'Direct & Technical (Peer-to-Peer)' },
  { id: 'conversational_casual', label: 'Warm & Conversational' },
];

export const PitchStudioPage: React.FC<PitchStudioPageProps> = ({
  initialLead,
  campaign,
  initialPitchId,
  leads,
  onPitchUpdated,
}) => {
  const [activeView, setActiveView] = useState<'composer' | 'history'>('composer');

  // Form State
  const [selectedLeadId, setSelectedLeadId] = useState<string>(initialLead?.id || '');
  const [companyName, setCompanyName] = useState<string>(
    initialLead?.businessName || initialLead?.companyName || ''
  );
  const [contactName, setContactName] = useState<string>(initialLead?.contactName || '');
  const [websiteUrl, setWebsiteUrl] = useState<string>(
    initialLead?.website || initialLead?.websiteUrl || ''
  );
  const [industry, setIndustry] = useState<string>(initialLead?.industry || '');
  const [city, setCity] = useState<string>(initialLead?.city || '');
  const [country, setCountry] = useState<string>(initialLead?.country || 'India');
  const [targetRegion, setTargetRegion] = useState<Region>(initialLead?.region || 'INDIA');
  const [targetService, setTargetService] = useState<string>(
    initialLead?.suggestedServices?.[0] || initialLead?.services?.[0] || 'Business website'
  );
  const [messageType, setMessageType] = useState<OutreachMessageType>(campaign?.channel === 'WHATSAPP' ? 'WHATSAPP_MESSAGE' : 'COLD_EMAIL');
  const [tone, setTone] = useState<string>('professional_friendly');
  const [verifiedProblems, setVerifiedProblems] = useState<string[]>(
    initialLead?.detectedProblems || []
  );
  const [auditSummary, setAuditSummary] = useState(initialLead?.audits?.[0]?.summary || '');

  // Execution & Active Draft State
  const [loading, setLoading] = useState<boolean>(false);
  const [activePitch, setActivePitch] = useState<Pitch | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedSubject, setEditedSubject] = useState<string>('');
  const [editedBody, setEditedBody] = useState<string>('');
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  // Outreach History List from Database
  const [historyList, setHistoryList] = useState<Pitch[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('ALL');

  // Selected Lead object
  const selectedLead = selectedLeadId === initialLead?.id
    ? initialLead
    : leads.find((lead) => lead.id === selectedLeadId);

  // Sync form when selectedLeadId or initialLead changes
  useEffect(() => {
    if (selectedLeadId) {
      const lead = selectedLead;
      if (lead) {
        setCompanyName(lead.businessName || lead.companyName || '');
        setContactName(lead.contactName || '');
        setWebsiteUrl(lead.website || lead.websiteUrl || '');
        setIndustry(lead.industry || '');
        setCity(lead.city || '');
        setCountry(lead.country || 'India');
        setTargetRegion(
          (lead.region || ((lead.country || '').toLowerCase() === 'india' ? 'INDIA' : 'US')) as Region
        );
        if (lead.suggestedServices && lead.suggestedServices.length > 0) {
          setTargetService(lead.suggestedServices[0]);
        } else if (lead.services && lead.services.length > 0) {
          setTargetService(lead.services[0]);
        }
        setVerifiedProblems(lead.detectedProblems || []);
        if (lead.audits && lead.audits.length > 0) {
          setAuditSummary(lead.audits[0].summary || '');
        } else {
          setAuditSummary('');
        }
      }
    }
  }, [selectedLeadId, selectedLead]);

  // Sync active pitch to edit inputs
  useEffect(() => {
    if (activePitch) {
      setEditedSubject(activePitch.subject || '');
      setEditedBody(activePitch.body || '');
      setIsEditing(false);
    }
  }, [activePitch]);

  // Load history from PostgreSQL
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const list = (await apiClient.getPitches()).filter((pitch) => !pitch.proposal);
      setHistoryList(list);
    } catch (err) {
      console.error('Failed to load outreach history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!initialPitchId) return;
    let current = true;
    apiClient.getPitch(initialPitchId).then((pitch) => { if (current) setActivePitch(pitch); })
      .catch((error: Error) => { if (current) alert(error.message); });
    return () => { current = false; };
  }, [initialPitchId]);

  // Generate or Regenerate Draft
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!companyName.trim()) return;

    setLoading(true);
    try {
      const generated = await apiClient.generateOutreach({
        leadId: selectedLeadId || undefined,
        campaignId: campaign?.id,
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        industry: industry.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
        targetService,
        targetRegion,
        messageType,
        tone,
        verifiedProblems,
        pitchHooks: selectedLead?.audits?.[0]?.pitchHooks,
        auditSummary: auditSummary.trim() || undefined,
      });

      setActivePitch(generated);
      onPitchUpdated();
      loadHistory();
    } catch (err: any) {
      alert(`Outreach generation failed: ${err.message || 'Please verify connection.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Save Edits to PostgreSQL
  const handleSaveEdits = async () => {
    if (!activePitch) return;
    setSaveLoading(true);
    try {
      const updated = await apiClient.updatePitch(activePitch.id, {
        subject: editedSubject,
        body: editedBody,
        updatedAt: activePitch.updatedAt,
      });
      setActivePitch(updated);
      setIsEditing(false);
      onPitchUpdated();
      loadHistory();
    } catch (err: any) {
      alert(`Failed to save draft edits: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete Outreach History Record
  const handleDeleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this outreach draft from history?')) return;
    try {
      await apiClient.deletePitch(id);
      if (activePitch?.id === id) setActivePitch(null);
      loadHistory();
      onPitchUpdated();
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message}`);
    }
  };

  const filteredHistory = historyList.filter((item) => {
    if (historyFilterStatus === 'ALL') return true;
    return item.status === historyFilterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold text-white">AI Outreach Generator</h1>
              <span className="rounded-md bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Evidence-based drafts
              </span>
              <span className="rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Human Approval Required
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 max-w-2xl">
              Generates personalized outreach tailored to verified business information and website
              audits. Messages are never sent automatically and strictly require manual user review.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('composer')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeView === 'composer'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Composer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('history');
                loadHistory();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeView === 'history'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>History ({historyList.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* COMPOSER VIEW */}
      {activeView === 'composer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Configuration & Verified Lead Context */}
          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleGenerate}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Lead & Outreach Target</span>
                </h2>
                {selectedLead && (
                  <Badge variant="status" value={selectedLead.leadStatus} size="xs">
                    {selectedLead.leadStatus}
                  </Badge>
                )}
              </div>

              {/* Select CRM Lead */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Lead from Pipeline
                </label>
                <select
                  value={selectedLeadId}
                  disabled={Boolean(campaign)}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none transition"
                >
                  <option value="">Custom Prospect (Enter Manually)</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.businessName || l.companyName} ({l.country || 'Global'}) - {l.industry}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company & Contact Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Apex Health"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contact Person / Title
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Dr. Rajesh / Founder"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Website URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Website URL (Optional)
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://company.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Message Type Selector (7 Types) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Message Type (Select Format)
                  </label>
                  <span className="text-[10px] text-slate-400">7 Formats</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {MESSAGE_TYPES.filter((type) => !campaign || type.id === messageType).map((type) => {
                    const Icon = type.icon;
                    const isSelected = messageType === type.id;
                    return (
                      <button
                        type="button"
                        key={type.id}
                        onClick={() => setMessageType(type.id)}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-xs font-bold truncate">{type.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 line-clamp-1">
                          {type.charLimit ? `Max ${type.charLimit} chars` : type.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Service to Offer */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Service to Offer (From My 6 Core Offerings)
                </label>
                <select
                  value={targetService}
                  onChange={(e) => setTargetService(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  {AVAILABLE_SERVICES.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tone of Voice */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tone of Voice
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  {TONE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Verified Facts & Audit Grounding Notice */}
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-[11px]">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Strict AI Guardrails Active</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Never invents past relationships, previous calls, or broken website features.
                  Grounds outreach strictly in observed facts.
                </p>
                {verifiedProblems.length > 0 && (
                  <div className="pt-1.5 border-t border-indigo-500/20">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block mb-1">
                      Verified Lead Observations:
                    </span>
                    <ul className="space-y-1 text-[11px] text-slate-300">
                      {verifiedProblems.slice(0, 3).map((p, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-indigo-400">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Action Submit Button */}
              <button
                type="submit"
                disabled={loading || !companyName.trim()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Synthesizing Tailored Draft...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Generate Outreach Draft</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Active Draft & Review Studio */}
          <div className="lg:col-span-7 space-y-4">
            {activePitch ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-5 shadow-xl animate-fadeIn">
                {/* Draft Header Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activePitch.metadata?.isFallback && (
                      <span className="text-[11px] text-amber-300">Local template used</span>
                    )}
                    {activePitch.metadata?.generatedBy === 'gemini' && activePitch.metadata?.model && (
                      <span className="text-[11px] text-slate-400">Gemini · {activePitch.metadata.model}</span>
                    )}
                    {activePitch.metadata?.businessProfile?.includedInBody && (
                      <span className="text-[11px] text-slate-400">Portfolio reference {activePitch.metadata.businessProfile.reference.label}</span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs">
                      {activePitch.messageType || activePitch.channel}
                    </span>
                    <Badge
                      variant={activePitch.status === 'DRAFT' ? 'warning' : 'success'}
                      size="sm"
                    >
                      {activePitch.status === 'DRAFT' ? 'DRAFT (Unsent)' : activePitch.status}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      Target: <strong className="text-white">{companyName}</strong>
                    </span>
                  </div>

                  {/* Actions: Regenerate, Edit, Copy, Save, Mark Sent */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleGenerate()}
                      disabled={loading}
                      title="Regenerate fresh wording"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Regenerate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsEditing(!isEditing)}
                      disabled={activePitch.status !== 'DRAFT'}
                      className={`p-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                        isEditing
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>{isEditing ? 'Cancel Edit' : 'Edit'}</span>
                    </button>

                    {isEditing && (
                      <button
                        type="button"
                        onClick={handleSaveEdits}
                        disabled={saveLoading}
                        className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
                      >
                        {saveLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        <span>Save Draft</span>
                      </button>
                    )}

                    {!isEditing && <DraftActions pitch={activePitch} onUpdate={(pitch) => {
                      setActivePitch(pitch);
                      onPitchUpdated();
                      void loadHistory();
                    }} />}
                  </div>
                </div>

                {/* 6 Building Blocks Inspection Accordion */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    <span>6 Structured Draft Elements</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase">
                        1. Personalised Opening
                      </span>
                      <p className="text-slate-300 text-[11px] line-clamp-2">
                        {activePitch.personalisedOpening || 'Referencing business domain respectfully.'}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">
                        2. Observed Business Opportunity
                      </span>
                      <p className="text-slate-300 text-[11px] line-clamp-2">
                        {activePitch.observedOpportunity || 'Grounded strictly in verified metrics.'}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-blue-400 uppercase">
                        3. Relevant Service to Offer
                      </span>
                      <p className="text-slate-300 text-[11px] line-clamp-2">
                        {activePitch.relevantService || activePitch.targetService}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-violet-400 uppercase">
                        4. Short Value Proposition
                      </span>
                      <p className="text-slate-300 text-[11px] line-clamp-2">
                        {activePitch.valueProposition || 'Realistic conversion & UX benefits.'}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-amber-400 uppercase">
                        5. Clear Call to Action
                      </span>
                      <p className="text-slate-300 text-[11px] line-clamp-2">
                        {activePitch.callToAction || 'Polite, low-pressure 10-minute exchange.'}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-bold text-teal-400 uppercase">
                        6. Professional Closing
                      </span>
                      <p className="text-slate-300 text-[11px] line-clamp-2">
                        {activePitch.professionalClosing || 'Professional sign-off.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subject Line (if applicable) */}
                {activePitch.channel !== 'WHATSAPP' && (activePitch.subject || editedSubject) && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Subject Line:</span>
                    </div>

                    {isEditing ? (
                      <input
                        type="text"
                        value={editedSubject}
                        onChange={(e) => setEditedSubject(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    ) : (
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs font-medium text-slate-200">
                        {editedSubject || activePitch.subject}
                      </div>
                    )}
                  </div>
                )}

                {/* Full Message Body (Preview vs Editor) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      {isEditing ? 'Edit Full Outreach Message:' : 'Full Message Body:'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {(editedBody || activePitch.body).length} characters •{' '}
                      {(editedBody || activePitch.body).split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>

                  {isEditing ? (
                    <textarea
                      rows={12}
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none leading-relaxed"
                    />
                  ) : (
                    <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 sm:p-5 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                      {editedBody || activePitch.body}
                    </div>
                  )}
                </div>

                {/* Follow-up Sequence Preview */}
                {activePitch.followUpSequence && activePitch.followUpSequence.length > 0 && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Suggested Follow-Up Sequence</span>
                    </div>

                    <div className="space-y-2">
                      {activePitch.followUpSequence.map((seq, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-indigo-300">
                              Day +{seq.delayDays}: {seq.subject}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2">{seq.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Empty State */
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center flex flex-col items-center justify-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-white">No Active Draft Selected</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Select a lead from your pipeline, pick a message type, and click
                  "Generate Outreach Draft" to craft a personalized message.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OUTREACH HISTORY & SENT LOG VIEW */}
      {activeView === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Filter Status:</span>
              <div className="flex items-center gap-1">
                {['ALL', 'DRAFT', 'SENT'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setHistoryFilterStatus(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      historyFilterStatus === st
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-400">
              Showing {filteredHistory.length} of {historyList.length} stored outreach records
            </span>
          </div>

          {historyLoading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              <span>Loading outreach history from PostgreSQL...</span>
            </div>
          ) : filteredHistory.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setActivePitch(item);
                    setActiveView('composer');
                    if (item.leadId) setSelectedLeadId(item.leadId);
                  }}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3 hover:border-indigo-500/50 cursor-pointer transition shadow-lg group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition">
                          {item.lead?.businessName || item.lead?.companyName || 'Custom Prospect'}
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold">
                          {item.messageType || item.channel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {item.targetService} • {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={item.status === 'SENT' ? 'success' : 'warning'}
                        size="xs"
                      >
                        {item.status}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        title="Delete from history"
                        className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {item.subject && (
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      Subject: {item.subject}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed font-mono text-[11px]">
                    {item.body}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <span>
                      {item.status === 'SENT' && item.sentAt
                        ? `Sent on ${new Date(item.sentAt).toLocaleDateString()}`
                        : 'Draft saved in database'}
                    </span>
                    <span className="text-indigo-400 font-semibold group-hover:translate-x-0.5 transition flex items-center gap-1">
                      <span>Open in Composer</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-xs">
              No outreach records matching filter. Generate and save drafts to see them in history.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
