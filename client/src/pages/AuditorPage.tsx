import React, { useState, useEffect } from 'react';
import {
  SearchCode,
  Zap,
  Globe2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Sparkles,
  Lock,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  Mail,
  Phone,
  MessageSquare,
  Share2,
  Layers,
  FileCode,
  Eye,
  TrendingUp,
  Cpu,
  BarChart3,
  ShieldCheck,
  Compass,
} from 'lucide-react';
import { AuditReport, Lead, WebsiteEvidence, WebsiteAnalysisResult } from '../types';
import { apiClient } from '../api/client';

interface AuditorPageProps {
  initialUrl?: string;
  initialLeadId?: string;
  leads: Lead[];
  onGeneratePitchFromAudit: (audit: AuditReport) => void;
  onAuditCompleted: () => void;
}

export const AuditorPage: React.FC<AuditorPageProps> = ({
  initialUrl = '',
  initialLeadId = '',
  leads,
  onGeneratePitchFromAudit,
  onAuditCompleted,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [audit, setAudit] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'evidence'>('ai');

  useEffect(() => {
    setUrl(initialUrl);
    setSelectedLeadId(initialLeadId);
    setAudit(null);
  }, [initialUrl, initialLeadId]);

  // Handle stage animation during audit execution
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      setLoadingStage(1);
      timer = setInterval(() => {
        setLoadingStage((prev) => (prev < 5 ? prev + 1 : prev));
      }, 1200);
    } else {
      setLoadingStage(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const validateUrlInput = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return 'Please enter a website URL.';

    const lower = trimmed.toLowerCase();
    if (
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('0.0.0.0') ||
      lower.includes('169.254.') ||
      lower.includes('192.168.') ||
      lower.includes('10.') ||
      lower.includes('::1')
    ) {
      return 'Security block: Localhost, loopback, and private IP subnets are prohibited by SSRF security rules. Please enter a public business website.';
    }

    return null;
  };

  const handleRunAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUrlInput(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const selectedLead = leads.find((l) => l.id === selectedLeadId);
      const report = await apiClient.auditWebsite({
        websiteUrl: url.trim(),
        companyName: selectedLead?.businessName || selectedLead?.companyName,
        leadId: selectedLeadId || undefined,
        targetServices: selectedLead?.suggestedServices || selectedLead?.services,
      });

      // Hydrate evidence and analysis from rawData if top-level fields are nested
      const hydratedReport: AuditReport = {
        ...report,
        evidence: report.evidence || (report.rawData as any)?.evidence,
        analysis: report.analysis || (report.rawData as any)?.analysis,
      };

      setAudit(hydratedReport);
      if (selectedLeadId) onAuditCompleted();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Audit analysis failed. Please verify that the website is publicly accessible.'
      );
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20';
    if (score >= 60) return 'text-amber-400 border-amber-500/40 bg-amber-950/20';
    return 'text-rose-400 border-rose-500/40 bg-rose-950/20';
  };

  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'high':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'opportunity':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600/30';
    }
  };

  const evidence: WebsiteEvidence | undefined =
    audit?.evidence || (audit?.rawData as any)?.evidence;
  const analysis: WebsiteAnalysisResult | undefined =
    audit?.analysis || (audit?.rawData as any)?.analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold text-white">Website Analyzer</h1>
              <span className="rounded-md bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-bold text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                SSRF-Safe + Gemini Grounded
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 max-w-2xl">
              Safely inspects public business websites for HTTPS, mobile viewport, headings,
              contact channels, SEO metadata, and measurable performance signals. Synthesizes
              evidence-backed opportunities and first-contact proposals.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>Strict SSRF Defense & DNS Protection</span>
          </div>
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleRunAudit}
        className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-4 shadow-xl"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Public Business Website URL
            </label>
            <div className="relative">
              <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://client-company.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Attach to CRM Lead (Optional)
            </label>
            <select
              value={selectedLeadId}
              onChange={(e) => {
                setSelectedLeadId(e.target.value);
                const lead = leads.find((l) => l.id === e.target.value);
                if (lead?.website) setUrl(lead.website);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none transition"
            >
              <option value="">None (Independent Public Audit)</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.businessName || l.companyName} ({l.country || 'Global'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Testing Samples */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Compass className="h-3 w-3 text-slate-500" /> Quick test presets:
          </span>
          {[
            { label: 'Example.com', testUrl: 'https://example.com' },
            { label: 'Stripe.com', testUrl: 'https://stripe.com' },
            { label: 'Hacker News', testUrl: 'https://news.ycombinator.com' },
          ].map((preset) => (
            <button
              key={preset.testUrl}
              type="button"
              onClick={() => setUrl(preset.testUrl)}
              className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Action Button & Loading Stages */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="text-[11px] text-slate-400">
            {loading ? (
              <div className="flex items-center gap-2 text-indigo-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                <span>
                  {loadingStage === 1 && 'Resolving DNS and checking SSRF security boundaries...'}
                  {loadingStage === 2 && 'Safely fetching publicly accessible DOM and headers...'}
                  {loadingStage === 3 && 'Inspecting title, viewport, headings and navigation...'}
                  {loadingStage === 4 && 'Detecting contact channels, link graph, and asset performance...'}
                  {loadingStage >= 5 && 'Synthesizing evidence with Gemini AI and generating pitch...'}
                </span>
              </div>
            ) : (
              <span>Only public domains are queried. Localhost and private subnets are blocked.</span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Running Audit...</span>
              </>
            ) : (
              <>
                <SearchCode className="h-4 w-4" />
                <span>Analyze Public Website</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error Alert */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300 flex items-start gap-3 shadow-lg">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-rose-200">Analysis Halted</div>
            <p className="leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* AUDIT REPORT VIEW */}
      {(audit?.analysis as { isFallback?: boolean } | undefined)?.isFallback && (
        <p role="status" className="text-xs text-amber-300">Local evidence-based analysis used.</p>
      )}
      {audit && (
        <div className="space-y-6">
          {/* Top Scorecard Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Overall Score */}
            <div
              className={`rounded-2xl border p-5 flex items-center justify-between shadow-lg ${getScoreColor(
                audit.overallScore
              )}`}
            >
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  Tech Opportunity Score
                </div>
                <div className="mt-1 text-3xl font-extrabold">{audit.overallScore} / 100</div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  {audit.overallScore >= 80
                    ? 'Solid digital foundation'
                    : audit.overallScore >= 60
                    ? 'Clear optimization potential'
                    : 'Significant development upside'}
                </div>
              </div>
              <Sparkles className="h-8 w-8 opacity-60" />
            </div>

            {/* Speed & Latency */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex items-center justify-between shadow-lg">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Speed Heuristic
                </div>
                <div className="mt-1 text-2xl font-extrabold text-white">
                  {audit.speedScore} / 100
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-amber-400" />
                  <span>{evidence?.loadTimeMs ?? 0}ms load latency</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Zap className="h-5 w-5" />
              </div>
            </div>

            {/* Mobile Viewport */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex items-center justify-between shadow-lg">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Mobile Viewport
                </div>
                <div className="mt-1 text-lg font-bold text-white flex items-center gap-2">
                  {evidence?.isResponsiveReady ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      <span>Responsive</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                      <span>Missing Viewport</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {evidence?.hasDeviceWidth ? 'width=device-width active' : 'Non-mobile scale'}
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Smartphone className="h-5 w-5" />
              </div>
            </div>

            {/* HTTPS Security */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex items-center justify-between shadow-lg">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Protocol & SSL
                </div>
                <div className="mt-1 text-lg font-bold text-white flex items-center gap-2">
                  {evidence?.isHttps ? (
                    <>
                      <Lock className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>HTTPS Enabled</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                      <span>Insecure HTTP</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  HTTP Status {evidence?.statusCode ?? 200} OK
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Lock className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Navigation Tabs (AI Analysis vs Measured Technical Evidence) */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'ai'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>AI Strategic Analysis & Outreach</span>
            </button>
            <button
              onClick={() => setActiveTab('evidence')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'evidence'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>9-Point Measured Technical Evidence</span>
            </button>
          </div>

          {/* TAB 1: AI STRATEGIC ANALYSIS & OUTREACH */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Executive Summary */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <Lightbulb className="h-4 w-4" />
                  <span>Executive Website Summary</span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {analysis?.websiteSummary || audit.summary}
                </p>
              </div>

              {/* Personalised First-Contact Suggestion */}
              {(() => {
                const fc = analysis?.firstContactSuggestion || analysis?.personalizedFirstContact;
                if (!fc) return null;
                const channelName = fc.recommendedChannel || fc.channel || 'Cold Email';
                const subject = fc.subjectLine || `Technical observation regarding ${audit.websiteUrl}`;
                const hook = fc.openingHook || audit.pitchHooks?.[0] || '';
                const msg = fc.messageDraft || fc.fullMessage || '';
                const reason = fc.reasoning || 'Based on measured performance and technical profile';

                return (
                  <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/30 to-indigo-950/20 p-5 sm:p-6 space-y-4 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-violet-500/20 pb-3">
                      <div className="flex items-center gap-2 text-violet-300 font-bold text-sm">
                        <MessageSquare className="h-4 w-4 text-violet-400" />
                        <span>Personalised First-Contact Proposal</span>
                        <span className="rounded-md bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300 border border-violet-500/30">
                          {channelName}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        Reason: {reason}
                      </div>
                    </div>

                    {subject && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-semibold text-slate-300">Subject Line:</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(subject, 'subject')}
                            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                          >
                            {copiedKey === 'subject' ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>Copy Subject</span>
                          </button>
                        </div>
                        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs font-medium text-slate-200">
                          {subject}
                        </div>
                      </div>
                    )}

                    {hook && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-semibold text-slate-300">Opening Hook:</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(hook, 'hook')}
                            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                          >
                            {copiedKey === 'hook' ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>Copy Hook</span>
                          </button>
                        </div>
                        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs italic text-violet-200">
                          "{hook}"
                        </div>
                      </div>
                    )}

                    {msg && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-semibold text-slate-300">Complete Message Draft:</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(msg, 'message')}
                            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                          >
                            {copiedKey === 'message' ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>Copy Full Message</span>
                          </button>
                        </div>
                        <pre className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {msg}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Recommended Services to Offer */}
              {analysis?.servicesOffered && analysis.servicesOffered.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                    <Cpu className="h-4 w-4" />
                    <span>Freelance Services to Offer (From My 6 Core Offerings)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.servicesOffered.map((svc, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 hover:border-slate-700 transition"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-white">{svc.service}</h4>
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 shrink-0">
                            {svc.estimatedBudgetRange || svc.scopeOfWork || 'Custom Quote'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {svc.rationale || svc.reason}
                        </p>
                        <div className="pt-2 border-t border-slate-900 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Eye className="h-3 w-3 text-indigo-400 shrink-0" />
                          <span className="italic">
                            Evidence: {svc.evidence || 'Empirical technical scan'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Business Opportunities */}
              {analysis?.businessOpportunities && analysis.businessOpportunities.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4" />
                    <span>Potential Business Opportunities & Commercial Upside</span>
                  </div>

                  <div className="space-y-3">
                    {analysis.businessOpportunities.map((opp, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <span>{opp.title || opp.opportunity}</span>
                          </div>
                          {(opp.estimatedImpact || opp.potentialValue) && (
                            <span className="text-[11px] font-semibold text-emerald-400">
                              Impact: {opp.estimatedImpact || opp.potentialValue}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 pl-7 leading-relaxed">
                          {opp.description || opp.rationale}
                        </p>
                        <div className="pl-7 pt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                          <span className="italic">
                            Evidence: {opp.evidence || 'Observed in public website architecture'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4 Quadrants: Design, Mobile, SEO, Missing Features */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Design Improvements */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                    <Layers className="h-4 w-4" />
                    <span>Design & UI/UX Improvements</span>
                  </div>
                  <div className="space-y-2.5">
                    {analysis?.designImprovements && analysis.designImprovements.length > 0 ? (
                      analysis.designImprovements.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-200">
                              {item.title || item.issue}
                            </span>
                            {item.severity && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${getSeverityBadge(
                                  item.severity
                                )}`}
                              >
                                {item.severity}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {item.description || item.recommendation}
                          </p>
                          <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-900">
                            Evidence: {item.evidence}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        No major visual defects detected in static analysis.
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile Experience Issues */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                    <Smartphone className="h-4 w-4" />
                    <span>Mobile Experience Issues</span>
                  </div>
                  <div className="space-y-2.5">
                    {analysis?.mobileExperienceIssues &&
                    analysis.mobileExperienceIssues.length > 0 ? (
                      analysis.mobileExperienceIssues.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-200">
                              {item.title || item.issue}
                            </span>
                            {item.severity && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${getSeverityBadge(
                                  item.severity
                                )}`}
                              >
                                {item.severity}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {item.description || item.recommendation}
                          </p>
                          <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-900">
                            Evidence: {item.evidence}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        Mobile viewport meta tag is properly configured.
                      </div>
                    )}
                  </div>
                </div>

                {/* SEO Issues */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <Globe2 className="h-4 w-4" />
                    <span>SEO & Metadata Issues</span>
                  </div>
                  <div className="space-y-2.5">
                    {analysis?.seoIssues && analysis.seoIssues.length > 0 ? (
                      analysis.seoIssues.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-200">
                              {item.title || item.issue}
                            </span>
                            {item.severity && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${getSeverityBadge(
                                  item.severity
                                )}`}
                              >
                                {item.severity}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {item.description || item.recommendation}
                          </p>
                          <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-900">
                            Evidence: {item.evidence}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        Title tag and meta descriptions meet basic guidelines.
                      </div>
                    )}
                  </div>
                </div>

                {/* Possible Missing Features */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
                    <Lightbulb className="h-4 w-4" />
                    <span>Possible Missing Features (Upsell Opportunities)</span>
                  </div>
                  <div className="space-y-2.5">
                    {analysis?.missingFeatures && analysis.missingFeatures.length > 0 ? (
                      analysis.missingFeatures.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-200">
                              {item.title || item.feature}
                            </span>
                            {item.severity && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${getSeverityBadge(
                                  item.severity
                                )}`}
                              >
                                {item.severity}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {item.description || item.businessImpact}
                          </p>
                          <div className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-900">
                            Evidence: {item.evidence}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        Standard feature set detected.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 9-POINT MEASURED TECHNICAL EVIDENCE */}
          {activeTab === 'evidence' && evidence && (
            <div className="space-y-6">
              {/* Evidence Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Protocol & Network */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <Lock className="h-4 w-4" />
                    <span>1. Protocol & Network</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">HTTPS Protocol</span>
                      <span
                        className={`font-semibold ${
                          evidence.isHttps ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {evidence.isHttps ? 'Enabled (SSL Active)' : 'Disabled (Insecure HTTP)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">HTTP Status</span>
                      <span className="font-semibold text-white">{evidence.statusCode} OK</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">HTML Payload Size</span>
                      <span className="font-semibold text-white">{evidence.htmlSizeKb} KB</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Measured Load Latency</span>
                      <span className="font-semibold text-amber-400">{evidence.loadTimeMs} ms</span>
                    </div>
                  </div>
                </div>

                {/* 2. Page Title & Meta Description */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                    <FileCode className="h-4 w-4" />
                    <span>2. Title & Meta Description</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Title ({evidence.pageTitleLength} chars)</span>
                        <span
                          className={`font-semibold ${
                            evidence.pageTitleStatus === 'optimal'
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {evidence.pageTitleStatus}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/60 text-slate-300 font-mono text-[11px] truncate">
                        {evidence.pageTitle || '(Missing <title>)'}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Meta Description ({evidence.metaDescriptionLength} chars)</span>
                        <span
                          className={`font-semibold ${
                            evidence.metaDescriptionStatus === 'optimal'
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {evidence.metaDescriptionStatus}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/60 text-slate-300 font-mono text-[11px] line-clamp-2">
                        {evidence.metaDescription || '(Missing meta description)'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Mobile Viewport */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-400 uppercase tracking-wider">
                    <Smartphone className="h-4 w-4" />
                    <span>3. Mobile Viewport</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Viewport Tag</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasViewport ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {evidence.hasViewport ? 'Present' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">width=device-width</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasDeviceWidth ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {evidence.hasDeviceWidth ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">initial-scale=1</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasInitialScale ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {evidence.hasInitialScale ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      Content: {evidence.viewportContent || 'None'}
                    </div>
                  </div>
                </div>

                {/* 4. Headings & Hierarchy */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                    <Layers className="h-4 w-4" />
                    <span>4. Headings & Hierarchy</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">H1 Tag Count</span>
                      <span
                        className={`font-semibold ${
                          evidence.h1Count === 1 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {evidence.h1Count} {evidence.h1Count === 1 ? '(Optimal)' : '(Non-standard)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">H2 Subheadings</span>
                      <span className="font-semibold text-white">{evidence.h2Count} found</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">H3 Subheadings</span>
                      <span className="font-semibold text-white">{evidence.h3Count} found</span>
                    </div>
                    {evidence.h1List && evidence.h1List.length > 0 && (
                      <div className="text-[11px] text-slate-400 truncate">
                        Primary H1: "{evidence.h1List[0]}"
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Visible Contact Channels */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <Mail className="h-4 w-4" />
                    <span>5. Visible Contact Channels</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Public Emails</span>
                      <span className="font-semibold text-white">
                        {evidence.emailsFound?.length > 0
                          ? evidence.emailsFound.join(', ')
                          : 'None detected'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Public Phones</span>
                      <span className="font-semibold text-white">
                        {evidence.phonesFound?.length > 0
                          ? evidence.phonesFound.join(', ')
                          : 'None detected'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Contact Form</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasContactForm ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {evidence.hasContactForm ? 'Detected' : 'Not detected'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">WhatsApp Link</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasWhatsApp ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {evidence.hasWhatsApp ? 'Detected' : 'Not detected'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Navigation & Links */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    <Share2 className="h-4 w-4" />
                    <span>6. Navigation & Links</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Main Navigation</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasNavigation ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {evidence.hasNavigation ? 'Present' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Internal Links</span>
                      <span className="font-semibold text-white">{evidence.internalLinksCount}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">External Links</span>
                      <span className="font-semibold text-white">{evidence.externalLinksCount}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Empty / Broken Anchors</span>
                      <span
                        className={`font-semibold ${
                          evidence.emptyLinksCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {evidence.emptyLinksCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7. Page Structure Semantics */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-400 uppercase tracking-wider">
                    <Layers className="h-4 w-4" />
                    <span>7. HTML5 Semantic Landmarks</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: '<header>', present: evidence.pageStructure?.hasHeader },
                      { label: '<main>', present: evidence.pageStructure?.hasMain },
                      { label: '<footer>', present: evidence.pageStructure?.hasFooter },
                      { label: '<section>', present: evidence.pageStructure?.hasSection },
                      { label: '<article>', present: evidence.pageStructure?.hasArticle },
                      { label: '<aside>', present: evidence.pageStructure?.hasAside },
                    ].map((landmark) => (
                      <div
                        key={landmark.label}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80"
                      >
                        <span className="font-mono text-slate-300">{landmark.label}</span>
                        {landmark.present ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-slate-600" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 8. Accessibility & Assets */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
                    <Eye className="h-4 w-4" />
                    <span>8. Accessibility & Assets</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Total Images</span>
                      <span className="font-semibold text-white">{evidence.totalImagesCount}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Images Missing alt</span>
                      <span
                        className={`font-semibold ${
                          evidence.imagesMissingAltCount > 0
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {evidence.imagesMissingAltCount} missing
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">&lt;html lang&gt; Attribute</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasHtmlLang ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {evidence.hasHtmlLang ? evidence.htmlLangValue : 'Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">ARIA Attributes Found</span>
                      <span
                        className={`font-semibold ${
                          evidence.hasAriaAttributes ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {evidence.hasAriaAttributes ? 'Yes' : 'None detected'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 9. Detected Tech Stack */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-400 uppercase tracking-wider">
                    <Cpu className="h-4 w-4" />
                    <span>9. Detected Tech Stack</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {evidence.detectedTech && evidence.detectedTech.length > 0 ? (
                        evidence.detectedTech.map((tech, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-xs font-semibold text-indigo-300"
                          >
                            {tech}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Standard web architecture</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span>External Script Tags:</span>
                        <span className="text-white font-medium">
                          {evidence.externalScriptsCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>External Stylesheets:</span>
                        <span className="text-white font-medium">{evidence.stylesheetCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action: Create Pitch */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              Findings saved to PostgreSQL / CRM. Use this intelligence directly in your pitch.
            </div>

            <button
              onClick={() => onGeneratePitchFromAudit(audit)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-3 text-xs font-bold transition shadow-lg shadow-emerald-600/30"
            >
              <Sparkles className="h-4 w-4" />
              <span>Draft Pitch in AI Outreach Studio</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
