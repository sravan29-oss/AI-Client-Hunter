import { LEAD_STATUSES } from '../utils/crmDiscovery';
import React from 'react';
import { Modal } from './Modal';
import { Lead, LeadStatus } from '../types';
import { LeadDiscoveryEvidence } from './LeadDiscoveryEvidence';
import { Badge } from './Badge';
import {
  Globe2,
  Mail,
  Phone,
  User,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Zap,
  Send,
  Edit,
  ExternalLink,
  Layers,
  Sparkles,
  FileText,
} from 'lucide-react';

interface LeadDetailModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onAnalyze: (lead: Lead) => void;
  onPitch: (lead: Lead) => void;
  onQuote: (lead: Lead) => void;
  onFollowUp: (lead: Lead) => void;
  onEngagement: (lead: Lead) => void;
  onUpdateStatus: (leadId: string, status: LeadStatus) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  isOpen,
  lead,
  onClose,
  onEdit,
  onAnalyze,
  onPitch,
  onQuote,
  onFollowUp,
  onEngagement,
  onUpdateStatus,
}) => {
  if (!lead) return null;

  const statusOptions = LEAD_STATUSES;

  const currentStatus = (lead.leadStatus || (lead as any).status || 'New') as LeadStatus;
  const score = lead.opportunityScore || 70;
  const website = lead.website || lead.websiteUrl || '';
  const cleanUrl = website.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lead.businessName || (lead as any).companyName || 'Lead Details'}
      size="xl"
    >
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-navy-950/70 border border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">
                {lead.businessName || (lead as any).companyName}
              </span>
              <Badge variant="status" value={currentStatus} size="sm">
                {currentStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                {lead.city ? `${lead.city}, ` : ''}{lead.country || 'Global'}
              </span>
              <span>•</span>
              <span className="text-slate-300 font-medium">{lead.industry}</span>
              <span>•</span>
              <span className="text-slate-500">Source: {lead.source || 'Manual'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Opportunity Score</div>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    score >= 85 ? 'bg-emerald-400 shadow-glow-green' : score >= 70 ? 'bg-blue-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-lg font-black text-white">{score}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Tracker */}
        <div className="p-4 rounded-xl bg-navy-900/60 border border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-slate-300">Pipeline Progression</div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {statusOptions.map((opt) => {
              const isSelected = currentStatus === opt.key || currentStatus === opt.label;
              return (
                <button
                  key={opt.key}
                  onClick={() => onUpdateStatus(lead.id, opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-glow-blue border border-electric-400/50'
                      : 'bg-navy-950/80 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contact & Business Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact Details */}
          <div className="p-4 rounded-xl bg-navy-900/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-electric-400" />
              Contact Information
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Contact Person</span>
                <span className="text-slate-200 font-medium">{lead.contactName || 'Not specified'}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Business Email</span>
                {lead.businessEmail || (lead as any).contactEmail ? (
                  <a
                    href={`mailto:${lead.businessEmail || (lead as any).contactEmail}`}
                    className="text-electric-400 hover:underline flex items-center gap-1"
                  >
                    <Mail className="h-3 w-3" />
                    {lead.businessEmail || (lead as any).contactEmail}
                  </a>
                ) : (
                  <span className="text-slate-500 italic">None</span>
                )}
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Phone Number</span>
                {lead.publicBusinessPhone || (lead as any).contactPhone ? (
                  <span className="text-slate-200 font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" />
                    {lead.publicBusinessPhone || (lead as any).contactPhone}
                  </span>
                ) : (
                  <span className="text-slate-500 italic">None</span>
                )}
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400">Website</span>
                {website ? (
                  <a
                    href={website.startsWith('http') ? website : `https://${website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-electric-400 hover:text-electric-300 hover:underline flex items-center gap-1 font-medium truncate max-w-[200px]"
                  >
                    <Globe2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{cleanUrl}</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                  </a>
                ) : (
                  <span className="text-slate-500 italic">No URL</span>
                )}
              </div>
            </div>
          </div>

          {/* Business Description & Notes */}
          <div className="p-4 rounded-xl bg-navy-900/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-violet-400" />
              Overview & Notes
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block mb-0.5">Business Description</span>
                <p className="text-slate-300 bg-navy-950/80 p-2.5 rounded-lg border border-slate-800/80 min-h-[50px] leading-relaxed">
                  {lead.businessDescription || 'No description provided.'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block mb-0.5">Internal Notes</span>
                <p className="text-slate-300 bg-navy-950/80 p-2.5 rounded-lg border border-slate-800/80 min-h-[40px] leading-relaxed">
                  {lead.notes || 'No notes added yet.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Suggested Services & Detected Problems */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Suggested Services */}
          <div className="p-4 rounded-xl bg-navy-900/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              Suggested Freelance Services
            </h4>
            {lead.suggestedServices && lead.suggestedServices.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {lead.suggestedServices.map((srv, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-electric-500/10 text-electric-300 border border-electric-500/30 text-xs font-medium"
                  >
                    <CheckCircle2 className="h-3 w-3 text-electric-400" />
                    {srv}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No specific service suggestions assigned yet.</p>
            )}
          </div>

          {/* Detected Problems */}
          <div className="p-4 rounded-xl bg-navy-900/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              Detected Problems / Opportunities
            </h4>
            {lead.detectedProblems && lead.detectedProblems.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-slate-300">
                {lead.detectedProblems.map((prob, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                    <span>{prob}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">Run a Website Audit to uncover technical and design issues.</p>
            )}
          </div>
        </div>

        <LeadDiscoveryEvidence lead={lead} />

        {/* AI Client Qualification & Suggested Scope */}
        {lead.profileMatch && (
          <section className="space-y-3 rounded-xl border border-electric-900 bg-navy-900/60 p-4" aria-label="Ideal Client Profile score">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">Ideal Client Profile match</h3>
              <span className="text-sm font-bold text-electric-300">{lead.profileMatch.score}/100</span>
            </div>
            <p className="text-xs text-slate-400">{lead.profileMatch.profileName} · Revision {lead.profileMatch.revision}</p>
            {lead.profileMatch.factors.map((factor) => <div key={factor.label} className="rounded-lg border border-slate-800 px-3 py-2">
              <div className="flex justify-between gap-2 text-xs font-semibold text-slate-200"><span>{factor.label}</span><span>{factor.points}/{factor.max}</span></div>
              <p className="mt-1 text-xs text-slate-400">{factor.evidence}</p>
            </div>)}
            {lead.profileMatch.unknown.length > 0 && <p className="text-xs text-amber-300">Unverified fields include {lead.profileMatch.unknown.join(', ')}.</p>}
          </section>
        )}
        {(lead.qualificationReason || lead.suggestedProjectScope || lead.aiSummary) && (
          <div className="p-4 rounded-xl bg-electric-950/20 border border-electric-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-electric-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-electric-400" />
                AI Client Qualification & Suggested Scope
              </h4>
              {lead.estimatedComplexity && (
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                  Complexity: {lead.estimatedComplexity}
                </span>
              )}
            </div>

            {lead.qualificationReason && (
              <div>
                <span className="text-slate-400 text-[11px] font-semibold block mb-0.5">Qualification Rationale:</span>
                <p className="text-xs text-slate-200 leading-relaxed">{lead.qualificationReason}</p>
              </div>
            )}

            {lead.suggestedProjectScope && (
              <div>
                <span className="text-slate-400 text-[11px] font-semibold block mb-0.5">Recommended Project Scope:</span>
                <p className="text-xs text-slate-300 leading-relaxed">{lead.suggestedProjectScope}</p>
              </div>
            )}

            <div className="text-[10px] text-slate-500 italic">
              Notice: AI assessment generated from verified public data. Not a confirmed client commitment.
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Created: {new Date(lead.createdAt).toLocaleDateString()} at {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span>Lead ID: {lead.id}</span>
        </div>

        {/* Actions Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button
            onClick={() => onEdit(lead)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
          >
            <Edit className="h-3.5 w-3.5" />
            <span>Edit Information</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onAnalyze(lead);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold shadow-sm hover:opacity-95 transition"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Analyze Website</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onPitch(lead);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold shadow-glow-blue hover:opacity-95 transition"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Draft AI Outreach Pitch</span>
            </button>
            <button type="button" onClick={() => { onClose(); onQuote(lead); }}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200">
              Build proposal
            </button>
            <button type="button" onClick={() => { onClose(); onFollowUp(lead); }}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200">
              Schedule follow-up
            </button>
            <button type="button" onClick={() => { onClose(); onEngagement(lead); }}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200">
              Communication history
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
