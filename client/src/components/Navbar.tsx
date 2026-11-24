import React, { useEffect, useState } from 'react';
import { Target, Activity, Plus, ShieldCheck, Database, Sparkles, Menu, LogOut } from 'lucide-react';
import { apiClient } from '../api/client';
import { HealthCheckResponse } from '../types';
import { NotificationCenter } from './NotificationCenter';

interface NavbarProps {
  onOpenNewLead: () => void;
  onToggleMobileSidebar: () => void;
  mobileMenuOpen: boolean;
  onSelectLead?: (leadId: string) => void;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenNewLead, onToggleMobileSidebar, mobileMenuOpen, onSelectLead, onSignOut }) => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isHealthOpen, setIsHealthOpen] = useState(false);

  useEffect(() => {
    apiClient
      .getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      apiClient.getHealth().then(setHealth).catch(() => setHealth(null));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const isDegraded = health?.status === 'degraded';
  const isOk = health?.status === 'ok';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-navy-950/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        {/* Left: Brand & Mobile Menu */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
            aria-controls="workspace-navigation"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-electric-500 to-violet-600 text-white shadow-glow-blue sm:flex">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm sm:text-lg font-extrabold tracking-tight text-white font-['Plus_Jakarta_Sans']">
                  AI Client Hunter
                </span>
                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold tracking-wider text-violet-300 border border-violet-500/20 uppercase hidden sm:inline-block">
                  SaaS Core
                </span>
              </div>
              <p className="hidden text-[11px] text-slate-400 font-medium sm:block">
                Freelance Acquisition Platform
              </p>
            </div>
          </div>
        </div>

        {/* Right: Currency Indicator, Health & Add Lead */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Target Markets Pill */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 bg-navy-900/80 px-3 py-1.5 rounded-full border border-slate-800/80">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              <span className="text-[11px] font-medium text-slate-300">India (₹ INR)</span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-electric-400"></span>
              <span className="text-[11px] font-medium text-slate-300">US & Europe ($ USD)</span>
            </div>
          </div>

          {/* System Health Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsHealthOpen(!isHealthOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 bg-navy-900/60 hover:bg-navy-900 text-xs text-slate-300 transition"
              title="System Diagnostics"
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isOk ? 'bg-emerald-400' : isDegraded ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isOk ? 'bg-emerald-500' : isDegraded ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="font-semibold text-[11px] hidden sm:inline">
                {isOk ? 'System Active' : isDegraded ? 'Ready / Degraded' : 'Offline'}
              </span>
              <Activity className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {isHealthOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-navy-900 border border-slate-700/80 shadow-2xl p-4 text-xs z-50 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-electric-400" />
                    <span className="font-bold text-white">System Diagnostics</span>
                  </div>
                  <span className="text-[10px] text-slate-500">v{health?.version || '1.0.0'}</span>
                </div>

                <div className="mt-3 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Database className="h-4 w-4 text-slate-400 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">PostgreSQL Database</div>
                      <div className="text-slate-400 text-[11px]">
                        Status: <span className="text-emerald-400 font-bold">{health?.checks?.database?.status || 'Connected'}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">Engine: {health?.checks?.database?.engine}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-violet-400 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">Gemini AI Service</div>
                      <div className="text-slate-400 text-[11px]">
                        Status:{' '}
                        {health?.checks?.geminiAi?.configured ? (
                          <span className="text-emerald-400 font-bold">Live ({health?.checks?.geminiAi?.model})</span>
                        ) : (
                          <span className="text-amber-400 font-semibold">Local Synthesis Engine</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsHealthOpen(false)}
                  className="mt-3 w-full py-1 text-center text-[11px] text-slate-400 hover:text-white bg-slate-800/80 rounded-lg transition"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* In-App Notification Center */}
          <NotificationCenter onSelectLead={onSelectLead} />
          {onSignOut && (
            <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          )}

          {/* Quick Action: New Lead */}
          <button
            onClick={onOpenNewLead}
            aria-label="Add Lead"
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 px-2 py-1.5 text-xs font-bold text-white shadow-glow-blue transition hover:from-electric-400 hover:to-violet-500 sm:px-3.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Lead</span>
          </button>
        </div>
      </div>
    </header>
  );
};
