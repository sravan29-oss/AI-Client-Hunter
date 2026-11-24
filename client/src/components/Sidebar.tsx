import React from 'react';
import {
  LayoutDashboard,
  Compass,
  Users,
  SearchCode,
  Send,
  Clock,
  Briefcase,
  BarChart3,
  Settings,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  X,
  Bot,
  MessageSquare,
} from 'lucide-react';

export type SidebarTab =
  | 'overview'
  | 'find-clients'
  | 'leads'
  | 'analyzer'
  | 'outreach'
  | 'followups'
  | 'engagement'
  | 'projects'
  | 'analytics'
  | 'automation'
  | 'settings';

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  leadCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  leadCount = 0,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const menuItems: Array<{
    id: SidebarTab;
    label: string;
    description: string;
    icon: React.ElementType;
    badge?: string | number;
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      description: 'Key metrics & funnel summary',
      icon: LayoutDashboard,
    },
    {
      id: 'find-clients',
      label: 'Find Clients',
      description: 'Indian & Global prospect scanner',
      icon: Compass,
      badge: 'AI',
    },
    {
      id: 'leads',
      label: 'Leads',
      description: 'Active pipeline & contact CRM',
      icon: Users,
      badge: leadCount > 0 ? leadCount : undefined,
    },
    {
      id: 'analyzer',
      label: 'Website Analyzer',
      description: 'Real scraper + tech audit hooks',
      icon: SearchCode,
    },
    {
      id: 'outreach',
      label: 'AI Outreach',
      description: 'Multi-channel pitch generator',
      icon: Send,
    },
    {
      id: 'followups',
      label: 'Follow-ups',
      description: 'Automated 3-day & 7-day touchpoints',
      icon: Clock,
    },
    {
      id: 'engagement',
      label: 'Engagement',
      description: 'Campaigns, consent and conversations',
      icon: MessageSquare,
    },
    {
      id: 'projects',
      label: 'Projects',
      description: 'Rate cards, SOW & proposals',
      icon: Briefcase,
    },
    {
      id: 'analytics',
      label: 'Business Intelligence',
      description: 'Performance by date range',
      icon: BarChart3,
    },
    {
      id: 'automation',
      label: 'Auto Hunter',
      description: 'Autonomous discovery & scheduler',
      icon: Bot,
      badge: 'AUTO',
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'API keys, currency & profile',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-64 bg-navy-950/95 lg:bg-navy-950/60 border-r border-slate-800/80 backdrop-blur-xl flex flex-col justify-between shrink-0 overflow-y-auto transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible lg:translate-x-0'
        }`}
      >
        <div className="p-3.5 space-y-1">
          {/* Mobile Header Close */}
          <div className="flex items-center justify-between px-3 py-2 lg:hidden border-b border-slate-800 mb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Navigation</span>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Acquisition Hub</span>
            <Sparkles className="h-3 w-3 text-violet-400" />
          </div>

          {/* Menu Items */}
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onTabChange(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-electric-500/15 via-violet-500/15 to-transparent border border-electric-400/30 text-white font-semibold shadow-glow-blue'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-navy-900/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? 'bg-gradient-to-tr from-electric-500 to-violet-500 text-white shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-xs leading-none tracking-tight">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                      {item.description}
                    </div>
                  </div>
                </div>

                {item.badge ? (
                  <span
                    className={`px-1.5 py-0.5 text-[9px] rounded-md font-bold ${
                      isActive
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        : 'bg-slate-800/80 text-slate-400 group-hover:bg-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : isActive ? (
                  <ChevronRight className="h-3.5 w-3.5 text-violet-400 opacity-80" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Footer info badge */}
        <div className="p-3 m-3 rounded-2xl bg-gradient-to-b from-navy-900/80 to-navy-950 border border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
            <ShieldCheck className="h-3.5 w-3.5 text-electric-400" />
            <span className="text-[11px]">AI Acquisition Active</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Targeting Indian & Global clients with custom audits & verified rate cards.
          </p>
        </div>
      </aside>
    </>
  );
};
