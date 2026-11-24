import React, { useState, useEffect } from 'react';
import {
  Compass,
  Sparkles,
  Search,
  Building2,
  ExternalLink,
  Plus,
  Check,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  Loader2,
  History,
  ShieldCheck,
  Globe2,
  Phone,
  Mail,
  Zap,
  Send,
  Trash2,
  RefreshCw,
  Info,
  CheckCircle2,
  Sliders,
  Filter,
} from 'lucide-react';
import {
  DiscoveredLead,
  DiscoveryFilter,
  DiscoveryHistoryItem,
  ProviderStatus,
  Region,
} from '../types';
import { apiClient } from '../api/client';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ProviderConnection } from '../components/ProviderConnection';

interface DiscoveryPageProps {
  onLeadAdded: () => void;
  onAuditUrl: (url: string) => void;
  onPitchLead?: (lead: any) => void;
}

const INDUSTRIES = [
  'Restaurants',
  'Retail stores',
  'Hotels',
  'Offices',
  'Healthcare businesses',
  'Real estate',
  'Education',
  'E-commerce',
  'Travel agencies',
  'Local service providers',
  'Startups',
  'Professional services',
];

const AVAILABLE_SERVICES = [
  'Business website',
  'E-commerce website',
  'React Native mobile application',
  'Admin dashboard',
  'Backend API development',
  'AI application and integration',
];

const POPULAR_COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Canada',
  'Australia',
  'Singapore',
  'United Arab Emirates',
];

function resultKey(lead: DiscoveredLead) {
  return lead.osmObject ? `${lead.osmObject.type}/${lead.osmObject.id}` : lead.businessName;
}

