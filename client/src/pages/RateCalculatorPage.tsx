import React, { useState, useEffect } from 'react';
import {
  Calculator,
  DollarSign,
  Clock,
  CheckCircle2,
  Copy,
  Check,
  Plus,
  Trash2,
  FileCheck,
  Sparkles,
} from 'lucide-react';
import { ServicePackage, Region, Pitch, QuoteService } from '../types';
import { apiClient } from '../api/client';
import { Badge } from '../components/Badge';

interface RateCalculatorProps {
  proposalLead?: { id: string; businessName: string; country?: string | null };
  onProposalSaved?: (pitch: Pitch) => void;
}

export const RateCalculatorPage: React.FC<RateCalculatorProps> = ({ proposalLead, onProposalSaved }) => {
  const initialRegion = !proposalLead || proposalLead.country?.toLowerCase() === 'india' ? 'INDIA' : 'OTHER';
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [region, setRegion] = useState<Region>(initialRegion);
  const [currency, setCurrency] = useState<'INR' | 'USD' | 'EUR' | 'GBP'>(initialRegion === 'INDIA' ? 'INR' : 'USD');
  const [clientName, setClientName] = useState(proposalLead?.businessName ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedItems, setSelectedItems] = useState<QuoteService[]>(proposalLead ? [] : [
    { serviceKey: 'business_website', tier: 'GROWTH' },
    { serviceKey: 'ai_integration', tier: 'STARTER' },
  ]);

  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [copiedProposal, setCopiedProposal] = useState(false);

  const availableAddons = [
    {
      key: 'whatsapp_bot',
      name: 'WhatsApp AI Customer Bot Integration',
      priceInr: 25000,
      priceUsd: 800,
    },
    {
      key: 'app_submission',
      name: 'App Store & Google Play Submission Management',
      priceInr: 20000,
      priceUsd: 600,
    },
    {
      key: 'priority_sla',
      name: '3-Month Priority SLA & Bug-Free Warranty',
      priceInr: 35000,
      priceUsd: 1200,
    },
    {
      key: 'seo_audit',
      name: 'Advanced Schema.org & Local SEO Optimization',
      priceInr: 15000,
      priceUsd: 500,
    },
  ];

  useEffect(() => {
    apiClient
      .getRatecards()
      .then(setPackages)
      .catch((err: Error) => setCatalogError(err.message));
  }, []);

  if (catalogError) return <p role="alert" className="text-sm text-rose-300">{catalogError}</p>;
  if (packages.length === 0) return <p className="text-sm text-slate-400">Loading service packages…</p>;

  const handleRegionChange = (newRegion: Region) => {
    setRegion(newRegion);
    if (newRegion === 'INDIA') {
      setCurrency('INR');
    } else {
      setCurrency('USD');
    }
  };

  const handleAddItem = (serviceKey: string, tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE') => {
    const existingIndex = selectedItems.findIndex((item) => item.serviceKey === serviceKey);
    if (existingIndex > -1) {
      const copy = [...selectedItems];
      copy[existingIndex] = { serviceKey, tier };
      setSelectedItems(copy);
    } else {
      setSelectedItems([...selectedItems, { serviceKey, tier }]);
    }
  };

  const handleRemoveItem = (serviceKey: string) => {
    setSelectedItems(selectedItems.filter((i) => i.serviceKey !== serviceKey));
  };

  const handleToggleAddon = (key: string) => {
    if (selectedAddons.includes(key)) {
      setSelectedAddons(selectedAddons.filter((k) => k !== key));
    } else {
      setSelectedAddons([...selectedAddons, key]);
    }
  };

  // Calculations
  const isIndia = region === 'INDIA';
  let totalInr = 0;
  let totalUsd = 0;
  let maxWeeks = 0;
  const lineItemDetails: any[] = [];

  for (const item of selectedItems) {
    const pkg = packages.find((p) => p.serviceKey === item.serviceKey && p.tier === item.tier);
    if (pkg) {
      lineItemDetails.push({
        name: pkg.name,
        tier: pkg.tier,
        priceInr: pkg.priceInr,
        priceUsd: pkg.priceUsd,
        turnaroundWeeks: pkg.turnaroundWeeks,
        deliverables: pkg.deliverables,
      });
      totalInr += pkg.priceInr;
      totalUsd += pkg.priceUsd;
      maxWeeks = Math.max(maxWeeks, pkg.turnaroundWeeks);
    }
  }

  for (const addonKey of selectedAddons) {
    const addon = availableAddons.find((a) => a.key === addonKey);
    if (addon) {
      lineItemDetails.push({
        name: addon.name,
        tier: 'Add-on',
        priceInr: addon.priceInr,
        priceUsd: addon.priceUsd,
      });
      totalInr += addon.priceInr;
      totalUsd += addon.priceUsd;
    }
  }

  let finalAmount = isIndia ? totalInr : totalUsd;
  if (currency === 'EUR') finalAmount = Math.round(totalUsd * 0.92);
  if (currency === 'GBP') finalAmount = Math.round(totalUsd * 0.79);

  const proposalMarkdown = `
# PROJECT PROPOSAL & STATEMENT OF WORK
${clientName ? `Client: ${clientName}\n` : ''}Region: ${region} (${isIndia ? 'Indian Domestic Standard' : 'International Contract'})
Target Delivery: ${maxWeeks} - ${maxWeeks + 1} Weeks
Total Investment: ${isIndia ? `₹${totalInr.toLocaleString('en-IN')}` : `${currency} ${finalAmount.toLocaleString('en-US')}`}

---
### SCOPE & DELIVERABLES:
${lineItemDetails
  .map(
    (li) => `
#### ${li.name} [${li.tier}]
- Pricing: ${isIndia ? `₹${li.priceInr.toLocaleString('en-IN')}` : `$${li.priceUsd.toLocaleString('en-US')}`}
${(li.deliverables || []).map((d: string) => `  * ${d}`).join('\n')}
`
  )
  .join('\n')}

---
### PAYMENT MILESTONES:
- Milestone 1 (50% upfront): Architecture, UI/UX Design System, and Project Kickoff.
- Milestone 2 (30% progress): Core Feature Staging, API Integration & Initial QA.
- Milestone 3 (20% delivery): Final Deployment, Core Web Vitals Audit & Handover.
`.trim();

  const handleCopyProposal = () => {
    navigator.clipboard.writeText(proposalMarkdown);
    setCopiedProposal(true);
    setTimeout(() => setCopiedProposal(false), 2000);
  };

  async function saveProposal() {
    if (!proposalLead || saving || selectedItems.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      const pitch = await apiClient.saveProposal({
        leadId: proposalLead.id, currency: isIndia ? 'INR' : 'USD', services: selectedItems,
      });
      onProposalSaved?.(pitch);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save the proposal.');
    } finally {
      setSaving(false);
    }
  }

  const serviceCategories = [
    { key: 'business_website', label: 'Business Websites' },
    { key: 'ecommerce', label: 'E-commerce Websites' },
    { key: 'react_native', label: 'React Native Mobile Apps' },
    { key: 'admin_dashboard', label: 'Admin Dashboards' },
    { key: 'backend_api', label: 'Backend API Development' },
    { key: 'ai_integration', label: 'AI Applications & Integrations' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-white">Rate Card & Proposal Estimator</h1>
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
            Dynamic Pricing
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Standardized freelance rates for Indian clients (₹) and Global clients ($). Build custom proposals
          with instant milestone breakdowns and copy-ready scopes.
        </p>
      </div>

      {/* Region & Currency Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-300">Target Region:</span>
          <div className="flex gap-2">
            {(['INDIA', 'US', 'UK', 'EUROPE'] as Region[]).map((r) => (
              <button
                key={r}
                onClick={() => handleRegionChange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  region === r
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {r === 'INDIA' ? 'India (₹ INR)' : r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-300">Client Name:</span>
          <input
            type="text"
            value={clientName}
            readOnly={Boolean(proposalLead)}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. Acme Health"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Service Packages Catalog */}
        <div className="lg:col-span-7 space-y-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Available Service Packages & Deliverables
          </h2>

          <div className="space-y-4">
            {serviceCategories.map((cat) => {
              const catPkgs = packages.filter((p) => p.serviceKey === cat.key);
              const currentItem = selectedItems.find((i) => i.serviceKey === cat.key);

              return (
                <div
                  key={cat.key}
                  className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{cat.label}</h3>
                    {currentItem ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Included in Proposal ({currentItem.tier})</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Not selected</span>
                    )}
                  </div>

                  {/* Tier selector cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {catPkgs.map((pkg) => {
                      const isSelected = currentItem?.tier === pkg.tier;
                      const priceFormatted = isIndia
                        ? `₹${pkg.priceInr.toLocaleString('en-IN')}`
                        : `$${pkg.priceUsd.toLocaleString('en-US')}`;

                      return (
                        <div
                          key={pkg.id}
                          onClick={() => handleAddItem(pkg.serviceKey, pkg.tier as any)}
                          className={`cursor-pointer rounded-xl border p-3 flex flex-col justify-between transition ${
                            isSelected
                              ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-sm'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {pkg.tier}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {pkg.turnaroundWeeks}w
                              </span>
                            </div>
                            <div className="mt-1 text-xs font-bold leading-tight line-clamp-1">
                              {pkg.name}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/80">
                            <span className="text-xs font-extrabold text-emerald-400">
                              {priceFormatted}
                            </span>
                            {isSelected ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveItem(pkg.serviceKey);
                                }}
                                className="text-[10px] text-rose-400 hover:underline"
                              >
                                Remove
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-semibold">
                                + Select
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add-ons Section */}
          {!proposalLead && <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Recommended Add-Ons</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableAddons.map((addon) => {
                const isSelected = selectedAddons.includes(addon.key);
                const priceFormatted = isIndia
                  ? `₹${addon.priceInr.toLocaleString('en-IN')}`
                  : `$${addon.priceUsd.toLocaleString('en-US')}`;

                return (
                  <div
                    key={addon.key}
                    onClick={() => handleToggleAddon(addon.key)}
                    className={`cursor-pointer rounded-xl border p-3 flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-500 text-white'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">{addon.name}</div>
                      <div className="text-[11px] font-extrabold text-emerald-400 mt-1">
                        {priceFormatted}
                      </div>
                    </div>
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-400 text-black'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}
        </div>

        {/* Right: Live Calculation & Proposal Summary */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-20 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Proposal Total</h3>
                <p className="text-[11px] text-slate-400">
                  {selectedItems.length} core services + {selectedAddons.length} add-ons
                </p>
              </div>

              <div className="text-right">
                <div className="text-2xl font-extrabold text-emerald-400">
                  {isIndia ? `₹${totalInr.toLocaleString('en-IN')}` : `${currency} ${finalAmount.toLocaleString('en-US')}`}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Est. Timeline: {maxWeeks} Weeks</span>
                </div>
              </div>
            </div>

            {/* Itemized Line Items */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {lineItemDetails.map((li, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60"
                >
                  <div>
                    <span className="font-semibold text-slate-200">{li.name}</span>
                    <span className="text-[10px] text-slate-500 ml-1.5">({li.tier})</span>
                  </div>
                  <span className="font-bold text-slate-300">
                    {isIndia
                      ? `₹${li.priceInr.toLocaleString('en-IN')}`
                      : `$${li.priceUsd.toLocaleString('en-US')}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Proposal Scope Output */}
            {proposalLead ? (
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <p className="text-xs text-slate-400">Save the selected catalog scope and prices as a draft for review.</p>
                <button type="button" disabled={saving || selectedItems.length === 0} onClick={() => void saveProposal()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save proposal draft'}
                </button>
                {saveError && <p role="alert" className="text-xs text-rose-300">{saveError}</p>}
              </div>
            ) : <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Client Statement of Work:</span>
                <button
                  onClick={handleCopyProposal}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition"
                >
                  {copiedProposal ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Copied SOW!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Proposal SOW</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                readOnly
                rows={12}
                value={proposalMarkdown}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] font-mono text-slate-300 leading-relaxed focus:outline-none"
              />
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};
