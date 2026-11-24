import { LEAD_STATUSES } from '../utils/crmDiscovery';
import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Lead, LeadStatus } from '../types';
import { apiClient } from '../api/client';
import { Loader2, Save, X, AlertTriangle } from 'lucide-react';

interface LeadEditModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onLeadUpdated: () => void;
}

const ALL_SERVICES = [
  'Business website',
  'E-commerce website',
  'React Native mobile application',
  'Admin dashboard',
  'Backend API development',
  'AI application and integration',
];

const ALL_STATUSES = LEAD_STATUSES;

export const LeadEditModal: React.FC<LeadEditModalProps> = ({
  isOpen,
  lead,
  onClose,
  onLeadUpdated,
}) => {
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('India');
  const [city, setCity] = useState('');
  const [industry, setIndustry] = useState('Technology');
  const [businessEmail, setBusinessEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [publicBusinessPhone, setPublicBusinessPhone] = useState('');
  const [source, setSource] = useState('Manual');
  const [businessDescription, setBusinessDescription] = useState('');
  const [opportunityScore, setOpportunityScore] = useState<number>(70);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('New');
  const [notes, setNotes] = useState('');
  const [suggestedServices, setSuggestedServices] = useState<string[]>([]);
  const [detectedProblemsText, setDetectedProblemsText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setBusinessName(lead.businessName || (lead as any).companyName || '');
      setWebsite(lead.website || lead.websiteUrl || '');
      setCountry(lead.country || 'India');
      setCity(lead.city || '');
      setIndustry(lead.industry || 'Technology');
      setBusinessEmail(lead.businessEmail || (lead as any).contactEmail || '');
      setContactName(lead.contactName || '');
      setPublicBusinessPhone(lead.publicBusinessPhone || (lead as any).contactPhone || '');
      setSource(lead.source || 'Manual');
      setBusinessDescription(lead.businessDescription || '');
      setOpportunityScore(lead.opportunityScore || 70);
      setLeadStatus((lead.leadStatus || (lead as any).status || 'New') as LeadStatus);
      setNotes(lead.notes || '');
      setSuggestedServices(lead.suggestedServices || lead.services || ['Business website']);
      setDetectedProblemsText((lead.detectedProblems || []).join('\n'));
      setError(null);
    }
  }, [lead]);

  if (!lead) return null;

  const toggleService = (srv: string) => {
    if (suggestedServices.includes(srv)) {
      setSuggestedServices(suggestedServices.filter((s) => s !== s));
    } else {
      setSuggestedServices([...suggestedServices, srv]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }

    setLoading(true);
    setError(null);

    const problems = detectedProblemsText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      await apiClient.updateLead(lead.id, {
        businessName: businessName.trim(),
        website: website.trim() || null,
        country: country.trim() || 'India',
        city: city.trim() || null,
        industry: industry.trim() || 'Technology',
        businessEmail: businessEmail.trim() || null,
        contactName: contactName.trim() || null,
        publicBusinessPhone: publicBusinessPhone.trim() || null,
        source: source.trim() || 'Manual',
        businessDescription: businessDescription.trim() || null,
        suggestedServices,
        detectedProblems: problems,
        opportunityScore: Number(opportunityScore),
        leadStatus,
        notes: notes.trim() || null,
      });

      onLeadUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Lead: ${lead.businessName || (lead as any).companyName}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Business Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Website URL
            </label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>
        </div>

        {/* Location & Industry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Bengaluru, London"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Contact Name</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Founder / Decision Maker"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Business Email</label>
            <input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              placeholder="contact@company.com"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Phone</label>
            <input
              type="text"
              value={publicBusinessPhone}
              onChange={(e) => setPublicBusinessPhone(e.target.value)}
              placeholder="+91 / +1 ..."
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>
        </div>

        {/* Pipeline & Score */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Lead Status</label>
            <select
              value={leadStatus}
              onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            >
              {ALL_STATUSES.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">Opportunity Score</label>
              <span className="text-xs font-bold text-electric-400">{opportunityScore}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={opportunityScore}
              onChange={(e) => setOpportunityScore(Number(e.target.value))}
              className="w-full accent-electric-500"
            />
          </div>
        </div>

        {/* Suggested Services */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">
            Suggested Services
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_SERVICES.map((srv) => {
              const active = suggestedServices.includes(srv);
              return (
                <button
                  type="button"
                  key={srv}
                  onClick={() => toggleService(srv)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    active
                      ? 'bg-electric-500 text-white shadow-glow-blue border border-electric-400'
                      : 'bg-navy-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {srv}
                </button>
              );
            })}
          </div>
        </div>

        {/* Business Description */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Business Description
          </label>
          <textarea
            rows={2}
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="What does this company do?"
            className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500 resize-none"
          />
        </div>

        {/* Detected Problems */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Detected Problems (one per line)
          </label>
          <textarea
            rows={2}
            value={detectedProblemsText}
            onChange={(e) => setDetectedProblemsText(e.target.value)}
            placeholder="Slow page load&#10;No mobile responsive design&#10;Lacks modern e-commerce checkout"
            className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500 resize-none font-mono"
          />
        </div>

        {/* Internal Notes */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Internal Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key talking points, outreach follow-ups, or notes..."
            className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-navy-950 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold shadow-glow-blue hover:opacity-95 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Changes</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
