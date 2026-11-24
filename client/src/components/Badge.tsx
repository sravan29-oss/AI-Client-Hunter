import React from 'react';
import { Region, LeadStatus, PitchChannel } from '../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'region' | 'status' | 'channel' | 'service' | 'score' | 'priority' | 'neutral' | 'success' | 'warning' | 'danger';
  value?: string | number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', value, size = 'sm', className = '' }) => {
  let colorClasses = 'bg-slate-800/80 text-slate-300 border-slate-700/80';

  if (variant === 'region') {
    switch (value as Region) {
      case 'INDIA':
        colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 shadow-sm';
        break;
      case 'US':
        colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-700/60 shadow-sm';
        break;
      case 'UK':
        colorClasses = 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60 shadow-sm';
        break;
      case 'EUROPE':
        colorClasses = 'bg-violet-950/60 text-violet-300 border-violet-700/60 shadow-sm';
        break;
      default:
        colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  } else if (variant === 'status') {
    const s = String(value || '').replace(/\s+/g, '_');
    switch (s) {
      case 'New':
      case 'DISCOVERED':
        colorClasses = 'bg-slate-800/80 text-slate-300 border-slate-700';
        break;
      case 'Analysed':
      case 'AUDITED':
        colorClasses = 'bg-cyan-950/60 text-cyan-300 border-cyan-800/80';
        break;
      case 'Ready_to_Contact':
        colorClasses = 'bg-purple-950/60 text-purple-300 border-purple-800/80 font-medium';
        break;
      case 'Contacted':
      case 'CONTACTED':
        colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-800/80';
        break;
      case 'Replied':
        colorClasses = 'bg-sky-950/70 text-sky-300 border-sky-600/80 font-medium';
        break;
      case 'Meeting_Scheduled':
      case 'MEETING_BOOKED':
        colorClasses = 'bg-violet-950/70 text-violet-300 border-violet-600/80 font-bold';
        break;
      case 'Negotiation':
      case 'NEGOTIATING':
      case 'PROPOSAL_SENT':
        colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-700/80 font-semibold';
        break;
      case 'Won':
      case 'WON':
        colorClasses = 'bg-emerald-950/80 text-emerald-300 border-emerald-500 font-bold shadow-sm';
        break;
      case 'Lost':
      case 'LOST':
        colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-800/80';
        break;
      default:
        colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';
    }
  } else if (variant === 'score') {
    const num = Number(value) || 0;
    if (num >= 85) {
      colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50';
    } else if (num >= 70) {
      colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-500/50';
    } else if (num >= 50) {
      colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-500/50';
    } else {
      colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-500/50';
    }
  } else if (variant === 'priority') {
    if (value === 'HIGH') {
      colorClasses = 'bg-violet-950/70 text-violet-300 border-violet-500/60 font-semibold';
    } else if (value === 'MEDIUM') {
      colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-600/50';
    } else {
      colorClasses = 'bg-slate-800/60 text-slate-400 border-slate-700';
    }
  } else if (variant === 'channel') {
    switch (value as PitchChannel) {
      case 'COLD_EMAIL':
        colorClasses = 'bg-blue-950/60 text-blue-300 border-blue-800/80';
        break;
      case 'LINKEDIN':
        colorClasses = 'bg-sky-950/60 text-sky-300 border-sky-800/80';
        break;
      case 'WHATSAPP':
        colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80';
        break;
      case 'UPWORK_PROPOSAL':
        colorClasses = 'bg-violet-950/60 text-violet-300 border-violet-800/80';
        break;
    }
  } else if (variant === 'service') {
    colorClasses = 'bg-navy-900 text-slate-300 border-slate-700/60';
  } else if (variant === 'success') {
    colorClasses = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80';
  } else if (variant === 'warning') {
    colorClasses = 'bg-amber-950/60 text-amber-300 border-amber-800/80';
  } else if (variant === 'danger') {
    colorClasses = 'bg-rose-950/60 text-rose-300 border-rose-800/80';
  }

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[9px]'
      : size === 'sm'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium tracking-wide transition-colors ${colorClasses} ${sizeClasses}`}
    >
      {children}
    </span>
  );
};