export const DiscoveryPage: React.FC<DiscoveryPageProps> = ({
  onLeadAdded,
  onAuditUrl,
  onPitchLead,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'manual' | 'history'>('search');

  // Filter State
  const [country, setCountry] = useState('India');
  const [customCountry, setCustomCountry] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [industry, setIndustry] = useState('Healthcare businesses');
  const [businessSize, setBusinessSize] = useState('Small (1-10)');
  const [websiteAvailability, setWebsiteAvailability] = useState<'any' | 'has_website' | 'no_website'>('any');
  const [selectedServices, setSelectedServices] = useState<string[]>([
    'React Native mobile application',
    'Admin dashboard',
  ]);
  const [maxLeads, setMaxLeads] = useState<number>(10);
  const [selectedProviderId, setSelectedProviderId] = useState(() => {
    const preferred = localStorage.getItem('preferred_discovery_provider');
    return preferred && preferred !== 'openstreetmap' ? preferred : 'overpass';
  });
  const [osmTagInput, setOsmTagInput] = useState('');

  // Manual Input State
  const [manualDomain, setManualDomain] = useState('');
  const [manualBusinessName, setManualBusinessName] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualCountry, setManualCountry] = useState('India');
  const [manualIndustry, setManualIndustry] = useState('Technology');

  // Providers & Execution State
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [providerError, setProviderError] = useState(false);
  const [results, setResults] = useState<DiscoveredLead[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<{
    occurred: boolean;
    primaryName?: string;
    fallbackName?: string;
    reason?: string;
  } | null>(null);
  const [historyList, setHistoryList] = useState<DiscoveryHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savedLeadsMap, setSavedLeadsMap] = useState<Record<string, boolean>>({});
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<DiscoveryHistoryItem | null>(null);

  // Load providers and history on mount
  useEffect(() => {
    loadProviders();
    loadHistory();
  }, []);

  const loadProviders = async (force = false) => {
    setTestingHealth(true);
    setProviderError(false);
    try {
      const data = await apiClient.getDiscoveryProviders(force, force);
      setProviders(data);
    } catch {
      setProviderError(true);
    } finally {
      setTestingHealth(false);
    }
  };

  const handleProviderStatus = (status: ProviderStatus) => {
    setProviders((previous) => previous.map((provider) => provider.id === status.id ? status : provider));
  };

  const handleSelectProvider = (id: string) => {
    setSelectedProviderId(id);
    localStorage.setItem('preferred_discovery_provider', id);
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await apiClient.getDiscoveryHistory();
      setHistoryList(data);
    } catch (err: any) {
      console.error('Failed to load discovery history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const currentProvider = providers.find((p) => p.id === selectedProviderId);

  const handleToggleService = (srv: string) => {
    if (selectedServices.includes(srv)) {
      if (selectedServices.length > 1) {
        setSelectedServices(selectedServices.filter((s) => s !== srv));
      }
    } else {
      setSelectedServices([...selectedServices, srv]);
    }
  };

  const effectiveCountry = country === 'Custom' ? customCountry : country;

  const handleExecuteSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!effectiveCountry) {
      setSearchError('Please select or specify a country.');
      return;
    }
    if (selectedProviderId === 'overpass' && !city.trim()) {
      setSearchError('Enter a city for Overpass.');
      return;
    }
    let osmTags: DiscoveryFilter['osmTags'];
    if (selectedProviderId === 'overpass' && osmTagInput.trim()) {
      const entries = osmTagInput.split(',').map((item) => item.trim().match(/^(amenity|shop|tourism|office|healthcare|craft|leisure|education|club)\s*=\s*([\p{L}\p{N}_ .:-]{1,80})$/u));
      if (entries.length > 6 || entries.some((entry) => !entry)) {
        setSearchError('Enter up to six OSM tags as key=value pairs separated by commas.');
        return;
      }
      osmTags = entries.map((entry) => ({ key: entry![1], value: entry![2].trim() }));
    }

    setLoading(true);
    setSearchError(null);
    setFallbackNotice(null);
    setResults([]);
    setSavedLeadsMap({});

    try {
      const res = await apiClient.searchDiscovery({
        country: effectiveCountry,
        city: city.trim() || undefined,
        industry,
        businessSize,
        websiteAvailability,
        servicesRequired: selectedServices,
        maxLeads: Number(maxLeads),
        providerId: selectedProviderId,
        osmTags,
      });

      setResults(res.leads);
      if (res.fallbackOccurred) {
        setFallbackNotice({
          occurred: true,
          primaryName: res.primaryProviderName,
          fallbackName: res.providerName,
          reason: res.fallbackReason,
        });
      } else {
        setFallbackNotice(null);
      }
      if (res.errors) {
        setSearchError(res.errors);
      }
      loadHistory();
    } catch (err: any) {
      setSearchError(err.message || 'Discovery search failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDomain.trim()) return;

    setLoading(true);
    setSearchError(null);
    setFallbackNotice(null);
    setResults([]);
    setSavedLeadsMap({});

    try {
      const res = await apiClient.searchDiscovery({
        country: manualCountry,
        city: manualCity.trim() || undefined,
        industry: manualIndustry,
        servicesRequired: selectedServices,
        maxLeads: 1,
        providerId: 'manual_input',
        domain: manualDomain.trim(),
        businessName: manualBusinessName.trim() || undefined,
      });

      setResults(res.leads);
      if (res.errors) {
        setSearchError(res.errors);
      }
      loadHistory();
    } catch (err: any) {
      setSearchError(err.message || 'Manual domain inspection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToCrm = async (lead: DiscoveredLead) => {
    try {
      await apiClient.createLead({
        businessName: lead.businessName,
        website: lead.website || undefined,
        country: lead.country,
        city: lead.city || undefined,
        industry: lead.industry,
        businessEmail: lead.businessEmail || undefined,
        contactName: lead.contactName || undefined,
        publicBusinessPhone: lead.publicBusinessPhone || undefined,
        source: lead.source,
        osmObject: lead.osmObject,
        discoveryDate: lead.discoveryDate,
        businessDescription: lead.businessDescription || undefined,
        detectedProblems: lead.detectedProblems,
        suggestedServices: lead.suggestedServices,
        opportunityScore: lead.opportunityScore,
        leadStatus: 'New',
        notes: lead.notes || undefined,
      });

      setSavedLeadsMap((prev) => ({ ...prev, [resultKey(lead)]: true }));
      onLeadAdded();
    } catch (err: any) {
      alert(`Could not save lead: ${err.message}`);
    }
  };

  const handleSaveAllNonDuplicates = async () => {
    const nonDuplicates = results.filter((lead) => !lead.isDuplicate && !savedLeadsMap[resultKey(lead)]);
    if (nonDuplicates.length === 0) return;

    let savedCount = 0;
    for (const lead of nonDuplicates) {
      try {
        await apiClient.createLead({
          businessName: lead.businessName,
          website: lead.website || undefined,
          country: lead.country,
          city: lead.city || undefined,
          industry: lead.industry,
          businessEmail: lead.businessEmail || undefined,
          contactName: lead.contactName || undefined,
          publicBusinessPhone: lead.publicBusinessPhone || undefined,
          source: lead.source,
          osmObject: lead.osmObject,
          discoveryDate: lead.discoveryDate,
          businessDescription: lead.businessDescription || undefined,
          detectedProblems: lead.detectedProblems,
          suggestedServices: lead.suggestedServices,
          opportunityScore: lead.opportunityScore,
          leadStatus: 'New',
          notes: lead.notes || undefined,
        });
        setSavedLeadsMap((prev) => ({ ...prev, [resultKey(lead)]: true }));
        savedCount++;
      } catch {
        // continue with next
      }
    }

    if (savedCount > 0) {
      onLeadAdded();
      alert(`Successfully saved ${savedCount} genuine leads into your CRM pipeline!`);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await apiClient.deleteDiscoveryHistory(id);
      loadHistory();
    } catch (err: any) {
      alert(`Could not delete history: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              AI-Powered Lead Discovery
            </h1>
            <span className="rounded-full bg-electric-500/10 px-2 py-0.5 text-[10px] font-bold text-electric-400 border border-electric-500/30">
              Live Commercial Directory
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Find genuine businesses that may need your freelance development services across India, USA, UK, Europe and global hubs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-navy-900 border border-slate-800 p-1">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'search'
                ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Search & Filters</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'manual'
                ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            <span>Manual Domain</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Discovery History ({historyList.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SEARCH & FILTERS */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Provider Status Bar */}
          <div className="p-4 rounded-2xl bg-navy-900/60 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Search providers
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400">
                  Selected source <strong className="text-white">{currentProvider?.name || selectedProviderId}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => loadProviders(true)}
                  disabled={testingHealth}
                  className="px-2 py-0.5 rounded-lg bg-navy-800 border border-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-[10px]"
                  title="Check live API connectivity"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${testingHealth ? 'animate-spin text-electric-400' : ''}`} />
                  <span>{testingHealth ? 'Checking…' : 'Test all connections'}</span>
                </button>
              </div>
            </div>

            {providerError && <p role="alert" className="text-xs text-rose-300">Could not load provider status. Try testing the connections again.</p>}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Search providers">
              {providers.map((prov) => {
                const isSelected = selectedProviderId === prov.id;
                return (
                  <article
                    key={prov.id}
                    className={`space-y-2.5 rounded-xl border p-3 text-xs transition ${
                      isSelected
                        ? 'bg-navy-950 border-electric-500 shadow-glow-blue'
                        : 'bg-navy-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    {prov.purpose === 'address_geocoding' ? <h3 className="font-bold text-white">{prov.name}</h3> : (
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="discovery_provider"
                        checked={isSelected}
                        onChange={() => handleSelectProvider(prov.id)}
                        className="mt-0.5 accent-electric-500"
                      />
                      <span className="font-bold text-white">{prov.name}</span>
                    </label>
                    )}
                    <p className="text-[11px] leading-relaxed text-slate-400">{prov.description}</p>
                    <ProviderConnection provider={prov} onStatus={handleProviderStatus} disabled={testingHealth} />
                  </article>
                );
              })}
            </div>

            {/* Unconfigured Provider Notice */}
            {currentProvider && !currentProvider.configured && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  Searches can use another configured directory when the selected provider is missing configuration.
                </div>
              </div>
            )}
          </div>

          {/* Filters Form */}
          <form
            onSubmit={handleExecuteSearch}
            className="p-5 rounded-2xl bg-navy-900/60 border border-slate-800 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-electric-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Discovery Parameters & Targeting
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Strictly no fabricated data</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Country */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Country
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                >
                  {POPULAR_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="Custom">Custom / Other Country...</option>
                </select>
                {country === 'Custom' && (
                  <input
                    type="text"
                    required
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                    placeholder="Enter country name"
                    className="w-full mt-1.5 rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-electric-500"
                  />
                )}
              </div>

              {/* City */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  City / Location Hub
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Bengaluru, London, New York"
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                />
              </div>

              {/* Industry */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Industry
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>

              {/* Business Size */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Business Size
                </label>
                <select
                  value={businessSize}
                  onChange={(e) => setBusinessSize(e.target.value)}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                >
                  <option value="Any">Any Size</option>
                  <option value="Small (1-10)">Small (1-10 employees)</option>
                  <option value="Medium (11-50)">Medium (11-50 employees)</option>
                  <option value="Growing (51-200)">Growing (51-200 employees)</option>
                  <option value="Enterprise (200+)">Enterprise (200+ employees)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
            {selectedProviderId === 'overpass' && (
              <label className="block text-xs font-semibold text-slate-300">
                OSM tags (optional)
                <input
                  value={osmTagInput}
                  onChange={(event) => setOsmTagInput(event.target.value)}
                  placeholder="shop=bakery"
                  maxLength={560}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white"
                />
                <span className="mt-1 block font-normal text-slate-400">Separate up to six key=value filters with commas. All tags must match.</span>
              </label>
            )}

            {/* Website Availability Filter */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Website Availability
                </label>
                <select
                  value={websiteAvailability}
                  onChange={(e) => setWebsiteAvailability(e.target.value as any)}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                >
                  <option value="any">Any (All Businesses)</option>
                  <option value="no_website">No Website / Missing (Hot Leads for New Sites!)</option>
                  <option value="has_website">Has Website (For Modernization / Apps / AI)</option>
                </select>
              </div>

              {/* Max Leads */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Max Number of Leads
                </label>
                <select
                  value={maxLeads}
                  onChange={(e) => setMaxLeads(Number(e.target.value))}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                >
                  <option value={5}>5 Leads</option>
                  <option value={10}>10 Leads</option>
                  <option value={20}>20 Leads</option>
                  <option value={50}>50 Leads</option>
                </select>
              </div>

              {/* Submit CTA */}
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold shadow-glow-blue hover:opacity-95 transition disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Discovering Real Businesses...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>Search Genuine Businesses</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Services Required Checkboxes */}
            <div className="pt-2 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Services to Pitch / Offer
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SERVICES.map((srv) => {
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
          </form>

          {/* Search Error Banner */}
          {searchError && (
            <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Search Notice:</span> {searchError}
              </div>
            </div>
          )}

          {/* Automatic Fallback Notice Banner */}
          {fallbackNotice?.occurred && (
            <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-bold">Automatic Provider Fallback Active:</span>{' '}
                {fallbackNotice.primaryName} was unavailable ({fallbackNotice.reason || 'unreachable'}). This search used <strong>{fallbackNotice.fallbackName}</strong>.
              </div>
            </div>
          )}

          {/* Results Section */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-navy-900/80 border border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Discovered {results.length} Genuine Businesses</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Source: {results[0]?.source || 'Live Search'}. Contact details verified against public directories.
                  </p>
                </div>

                <button
                  onClick={handleSaveAllNonDuplicates}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-sm hover:opacity-95 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Import All Non-Duplicates to CRM</span>
                </button>
              </div>

              {/* Leads Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((lead, idx) => {
                  const isSaved = savedLeadsMap[resultKey(lead)];
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border border-slate-800 bg-navy-900/60 hover:border-slate-700 transition flex flex-col justify-between space-y-3.5"
                    >
                      <div className="space-y-2">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-white hover:text-electric-300 transition">
                              {lead.businessName}
                            </h4>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span>{lead.city ? `${lead.city}, ` : ''}{lead.country}</span>
                              <span>•</span>
                              <span className="text-slate-300 font-medium">{lead.industry}</span>
                            </div>
                            {/* Provider & Source Attribution */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-navy-950 text-slate-300 border border-slate-700/80 font-medium flex items-center gap-1">
                                <Compass className="h-2.5 w-2.5 text-electric-400" />
                                <span>{lead.providerName || lead.source}</span>
                              </span>
                              <span className="text-slate-500 truncate max-w-[240px]" title={lead.source}>
                                {lead.source}
                              </span>
                              {lead.osmObject && (
                                <a className="text-electric-400 hover:underline" href={`https://www.openstreetmap.org/${lead.osmObject.type}/${lead.osmObject.id}`} target="_blank" rel="noreferrer">
                                  View OSM object
                                </a>
                              )}
                            </div>
                            {lead.osmObject && lead.metadata?.coordinates && (
                              <p className="mt-1 text-[10px] text-slate-400">
                                Coordinates {lead.metadata.coordinates.lat}, {lead.metadata.coordinates.lon}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                lead.opportunityScore >= 85
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-blue-950 text-blue-300 border border-blue-800'
                              }`}
                            >
                              Score: {lead.opportunityScore}%
                            </span>

                            {lead.isDuplicate ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-950/60 text-amber-300 border border-amber-800/80 text-[10px] font-semibold">
                                Duplicate in CRM
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 text-[10px] font-semibold">
                                New Prospect
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Contact details row with explicit verification badges */}
                        <div className="space-y-2 bg-navy-950/70 p-2.5 rounded-xl border border-slate-800/80 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Website</span>
                                {lead.website ? (
                                  <span className="text-[9px] text-slate-400 font-bold">
                                    {lead.contactStatus?.websiteStatus === 'verified' ? 'Verified Site' : 'Listed website'}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-500 font-medium">Unavailable</span>
                                )}
                              </div>
                              {lead.website ? (
                                <a
                                  href={lead.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-electric-400 hover:underline flex items-center gap-1 truncate text-[11px]"
                                >
                                  <Globe2 className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                                  <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
                                </a>
                              ) : (
                                <span className="text-amber-400 font-medium text-[11px]">
                                  No website listed
                                </span>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Public Phone</span>
                                {lead.publicBusinessPhone ? (
                                  <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Verified
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-500 font-medium">Unavailable</span>
                                )}
                              </div>
                              <span className="text-slate-300 flex items-center gap-1 text-[11px] truncate">
                                <Phone className="h-3 w-3 text-slate-500 shrink-0" />
                                <span>{lead.publicBusinessPhone || 'Not publicly listed'}</span>
                              </span>
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-400 truncate max-w-[280px]">
                              <Mail className="h-3 w-3 text-slate-500 shrink-0" />
                              <span>Email:</span>
                              <span className={lead.businessEmail ? 'text-slate-200 truncate' : 'text-slate-500'}>
                                {lead.businessEmail || 'Not publicly listed'}
                              </span>
                            </div>
                            {lead.businessEmail ? (
                              <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5 shrink-0">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> Verified Email
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-500 font-medium shrink-0">Unavailable in directory</span>
                            )}
                          </div>
                        </div>

                        {/* Detected Problems */}
                        {lead.detectedProblems && lead.detectedProblems.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase">
                              Bottlenecks / Opportunities:
                            </span>
                            <ul className="text-xs text-slate-300 space-y-0.5 pl-3 list-disc">
                              {lead.detectedProblems.map((prob, pIdx) => (
                                <li key={pIdx} className="leading-snug">
                                  {prob}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Suggested Services */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {lead.suggestedServices.map((srv, sIdx) => (
                            <span
                              key={sIdx}
                              className="px-2 py-0.5 rounded-md bg-electric-500/10 text-electric-300 border border-electric-500/30 text-[10px] font-medium"
                            >
                              {srv}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                        <span className="text-[10px] text-slate-500">
                          {new Date(lead.discoveryDate).toLocaleDateString()}
                        </span>

                        <div className="flex items-center gap-2">
                          {lead.website && (
                            <button
                              onClick={() => onAuditUrl(lead.website!)}
                              title="Audit Website"
                              className="p-1.5 rounded-lg bg-navy-800 hover:bg-slate-700 text-cyan-400 transition"
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {onPitchLead && (
                            <button
                              onClick={() => onPitchLead(lead)}
                              title="Draft Pitch"
                              className="p-1.5 rounded-lg bg-navy-800 hover:bg-slate-700 text-violet-400 transition"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleSaveToCrm(lead)}
                            disabled={isSaved || lead.isDuplicate}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition text-xs ${
                              isSaved
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                : lead.isDuplicate
                                ? 'bg-navy-950 text-slate-500 border border-slate-800 cursor-not-allowed'
                                : 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-glow-blue hover:opacity-95'
                            }`}
                          >
                            {isSaved ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" />
                                <span>{lead.isDuplicate ? 'In CRM' : 'Save to CRM'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL DOMAIN INPUT FALLBACK */}
      {activeTab === 'manual' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-navy-900/60 border border-slate-800 flex items-start gap-3 text-xs">
            <Info className="h-4 w-4 text-electric-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Manual Domain & Website Verification Fallback:</span>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Inspect any genuine business URL or domain. The system respects robots.txt, measures page speed, checks mobile responsiveness, and extracts technical bottlenecks for your freelance pitch.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleManualInspect}
            className="p-5 rounded-2xl bg-navy-900/60 border border-slate-800 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Website URL or Domain <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualDomain}
                  onChange={(e) => setManualDomain(e.target.value)}
                  placeholder="https://examplecompany.com or examplecompany.com"
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Business Name (Optional)
                </label>
                <input
                  type="text"
                  value={manualBusinessName}
                  onChange={(e) => setManualBusinessName(e.target.value)}
                  placeholder="Leave empty to auto-extract from title"
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Country</label>
                <input
                  type="text"
                  value={manualCountry}
                  onChange={(e) => setManualCountry(e.target.value)}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">City</label>
                <input
                  type="text"
                  value={manualCity}
                  onChange={(e) => setManualCity(e.target.value)}
                  placeholder="e.g. Mumbai, Austin"
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Industry</label>
                <select
                  value={manualIndustry}
                  onChange={(e) => setManualIndustry(e.target.value)}
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-electric-500"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="submit"
                disabled={loading || !manualDomain.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold shadow-glow-blue hover:opacity-95 transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span>Inspect Website & Prepare Lead</span>
              </button>
            </div>
          </form>

          {/* Results if manual inspection triggered */}
          {results.length > 0 && (
            <div className="p-4 rounded-2xl bg-navy-900/80 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Inspection Result
              </h4>
              {results.map((lead, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-navy-950 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">{lead.businessName}</h4>
                      <p className="text-xs text-slate-400">{lead.website}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Score: {lead.opportunityScore}%
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1">
                    <span className="font-semibold text-slate-400 block">Detected Technical Findings:</span>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {lead.detectedProblems.map((prob, pIdx) => (
                        <li key={pIdx}>{prob}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleSaveToCrm(lead)}
                      disabled={savedLeadsMap[resultKey(lead)]}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold transition"
                    >
                      {savedLeadsMap[resultKey(lead)] ? 'Saved to CRM' : 'Save to CRM'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DISCOVERY HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Discovery History Log</h3>
              <p className="text-xs text-slate-400">
                Audit trail of discovery searches, target locations, providers, and genuine leads discovered.
              </p>
            </div>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh History</span>
            </button>
          </div>

          {historyList.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-navy-900/40 space-y-2">
              <History className="h-8 w-8 text-slate-600 mx-auto" />
              <h4 className="text-xs font-bold text-slate-300">No discovery searches logged yet</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Run a search across India or global markets in the Search & Filters tab to begin populating discovery history.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-navy-900/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-navy-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
                      <th className="py-3 px-4">Search Query</th>
                      <th className="py-3 px-4">Search Location</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-center">Leads Discovered</th>
                      <th className="py-3 px-4">Source Used</th>
                      <th className="py-3 px-4">Errors</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {historyList.map((item) => (
                      <tr key={item.id} className="hover:bg-navy-850/50 transition">
                        <td className="py-3.5 px-4 font-bold text-white">
                          {item.searchQuery}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {item.searchLocation || 'Global'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-electric-500/10 text-electric-300 border border-electric-500/30 text-[11px] font-black">
                            {item.leadsCount} leads
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          <Badge variant="service" size="xs">
                            {item.sourceUsed}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          {item.errors ? (
                            <span className="text-rose-400 text-[11px] line-clamp-1 max-w-[150px]" title={item.errors}>
                              {item.errors}
                            </span>
                          ) : (
                            <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                              <Check className="h-3 w-3" /> None
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            {item.results && item.results.length > 0 && (
                              <button
                                onClick={() => setSelectedHistoryItem(item)}
                                className="px-2 py-1 rounded bg-navy-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
                              >
                                View Leads
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteHistory(item.id)}
                              title="Delete search log"
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Leads Detail Modal */}
      {selectedHistoryItem && (
        <Modal
          isOpen={!!selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
          title={`Discovered Leads: ${selectedHistoryItem.searchQuery}`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
              <span>Location: <strong>{selectedHistoryItem.searchLocation}</strong></span>
              <span>Source: <strong>{selectedHistoryItem.sourceUsed}</strong></span>
              <span>Date: <strong>{new Date(selectedHistoryItem.createdAt).toLocaleString()}</strong></span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
              {(selectedHistoryItem.results || []).map((lead, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-800 bg-navy-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-white">{lead.businessName}</div>
                    <div className="text-slate-400 text-[11px]">
                      {lead.city ? `${lead.city}, ` : ''}{lead.country} • {lead.industry}
                    </div>
                    {lead.website && (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-electric-400 hover:underline flex items-center gap-1 text-[11px]"
                      >
                        <Globe2 className="h-3 w-3" />
                        <span>{lead.website}</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-navy-900 border border-slate-800 text-[10px] font-bold text-slate-300">
                      Score: {lead.opportunityScore}%
                    </span>
                    <button
                      onClick={() => handleSaveToCrm(lead)}
                      disabled={savedLeadsMap[resultKey(lead)]}
                      className="px-3 py-1.5 rounded-lg bg-electric-500 hover:bg-electric-400 text-white font-bold text-[11px] transition disabled:opacity-50"
                    >
                      {savedLeadsMap[resultKey(lead)] ? 'Saved' : 'Save to CRM'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="px-4 py-2 rounded-xl bg-navy-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
