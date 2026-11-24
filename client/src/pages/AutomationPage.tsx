import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Square,
  Clock,
  Calendar,
  Compass,
  Bell,
  Mail,
  Send,
  Download,
  RefreshCw,
  Check,
  AlertTriangle,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  FileText,
  Activity,
} from 'lucide-react';
import { apiClient } from '../api/client';
import {
  SchedulerConfig,
  SchedulerStatus,
  AutoHunterLogItem,
  DailyReportItem,
  Lead,
} from '../types';

interface AutomationPageProps {
  onLeadAdded?: () => void;
  onAuditUrl?: (url: string) => void;
  onPitchLead?: (lead: Lead) => void;
}

const AVAILABLE_COUNTRIES = ['India', 'United States', 'United Kingdom', 'Europe', 'Canada', 'Australia'];

const AVAILABLE_INDUSTRIES = [
  'Restaurants',
  'Hotels',
  'Offices',
  'Retail shops',
  'Healthcare',
  'Real estate',
  'Education',
  'E-commerce',
  'Travel',
  'Professional services',
  'Startups',
  'Local businesses',
];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +5:30)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT -5/-4)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT -8/-7)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST +0/+1)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST +1/+2)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

export const AutomationPage: React.FC<AutomationPageProps> = ({ onLeadAdded }) => {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [runLocation, setRunLocation] = useState('');
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [logs, setLogs] = useState<AutoHunterLogItem[]>([]);
  const [reports, setReports] = useState<DailyReportItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'scheduler' | 'reports' | 'logs'>('scheduler');

  const [loading, setLoading] = useState(true);
  const [runningCycle, setRunningCycle] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [enabled, setEnabled] = useState(false);
  const [changingSchedule, setChangingSchedule] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'DAILY' | 'WEEKLY' | 'MANUAL'>('DAILY');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [targetCountries, setTargetCountries] = useState<string[]>(['India', 'United States', 'United Kingdom', 'Europe']);
  const [targetIndustries, setTargetIndustries] = useState<string[]>(['Restaurants', 'Retail shops', 'Healthcare', 'E-commerce', 'Startups']);
  const [targetCities, setTargetCities] = useState<string>('Bengaluru, Mumbai, Delhi, New York, London');
  const [minOpportunityScore, setMinOpportunityScore] = useState(60);
  const [maxLeadsPerRun, setMaxLeadsPerRun] = useState(10);
  const [preferredProvider, setPreferredProvider] = useState('overpass');
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyTelegram, setNotifyTelegram] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  const loadAllData = async () => {
    try {
      const [statusRes, configRes, logsRes, reportsRes] = await Promise.all([
        apiClient.getAutomationStatus(),
        apiClient.getAutomationConfig(),
        apiClient.getAutomationLogs(25),
        apiClient.getDailyReports(20),
      ]);

      setStatus(statusRes);
      setConfig(configRes);
      setLogs(logsRes || []);
      setReports(reportsRes || []);

      if (configRes) {
        setEnabled(configRes.enabled);
        setScheduleMode(configRes.scheduleMode || 'DAILY');
        setScheduledTime(configRes.scheduledTime || '09:00');
        setTimezone(configRes.timezone || 'Asia/Kolkata');
        setTargetCountries(configRes.targetCountries || []);
        setTargetIndustries(configRes.targetIndustries || []);
        setTargetCities((configRes.targetCities || []).join(', '));
        setMinOpportunityScore(configRes.minOpportunityScore ?? 60);
        setMaxLeadsPerRun(configRes.maxLeadsPerRun ?? 10);
        setPreferredProvider(configRes.preferredProvider && configRes.preferredProvider !== 'openstreetmap' ? configRes.preferredProvider : 'overpass');
        setNotifyInApp(configRes.notifyInApp ?? true);
        setNotifyEmail(configRes.notifyEmail ?? false);
        setNotifyTelegram(configRes.notifyTelegram ?? false);
        setNotificationEmail(configRes.notificationEmail || '');
        setTelegramChatId(configRes.telegramChatId || '');
      }
    } catch (err: any) {
      console.error('Failed to load automation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void apiClient.getAutomationStatus().then(setStatus).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!status?.lastRunAt) return;
    void Promise.all([apiClient.getAutomationLogs(25), apiClient.getDailyReports(20)])
      .then(([updatedLogs, updatedReports]) => {
        setLogs(updatedLogs);
        setReports(updatedReports);
        onLeadAdded?.();
      })
      .catch(() => {});
  }, [status?.lastRunAt]);

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    setFeedbackMessage(null);

    const parsedCities = targetCities
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    try {
      const updated = await apiClient.updateAutomationConfig({
        enabled,
        scheduleMode,
        scheduledTime,
        timezone,
        targetCountries,
        targetIndustries,
        targetCities: parsedCities,
        minOpportunityScore,
        maxLeadsPerRun,
        preferredProvider,
        notifyInApp,
        notifyEmail,
        notifyTelegram,
        notificationEmail,
        telegramChatId,
      });

      setConfig(updated);
      const statusRes = await apiClient.getAutomationStatus();
      setStatus(statusRes);
      setSaveSuccess(true);
      setFeedbackMessage({ type: 'success', text: 'Autonomous scheduler configuration saved.' });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to update automation configuration.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTriggerRunNow = async () => {
    setRunningCycle(true);
    setFeedbackMessage(null);
    try {
      const location = status?.activeProfile?.locations.find((target) => target.key === runLocation);
      const response = await apiClient.runAutomationCycle(location?.key);
      setFeedbackMessage({ type: 'success', text: response.message });
      setStatus(await apiClient.getAutomationStatus());
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to complete discovery cycle.' });
    } finally {
      setRunningCycle(false);
    }
  };

  const handleStopRun = async () => {
    try {
      const response = await apiClient.stopAutomationCycle();
      setFeedbackMessage({ type: 'success', text: response.message });
      const [statusRes, updatedLogs] = await Promise.all([apiClient.getAutomationStatus(), apiClient.getAutomationLogs(25)]);
      setStatus(statusRes);
      setLogs(updatedLogs);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to stop discovery cycle.' });
    }
  };

  const handleRefreshTodayReport = async () => {
    try {
      await apiClient.generateDailyReport();
      const updatedReports = await apiClient.getDailyReports(20);
      setReports(updatedReports);
      setFeedbackMessage({ type: 'success', text: "Today's acquisition report has been updated." });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to refresh daily report.' });
    }
  };

  const handleExportCsv = async (reportId: string, dateStr: string) => {
    try {
      const blob = await apiClient.exportDailyReportCsv(reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `client_hunter_daily_report_${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to download report CSV.' });
    }
  };

  const toggleCountry = (country: string) => {
    setTargetCountries((prev) =>
      prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]
    );
  };

  const toggleIndustry = (industry: string) => {
    setTargetIndustries((prev) =>
      prev.includes(industry) ? prev.filter((i) => i !== industry) : [...prev, industry]
    );
  };

  const isRunning = Boolean(status?.jobStatus || runningCycle);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Main Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-glow-blue">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Autonomous AI Client Hunter
                </h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                    isRunning
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                      : enabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {status?.jobStatus === 'QUEUED' ? 'Discovery Queued' : isRunning ? 'Running Discovery…' : enabled ? 'Autonomous Mode Active' : 'Standby / Manual'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Continuous background business discovery, technical qualification, and verified lead forwarding.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isRunning ? (
            <button
              type="button"
              onClick={handleStopRun}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-900/40 transition"
            >
              <Square className="h-3.5 w-3.5 text-rose-400" />
              <span>Stop Current Cycle</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTriggerRunNow}
              disabled={runningCycle}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-glow-blue hover:opacity-95 transition disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Run Discovery Now</span>
            </button>
          )}

          <button type="button" disabled={!status || changingSchedule}
            onClick={async () => {
              if (!status) return;
              setChangingSchedule(true);
              try {
                const updated = await apiClient.updateAutomationConfig({ enabled: !status.enabled });
                setEnabled(updated.enabled);
                setStatus(await apiClient.getAutomationStatus());
              } catch {
                setFeedbackMessage({ type: 'error', text: 'Could not change the discovery schedule.' });
              } finally { setChangingSchedule(false); }
            }}
            className="rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-electric-500 disabled:opacity-50">
            {status?.enabled ? 'Pause schedule' : 'Resume schedule'}
          </button>

          <button
            type="button"
            onClick={loadAllData}
            className="p-2 rounded-xl border border-slate-800 bg-navy-900/60 text-slate-400 hover:text-white hover:bg-navy-800 transition"
            title="Refresh status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {status?.activeProfile && (
        <section className="space-y-3 rounded-xl border border-electric-900 bg-navy-900/70 p-4" aria-label="Active targeting profile">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-electric-300">Active targeting profile</p><h2 className="text-sm font-bold text-white">{status.activeProfile.name}</h2></div>
            <label className="text-xs font-semibold text-slate-300">Run now location
              <select className="mt-1 block min-w-40 rounded-lg border border-slate-700 bg-navy-950 p-2 text-xs text-white" value={status.activeProfile.locations.some((location) => location.key === runLocation) ? runLocation : ''} onChange={(e) => setRunLocation(e.target.value)}>
                <option value="">Next location in rotation</option>
                {status.activeProfile.locations.map((location) => <option key={location.key} value={location.key}>{[location.city, location.country].filter(Boolean).join(', ')}</option>)}
              </select>
            </label>
          </div>
          <ul className="grid max-h-52 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
            {status.activeProfile.locations.map((location) => <li key={location.key} className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400">
              <p className="font-semibold text-slate-200">{[location.city, location.country].filter(Boolean).join(', ')}</p>
              <p>{location.nextRunAt ? `${new Date(location.nextRunAt).toLocaleString(undefined, { timeZone: location.timezone })} · ${location.timezone}` : location.mode === 'MANUAL' ? 'Run now only' : 'Paused'}</p>
            </li>)}
          </ul>
        </section>
      )}
      {status?.currentRun && <section className="space-y-2 rounded-xl border border-electric-900 bg-navy-900/70 p-4" aria-label="Current discovery run">
        <h2 className="text-sm font-bold text-white">Current run · {status.currentRun.status}</h2>
        <DiscoveryRunDetails run={status.currentRun} />
      </section>}
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-2 ${
            feedbackMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
              : 'border-rose-500/30 bg-rose-950/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-[10px] text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Schedule State */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Schedule Cadence
            </span>
            <Calendar className="h-4 w-4 text-electric-400" />
          </div>
          <div className="mt-2 text-lg font-extrabold text-white">
            {scheduleMode === 'MANUAL' ? 'Manual Only' : `${scheduleMode} at ${scheduledTime}`}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">Timezone: {timezone}</div>
        </div>

        {/* 2. Next Scheduled Run */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Next Scheduled Cycle
            </span>
            <Clock className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-lg font-extrabold text-white">
            {enabled && status?.nextRunAt
              ? new Date(status.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Paused'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {enabled && status?.nextRunAt
              ? new Date(status.nextRunAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : 'Enable scheduler to activate'}
          </div>
        </div>

        {/* 3. Preferred Search Provider */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Search Provider
            </span>
            <Compass className="h-4 w-4 text-violet-400" />
          </div>
          <div className="mt-2 text-lg font-extrabold text-white capitalize">
            {preferredProvider.replace('_', ' ')}
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Auto-fallback enabled
          </div>
        </div>

        {/* 4. Lead Notifications */}
        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Lead Forwarding
            </span>
            <Bell className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-lg font-extrabold text-white">
            {status?.activeProfile || notifyInApp ? 'In-App Center' : 'Muted'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Min Score Threshold: <span className="text-white font-bold">{minOpportunityScore}+</span>
          </div>
        </div>
      </div>

      {/* Subtabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('scheduler')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'scheduler'
              ? 'bg-electric-500/20 text-electric-300 border border-electric-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Scheduler & Filter Controls</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reports')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'reports'
              ? 'bg-electric-500/20 text-electric-300 border border-electric-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Daily Reports & CSV Export</span>
          {reports.length > 0 && (
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] text-slate-300">
              {reports.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'logs'
              ? 'bg-electric-500/20 text-electric-300 border border-electric-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>Execution History & Errors</span>
          {logs.length > 0 && (
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] text-slate-300">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SCHEDULER CONTROLS & CONFIGURATION */}
      {activeSubTab === 'scheduler' && (
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 sm:p-6 space-y-6">
            {/* Top Toggle Switch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="text-sm font-bold text-white">Autonomous Background Discovery</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  When enabled, AI Client Hunter runs unattended at the scheduled time, qualifies businesses, and alerts you.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-electric-500"></div>
                <span className="ml-3 text-xs font-bold text-slate-200">
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            {/* Schedule Cadence & Timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Schedule Mode
                </label>
                <select
                  value={scheduleMode}
                  onChange={(e) => setScheduleMode(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-electric-500 focus:outline-none"
                >
                  <option value="DAILY">Daily (Runs every day)</option>
                  <option value="WEEKLY">Weekly (Runs every Monday)</option>
                  <option value="MANUAL">Manual Only (No background cron)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Scheduled Time (24h)
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  disabled={scheduleMode === 'MANUAL'}
                  className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-electric-500 focus:outline-none disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-electric-500 focus:outline-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Countries Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Countries & Markets (Select all that apply)
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_COUNTRIES.map((c) => {
                  const isSelected = targetCountries.includes(c);
                  return (
                    <button
                      type="button"
                      key={c}
                      onClick={() => toggleCountry(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        isSelected
                          ? 'border-electric-500 bg-electric-950/40 text-electric-300'
                          : 'border-slate-800 bg-navy-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Industries Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Industries
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_INDUSTRIES.map((ind) => {
                  const isSelected = targetIndustries.includes(ind);
                  return (
                    <button
                      type="button"
                      key={ind}
                      onClick={() => toggleIndustry(ind)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        isSelected
                          ? 'border-violet-500 bg-violet-950/40 text-violet-300'
                          : 'border-slate-800 bg-navy-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {ind}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Cities */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target Cities (Comma-separated)
              </label>
              <input
                type="text"
                value={targetCities}
                onChange={(e) => setTargetCities(e.target.value)}
                placeholder="Bengaluru (India), London (United Kingdom)"
                className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-electric-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {preferredProvider === 'overpass' ? 'Overpass needs a city for each target country.' : 'The autonomous hunter cycles through these cities on successive runs.'}
              </p>
            </div>

            {/* Search Provider & Safety Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Primary Search Provider
                </label>
                <select
                  value={preferredProvider}
                  onChange={(e) => setPreferredProvider(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-electric-500 focus:outline-none"
                >
                  <option value="overpass">OpenStreetMap Overpass</option>
                  <option value="google_places">Google Places API (Requires Key)</option>
                  <option value="serpapi">SerpApi Search Engine (Requires Key)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Min Opportunity Score (0–100)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="30"
                    max="90"
                    step="5"
                    value={minOpportunityScore}
                    onChange={(e) => setMinOpportunityScore(Number(e.target.value))}
                    className="w-full accent-electric-500"
                  />
                  <span className="font-extrabold text-sm text-electric-400 w-8 text-right">
                    {minOpportunityScore}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Only leads scoring {minOpportunityScore}+ are forwarded to your CRM.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Max Discovered Leads Per Run
                </label>
                <input
                  type="number"
                  min="3"
                  max="50"
                  value={maxLeadsPerRun}
                  onChange={(e) => setMaxLeadsPerRun(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-xs text-white focus:border-electric-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Prevents excessive provider requests and rate limits.
                </p>
              </div>
            </div>

            {/* Notification Channels */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Lead Forwarding & Notification Channels
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* In-App */}
                <div className="rounded-xl border border-slate-800 bg-navy-950 p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyInApp}
                      onChange={(e) => setNotifyInApp(e.target.checked)}
                      className="rounded border-slate-700 text-electric-500"
                    />
                    <span className="text-xs font-bold text-white">In-App Notification Center</span>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Always available via the navbar bell indicator.
                  </p>
                </div>

                {/* Email (SMTP) */}
                <div className="rounded-xl border border-slate-800 bg-navy-950 p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      disabled={!status?.externalAlertsEnabled}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                      className="rounded border-slate-700 text-electric-500"
                    />
                    <span className="text-xs font-bold text-white">Email Alert (SMTP)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="your-email@domain.com"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    disabled={!notifyEmail}
                    className="w-full rounded-lg border border-slate-800 bg-navy-900 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                  />
                </div>

                {/* Telegram Bot */}
                <div className="rounded-xl border border-slate-800 bg-navy-950 p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyTelegram}
                      disabled={!status?.externalAlertsEnabled}
                      onChange={(e) => setNotifyTelegram(e.target.checked)}
                      className="rounded border-slate-700 text-electric-500"
                    />
                    <span className="text-xs font-bold text-white">Telegram Alert (Bot API)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Telegram Chat ID"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    disabled={!notifyTelegram}
                    className="w-full rounded-lg border border-slate-800 bg-navy-900 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {saveSuccess ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Settings updated
                  </span>
                ) : (
                  'All changes are persisted in PostgreSQL.'
                )}
              </span>

              <button
                type="submit"
                disabled={savingConfig}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 px-5 py-2 text-xs font-bold text-white shadow-glow-blue hover:opacity-95 transition disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: DAILY LEAD REPORTS & CSV EXPORT */}
      {activeSubTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <div className="text-sm font-bold text-white">Daily Acquisition & Performance Reports</div>
              <p className="text-xs text-slate-400">
                System aggregates businesses discovered, qualified opportunities, and skipped duplicates by date.
              </p>
            </div>
            <button
              onClick={handleRefreshTodayReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-navy-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-navy-800 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Today's Report</span>
            </button>
          </div>

          {reports.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-navy-900/40 p-8 text-center space-y-2">
              <FileText className="h-8 w-8 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-300">No Daily Reports Generated Yet</div>
              <p className="text-xs text-slate-500">
                Run an autonomous discovery cycle or click "Refresh Today's Report" to compile statistics.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const dateKey = report.localDate ?? new Date(report.reportDate).toISOString().slice(0, 10);
                const dateFormatted = new Date(dateKey + 'T00:00:00Z').toLocaleDateString([], {
                  timeZone: 'UTC',
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div
                    key={report.id}
                    className="rounded-2xl border border-slate-800 bg-navy-900/60 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-slate-700"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{dateFormatted}</span>
                        <span className="text-[10px] text-slate-400">{report.timezone ?? 'UTC'}</span>
                        <span className="rounded bg-electric-500/20 px-2 py-0.5 text-[10px] font-bold text-electric-300 border border-electric-500/30">
                          {report.qualifiedLeads} Qualified
                        </span>
                        {report.highOpportunityLeads > 0 && (
                          <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300 border border-violet-500/30">
                            {report.highOpportunityLeads} High-Priority (75+)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                        {report.summary}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                        <span>Discovered: <strong className="text-slate-300">{report.businessesDiscovered}</strong></span>
                        <span>•</span>
                        <span>Websites Audited: <strong className="text-slate-300">{report.websitesAnalyzed}</strong></span>
                        <span>•</span>
                        <span>Duplicates Skipped: <strong className="text-slate-300">{report.duplicatesSkipped}</strong></span>
                        <span>•</span>
                        <span>Failed Searches: <strong className="text-slate-300">{report.failedSearches}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center">
                      <button
                        onClick={() => handleExportCsv(report.id, dateKey)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-navy-950 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: EXECUTION LOGS & ERRORS */}
      {activeSubTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2">
            <div>
              <div className="text-sm font-bold text-white">Execution Audit Logs</div>
              <p className="text-xs text-slate-400">
                Detailed record of every search cycle, segment targets, and provider diagnostics.
              </p>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-navy-900/40 p-8 text-center space-y-2">
              <Activity className="h-8 w-8 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-300">No Execution History Found</div>
              <p className="text-xs text-slate-500">
                Trigger a manual run or wait for the scheduled cycle to populate logs.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-navy-900/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-navy-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Trigger</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Target Segment</th>
                      <th className="px-4 py-3">Discovered</th>
                      <th className="px-4 py-3">Qualified</th>
                      <th className="px-4 py-3">Duplicates</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Diagnostics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {logs.map((log) => {
                      const isSuccess = log.status === 'SUCCESS';
                      const isPartial = log.status === 'PARTIAL';
                      return (
                        <tr key={log.id} className="hover:bg-navy-800/40 transition">
                          <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-400">
                            {new Date(log.startedAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 border border-slate-700">
                              {log.triggerType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                isSuccess
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : isPartial
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">
                              {log.city ? `${log.city}, ${log.country}` : log.country}
                            </div>
                            <div className="text-[10px] text-slate-500">{log.industry}</div>
                            {log.profileSnapshot?.profileName && <div className="text-[10px] text-electric-300">{log.profileSnapshot.profileName}</div>}
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{log.discoveredCount}</td>
                          <td className="px-4 py-3 font-bold text-emerald-400">{log.qualifiedCount}</td>
                          <td className="px-4 py-3 text-slate-400">{log.duplicatesCount}</td>
                          <td className="px-4 py-3 text-[11px] text-slate-400">
                            {log.durationMs ? `${log.durationMs}ms` : '-'}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-slate-400 max-w-xs truncate">
                            {log.errorDetails ? (
                              <span className="text-amber-400">{log.errorDetails}</span>
                            ) : (
                              <span className="text-slate-400">{log.qualificationMetrics?.providerId ?? log.providerUsed}</span>
                            )}
                            {log.qualificationMetrics && <details className="mt-1 min-w-44">
                              <summary className="cursor-pointer text-electric-300">Run details</summary>
                              <DiscoveryRunDetails run={log} />
                            </details>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
import { DiscoveryRunDetails } from '../components/DiscoveryRunDetails';
