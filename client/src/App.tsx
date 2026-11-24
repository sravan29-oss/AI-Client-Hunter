import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, SidebarTab } from './components/Sidebar';
import { NewLeadModal } from './components/NewLeadModal';
import { ApiError, apiClient, sessionToken } from './api/client';
import { Lead, AnalyticsData, AuditReport } from './types';
import type { GrowthSelection } from './types/businessGrowth';
import type { OutreachCampaign } from './types/engagement';

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((page) => ({ default: page.AnalyticsPage })));
const BusinessIntelligence = lazy(() => import('./components/BusinessIntelligence').then((page) => ({ default: page.BusinessIntelligence })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((page) => ({ default: page.DashboardPage })));
const DiscoveryPage = lazy(() => import('./pages/DiscoveryPage').then((page) => ({ default: page.DiscoveryPage })));
const CrmPage = lazy(() => import('./pages/CrmPage').then((page) => ({ default: page.CrmPage })));
const AuditorPage = lazy(() => import('./pages/AuditorPage').then((page) => ({ default: page.AuditorPage })));
const PitchStudioPage = lazy(() => import('./pages/PitchStudioPage').then((page) => ({ default: page.PitchStudioPage })));
const FollowupsPage = lazy(() => import('./pages/FollowupsPage').then((page) => ({ default: page.FollowupsPage })));
const EngagementPage = lazy(() => import('./pages/EngagementPage').then((page) => ({ default: page.EngagementPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((page) => ({ default: page.ProjectsPage })));
const AutomationPage = lazy(() => import('./pages/AutomationPage').then((page) => ({ default: page.AutomationPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((page) => ({ default: page.SettingsPage })));

export function App() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const connect = async (token?: string) => {
    setChecking(true);
    setError('');
    try {
      await apiClient.checkSession(token);
      if (token) sessionToken.save(token);
      setKey('');
      setReady(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        sessionToken.clear();
        setNeedsKey(true);
        if (token) setError(err.message);
      } else {
        setError('The server is unavailable. Try connecting again.');
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void connect();
  }, []);

  if (ready) {
    return <Workspace onSignOut={sessionToken.read() ? () => {
      sessionToken.clear();
      setReady(false);
      setNeedsKey(true);
    } : undefined} />;
  }

  return (
    <main className="min-h-screen grid place-items-center bg-navy-950 p-5 text-slate-100">
      <form
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-navy-900 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void connect(needsKey ? key.trim() : undefined);
        }}
      >
        <h1 className="text-xl font-bold">AI Client Hunter</h1>
        {needsKey && (
          <label className="block space-y-2 text-sm">
            <span>Workspace API key</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2"
            />
          </label>
        )}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={checking || (needsKey && !key.trim())}
          className="w-full rounded-xl bg-electric-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {checking ? 'Connecting…' : needsKey ? 'Open workspace' : 'Try again'}
        </button>
      </form>
    </main>
  );
}

function Workspace({ onSignOut }: { onSignOut?: () => void }) {
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => new URLSearchParams(window.location.search).has('lead') ? 'leads' : 'overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [showAllTime, setShowAllTime] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [growthSelection, setGrowthSelection] = useState<GrowthSelection>({ range: 'last30' });
  const [growthRevision, setGrowthRevision] = useState(0);
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [auditTargetUrl, setAuditTargetUrl] = useState<string>('');
  const [auditLeadId, setAuditLeadId] = useState('');
  const [notificationLeadId, setNotificationLeadId] = useState(() => new URLSearchParams(window.location.search).get('lead') || '');
  const clearNotificationLead = useCallback(() => {
    setNotificationLeadId('');
    const url = new URL(window.location.href);
    if (url.searchParams.has('lead')) {
      url.searchParams.delete('lead');
      window.history.replaceState(null, '', url);
    }
  }, []);
  const [pitchTargetLead, setPitchTargetLead] = useState<Lead | null>(null);
  const [pitchCampaign, setPitchCampaign] = useState<OutreachCampaign | null>(null);
  const [savedPitchId, setSavedPitchId] = useState('');
  const [engagementLeadId, setEngagementLeadId] = useState('');
  const [quoteLeadId, setQuoteLeadId] = useState('');
  const [followUpLeadId, setFollowUpLeadId] = useState('');

  function openLead(id: string) {
    setNotificationLeadId(id);
    setActiveTab('leads');
  }

  const fetchLeadsAndAnalytics = async () => {
    setGrowthRevision((revision) => revision + 1);
    try {
      const leadsRes = await apiClient.getLeads();
      setLeads(leadsRes.data || []);
    } catch (err) {
      console.error('Failed to load leads:', err);
    }
  };

  useEffect(() => {
    fetchLeadsAndAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab !== 'analytics' || !showAllTime) return;
    let active = true;
    setAnalytics(null);
    setAnalyticsError('');
    apiClient.getAnalytics().then((data) => { if (active) setAnalytics(data); })
      .catch((error: Error) => { if (active) setAnalyticsError(error.message); });
    return () => { active = false; };
  }, [activeTab, showAllTime, growthRevision]);

  const handleAuditUrl = (url: string) => {
    setAuditTargetUrl(url);
    setAuditLeadId('');
    setActiveTab('analyzer');
  };

  const handleAuditLead = (lead: Lead) => {
    setAuditTargetUrl(lead.website || lead.websiteUrl || '');
    setAuditLeadId(lead.id);
    setActiveTab('analyzer');
  };

  const handlePitchLead = (lead: Lead) => {
    setPitchCampaign(null);
    setSavedPitchId('');
    setPitchTargetLead(lead);
    setActiveTab('outreach');
  };

  const handleGeneratePitchFromAudit = (audit: AuditReport) => {
    setPitchCampaign(null);
    setSavedPitchId('');
    const linkedLead = audit.leadId ? leads.find((l) => l.id === audit.leadId) : null;
    if (linkedLead) {
      setPitchTargetLead({
        ...linkedLead,
        audits: [audit, ...(linkedLead.audits || []).filter((item) => item.id !== audit.id)],
        detectedProblems: Array.from(new Set([...audit.uiUxIssues, ...linkedLead.detectedProblems])),
      });
    } else {
      const name = audit.websiteUrl.replace(/https?:\/\//, '').split('/')[0];
      setPitchTargetLead({
        id: '',
        businessName: name,
        companyName: name,
        website: audit.websiteUrl,
        websiteUrl: audit.websiteUrl,
        country: 'India',
        region: 'INDIA',
        industry: 'Technology',
        leadStatus: 'Analysed',
        status: 'Analysed',
        estimatedValue: 65000,
        currency: 'INR',
        opportunityScore: audit.overallScore || 75,
        priority: 'MEDIUM',
        source: 'Website Audit',
        suggestedServices: ['Business website'],
        services: ['Business website'],
        detectedProblems: audit.uiUxIssues || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        audits: [audit],
      });
    }
    setActiveTab('outreach');
  };

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navbar */}
      <Navbar
        onOpenNewLead={() => setIsNewLeadOpen(true)}
        onToggleMobileSidebar={() => setMobileMenuOpen(!mobileMenuOpen)}
        mobileMenuOpen={mobileMenuOpen}
        onSignOut={onSignOut}
        onSelectLead={openLead}
      />

      {/* Main App Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            setQuoteLeadId('');
            setFollowUpLeadId('');
            setEngagementLeadId('');
            setPitchCampaign(null);
            setSavedPitchId('');
            setShowAllTime(false);
            setActiveTab(tab);
          }}
          leadCount={leads.length}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Dynamic Main Workspace Area */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#070b14]/90">
          <Suspense fallback={<p className="mx-auto max-w-7xl text-sm text-slate-400">Loading…</p>}>
            <div className="max-w-7xl mx-auto">
            {activeTab === 'find-clients' && (
              <DiscoveryPage
                onLeadAdded={fetchLeadsAndAnalytics}
                onAuditUrl={handleAuditUrl}
              />
            )}

            {activeTab === 'leads' && (
              <CrmPage
                leads={leads}
                notificationLeadId={notificationLeadId}
                onClearNotificationLead={clearNotificationLead}
                onRefreshLeads={fetchLeadsAndAnalytics}
                onOpenNewLead={() => setIsNewLeadOpen(true)}
                onAuditLead={handleAuditLead}
                onPitchLead={handlePitchLead}
                onQuoteLead={(lead) => { setQuoteLeadId(lead.id); setActiveTab('projects'); }}
                onFollowUpLead={(lead) => { setFollowUpLeadId(lead.id); setActiveTab('followups'); }}
                onEngagementLead={(lead) => { setEngagementLeadId(lead.id); setActiveTab('engagement'); }}
              />
            )}

            {activeTab === 'analyzer' && (
              <AuditorPage
                initialUrl={auditTargetUrl}
                initialLeadId={auditLeadId}
                leads={leads}
                onGeneratePitchFromAudit={handleGeneratePitchFromAudit}
                onAuditCompleted={fetchLeadsAndAnalytics}
              />
            )}

            {activeTab === 'outreach' && (
              <PitchStudioPage
                initialLead={pitchTargetLead}
                campaign={pitchCampaign}
                initialPitchId={savedPitchId}
                leads={leads}
                onPitchUpdated={fetchLeadsAndAnalytics}
              />
            )}

            {activeTab === 'engagement' && <EngagementPage
              leads={leads}
              initialLeadId={engagementLeadId}
              onOpenLead={openLead}
              onFollowUp={(leadId) => { setFollowUpLeadId(leadId); setActiveTab('followups'); }}
              onDraft={(leadId, campaign) => {
                const lead = leads.find((item) => item.id === leadId);
                if (!lead) return;
                setPitchTargetLead(lead);
                setPitchCampaign(campaign);
                setSavedPitchId('');
                setActiveTab('outreach');
              }}
              onOpenDraft={(pitchId) => {
                setSavedPitchId(pitchId);
                setPitchTargetLead(null);
                setPitchCampaign(null);
                setActiveTab('outreach');
              }}
              onUpdated={fetchLeadsAndAnalytics}
            />}

            {activeTab === 'followups' && (
              <FollowupsPage
                leads={leads}
                initialLeadId={followUpLeadId}
                onOpenLead={openLead}
                onRefreshLeads={fetchLeadsAndAnalytics}
              />
            )}

            {activeTab === 'projects' && (
              <ProjectsPage
                leads={leads}
                initialLeadId={quoteLeadId}
                onOpenLead={openLead}
                onRefreshLeads={fetchLeadsAndAnalytics}
              />
            )}

              {activeTab === 'overview' && (
                <DashboardPage
                  selection={growthSelection}
                  onSelection={setGrowthSelection}
                  revision={growthRevision}
                  onOpenBusinessIntelligence={() => { setShowAllTime(false); setActiveTab('analytics'); }}
                  leads={leads}
                  onNavigate={setActiveTab}
                  onAuditLead={handleAuditLead}
                  onPitchLead={handlePitchLead}
                  onOpenNewLead={() => setIsNewLeadOpen(true)}
                />
              )}
              {activeTab === 'analytics' && (showAllTime ? (
                <div className="space-y-5">
                  <button type="button" onClick={() => setShowAllTime(false)}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-electric-300">
                    Back to Business Intelligence
                  </button>
                  {analytics ? <AnalyticsPage analytics={analytics} />
                    : analyticsError ? <p role="alert" className="text-sm text-rose-300">{analyticsError}</p>
                    : <p role="status" className="text-sm text-slate-300">Loading all-time analytics…</p>}
                </div>
              ) : <BusinessIntelligence selection={growthSelection} onSelection={setGrowthSelection} revision={growthRevision}
                onNavigate={setActiveTab} onAlternate={() => setShowAllTime(true)} onOpenLead={openLead} />)}

            {activeTab === 'automation' && (
              <AutomationPage
                onLeadAdded={fetchLeadsAndAnalytics}
                onAuditUrl={handleAuditUrl}
                onPitchLead={handlePitchLead}
              />
            )}

            {activeTab === 'settings' && <SettingsPage leads={leads} />}
            </div>
          </Suspense>
        </main>
      </div>

      {/* New Lead Modal Dialog */}
      <NewLeadModal
        isOpen={isNewLeadOpen}
        onClose={() => setIsNewLeadOpen(false)}
        onLeadCreated={fetchLeadsAndAnalytics}
      />
    </div>
  );
}

export default App;
