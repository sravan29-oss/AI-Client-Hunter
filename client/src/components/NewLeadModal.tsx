import React, { useState } from 'react';
import { Modal } from './Modal';
import { LeadStatus } from '../types';
import { apiClient } from '../api/client';
import { Plus, Loader2, AlertTriangle } from 'lucide-react';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadCreated: () => void;
}

const ALL_SERVICES = [
  'Business website',
  'E-commerce website',
  'React Native mobile application',
  'Admin dashboard',
  'Backend API development',
  'AI application and integration',
];

const ALL_STATUSES: Array<{ key: LeadStatus; label: string }> = [
  { key: 'New', label: 'New' },
  { key: 'Analysed', label: 'Analysed' },
  { key: 'Ready_to_Contact', label: 'Ready to Contact' },
  { key: 'Contacted', label: 'Contacted' },
  { key: 'Replied', label: 'Replied' },
  { key: 'Meeting_Scheduled', label: 'Meeting Scheduled' },
  { key: 'Negotiation', label: 'Negotiation' },
  { key: 'Won', label: 'Won' },
  { key: 'Lost', label: 'Lost' },
];

export const NewLeadModal: React.FC<NewLeadModalProps> = ({
  isOpen,
  onClose,
  onLeadCreated,
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
  const [opportunityScore, setOpportunityScore] = useState<number>(75);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('New');
  const [notes, setNotes] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>(['Business website']);
  const [detectedProblemsText, setDetectedProblemsText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleService = (service: string) => {
    if (selectedServices.includes(service)) {
      setSelectedServices(selectedServices.filter((s) => s !== service));
    } else {
      setSelectedServices([...selectedServices, service]);
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
      await apiClient.createLead({
        businessName: businessName.trim(),
        website: website.trim() || undefined,
        country: country.trim() || 'India',
        city: city.trim() || undefined,
        industry: industry.trim() || 'Technology',
        businessEmail: businessEmail.trim() || undefined,
        contactName: contactName.trim() || undefined,
        publicBusinessPhone: publicBusinessPhone.trim() || undefined,
        source: source.trim() || 'Manual',
        businessDescription: businessDescription.trim() || undefined,
        suggestedServices: selectedServices,
        detectedProblems: problems,
        opportunityScore: Number(opportunityScore),
        leadStatus,
        notes: notes.trim() || undefined,
      });

      // Reset form
      setBusinessName('');
      setWebsite('');
      setCity('');
      setBusinessEmail('');
      setContactName('');
      setPublicBusinessPhone('');
      setBusinessDescription('');
      setNotes('');
      setDetectedProblemsText('');
      setOpportunityScore(75);
      setLeadStatus('New');

      onLeadCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Business Lead" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Business Name & Website */}
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
              placeholder="e.g. Nexus Healthcare, Luxora Retail"
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
              placeholder="https://company.com"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>
        </div>

        {/* Country, City, Industry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            >
              <option value="India">India</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="Germany">Germany</option>
              <option value="Canada">Canada</option>
              <option value="Australia">Australia</option>
              <option value="Singapore">Singapore</option>
              <option value="United Arab Emirates">United Arab Emirates</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Bengaluru, Austin"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. E-Commerce, HealthTech"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Contact Name</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Founder or Decision Maker"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Business Email</label>
            <input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              placeholder="founder@company.com"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Phone</label>
            <input
              type="text"
              value={publicBusinessPhone}
              onChange={(e) => setPublicBusinessPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
            />
          </div>
        </div>

        {/* Opportunity Score & Initial Status */}
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
              placeholder="Manual, LinkedIn, Referral"
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
            Suggested Freelance Services
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_SERVICES.map((srv) => {
              const active = selectedServices.includes(srv);
              return (
                <button
                  type="button"
                  key={srv}
                  onClick={() => handleToggleService(srv)}
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
            placeholder="Brief overview of the business model, offering, or target market..."
            className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500 resize-none"
          />
        </div>

        {/* Detected Problems */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Detected Problems / Technical Bottlenecks (one per line)
          </label>
          <textarea
            rows={2}
            value={detectedProblemsText}
            onChange={(e) => setDetectedProblemsText(e.target.value)}
            placeholder="Legacy slow frontend&#10;No automated customer portal&#10;Lacks modern payment gateway integration"
            className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500 resize-none font-mono"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Strategy, upcoming follow-ups, or custom requirements..."
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
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span>Add Lead</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
