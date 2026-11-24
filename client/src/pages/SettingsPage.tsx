import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Sparkles,
  ShieldCheck,
  Download,
  Globe,
  Sliders,
  Compass,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { ProviderConnection } from '../components/ProviderConnection';
import { ProviderReadinessPanel } from '../components/ProviderReadinessPanel';
import { BusinessKnowledgePanel } from '../components/BusinessKnowledgePanel';
import { IdealClientProfilesPanel } from '../components/IdealClientProfilesPanel';
import { HealthCheckResponse, Lead, ProviderStatus } from '../types';

interface SettingsPageProps {
  leads: Lead[];
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ leads }) => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [defaultProvider, setDefaultProvider] = useState(() => {
    const preferred = localStorage.getItem('preferred_discovery_provider');
    return preferred && preferred !== 'openstreetmap' ? preferred : 'overpass';
  });
  const [discoveryProviders, setDiscoveryProviders] = useState<ProviderStatus[]>([]);
  const [providerLoadFailed, setProviderLoadFailed] = useState(false);

  useEffect(() => {
    apiClient
      .getHealth()
      .then(setHealth)
      .catch((err) => console.error('Health error:', err));

    apiClient
      .getDiscoveryProviders(false)
      .then(setDiscoveryProviders)
      .catch(() => setProviderLoadFailed(true));
  }, []);

  const handleProviderChange = (newProviderId: string) => {
    setDefaultProvider(newProviderId);
    localStorage.setItem('preferred_discovery_provider', newProviderId);
  };

  const handleProviderStatus = (status: ProviderStatus) => {
    setDiscoveryProviders((previous) => previous.map((provider) => provider.id === status.id ? status : provider));
  };

  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(leads, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ai_client_hunter_leads_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-white tracking-tight">System & Profile Settings</h1>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 border border-slate-700">
            Preferences
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Manage your acquisition profile, database connections, and export CRM pipeline records.
        </p>
      </div>


      <ProviderReadinessPanel />
      <IdealClientProfilesPanel />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Freelancer Profile Form */}
        <div className="lg:col-span-7 space-y-5">
          <BusinessKnowledgePanel />

          {/* Lead Discovery Search Provider Settings Card */}
          <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Compass className="h-4 w-4 text-electric-400" />
              <span>Default Lead Discovery Provider</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Choose your primary search provider. If it fails, searches can fall back to another configured directory.
            </p>

            {providerLoadFailed && <p role="alert" className="text-xs text-rose-300">Could not load provider status. Refresh this page to try again.</p>}
            <div className="space-y-2.5" role="group" aria-label="Default discovery provider">
              {discoveryProviders.map((provider) => {
                const isSelected = defaultProvider === provider.id;
                return (
                  <article
                    key={provider.id}
                    className={`space-y-2.5 rounded-xl border p-3.5 transition ${
                      isSelected
                        ? 'border-electric-500/60 bg-electric-950/20 shadow-glow-blue'
                        : 'border-slate-800 bg-navy-950/60'
                    }`}
                  >
                    {provider.purpose === 'address_geocoding' ? <h3 className="text-xs font-bold text-white">{provider.name}</h3> : (
                    <label className={`flex items-start gap-2 ${provider.configured ? 'cursor-pointer' : ''}`}>
                      <input
                        type="radio"
                        name="default_provider"
                        checked={isSelected}
                        disabled={!provider.configured || provider.enabled === false}
                        onChange={() => handleProviderChange(provider.id)}
                        className="mt-0.5 accent-electric-500"
                      />
                      <span className="text-xs font-bold text-white">{provider.name}</span>
                    </label>
                    )}
                    <p className="text-[11px] text-slate-400">{provider.description}</p>
                    <ProviderConnection provider={provider} onStatus={handleProviderStatus} />
                  </article>
                );
              })}
            </div>
          </div>

          {/* Data Export Card */}
          <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Download className="h-4 w-4 text-emerald-400" />
              <span>Export CRM Data</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Export your entire database of leads, audit scores, and contact notes to JSON for backup or external CRM import.
            </p>
            <div className="pt-2">
              <button
                onClick={handleExportData}
                className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 border border-slate-700 px-4 py-2 text-xs font-bold text-white hover:bg-navy-750 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download {leads.length} Leads (JSON)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Infrastructure & Environment Status */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 pb-2 border-b border-slate-800">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <span>Infrastructure Diagnostics</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-navy-950 p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">PostgreSQL Status:</span>
                  <span className="text-emerald-400 font-extrabold">
                    {health?.checks?.database?.status || 'Unknown'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {health?.checks?.database?.engine || 'PostgreSQL with Prisma ORM'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-navy-950 p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Gemini AI Model:</span>
                  <span className="text-violet-400 font-extrabold">
                    {health?.checks?.geminiAi?.model || 'gemini-2.5-flash'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {!health ? 'Awaiting backend status' : health.checks?.geminiAi?.configured
                    ? 'Gemini API key configured'
                    : 'Local Synthesis Engine (Add GEMINI_API_KEY in .env)'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-navy-950 p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Environment:</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {health?.environment || 'development'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-bold text-slate-200">Backend Uptime:</span>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {health?.uptimeSeconds || 0}s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
