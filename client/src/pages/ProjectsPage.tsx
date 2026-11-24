import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { DraftActions } from '../components/DraftActions';
import type { Lead, Pitch } from '../types';
import { formatQuoteAmount } from '../utils/salesConversion';
import { RateCalculatorPage } from './RateCalculatorPage';

interface ProjectsPageProps {
  leads: Lead[];
  initialLeadId?: string;
  onOpenLead: (id: string) => void;
  onRefreshLeads: () => void;
}

const views = { saved: 'Saved proposals', estimate: 'Build a quote', won: 'Won projects' };

export function ProjectsPage({ leads, initialLeadId = '', onOpenLead, onRefreshLeads }: ProjectsPageProps) {
  const [view, setView] = useState<keyof typeof views>(initialLeadId ? 'estimate' : 'saved');
  const [leadId, setLeadId] = useState(initialLeadId);
  const [proposals, setProposals] = useState<Pitch[] | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    apiClient.getPitches({ messageType: 'SERVICE_PROPOSAL' }).then((items) => {
      setProposals((current) => [...(current ?? []), ...items.filter((item) => !current?.some((saved) => saved.id === item.id))]);
    }).catch((err: Error) => setError(err.message));
  }, []);

  const lead = leads.find((item) => item.id === leadId);
  const visible = (proposals ?? []).filter((item) => view !== 'won' || item.status === 'CONVERTED');

  function saved(pitch: Pitch) {
    setProposals((current) => [pitch, ...(current ?? []).filter((item) => item.id !== pitch.id)]);
    setFeedback('Proposal draft saved.');
    setView('saved');
    onRefreshLeads();
  }

  function updated(pitch: Pitch) {
    setProposals((current) => (current ?? []).map((item) => item.id === pitch.id ? pitch : item));
    onRefreshLeads();
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-white">Proposals &amp; Projects</h1>
          <p className="mt-1 text-sm text-slate-400">Build a catalog-priced quote and record its outcome on the linked lead.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Proposal views">
          {(['saved', 'estimate', 'won'] as const).map((key) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); setFeedback(''); }}
              className={'rounded-lg border px-3 py-2 text-xs font-semibold ' + (view === key ? 'border-electric-400 text-electric-300' : 'border-slate-700 text-slate-300')}>
              {views[key]}
            </button>
          ))}
        </div>
      </header>
      {feedback && <p role="status" className="text-sm text-emerald-300">{feedback}</p>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

      {view === 'estimate' ? (
        <div className="space-y-4">
          <label className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            CRM lead
            <select value={leadId} onChange={(event) => setLeadId(event.target.value)}
              className="max-w-full rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-white">
              <option value="">Standalone estimate</option>
              {leads.map((item) => <option key={item.id} value={item.id}>{item.businessName}</option>)}
            </select>
          </label>
          <RateCalculatorPage key={lead?.id ?? 'standalone'} proposalLead={lead} onProposalSaved={saved} />
        </div>
      ) : (
        <div className="space-y-3">
          {!proposals && !error && <p role="status" className="text-sm text-slate-400">Loading proposals…</p>}
          {proposals && !visible.length && <p className="rounded-xl border border-slate-800 p-5 text-sm text-slate-400">
            {view === 'won' ? 'No proposals have been recorded as won.' : 'No saved proposals. Build a quote for a CRM lead to get started.'}
          </p>}
          {visible.map((pitch) => {
            const quote = pitch.proposal;
            if (!quote) return null;
            return (
              <article key={pitch.id} className="space-y-3 rounded-2xl border border-slate-800 bg-navy-900/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="break-words text-sm font-bold text-white">{pitch.subject}</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Catalog quote · {formatQuoteAmount(quote.currency, quote.totalMinor)} · {quote.estimatedWeeks}–{quote.estimatedWeeks + 1} weeks
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                    {pitch.status === 'CONVERTED' ? 'Won' : pitch.status}
                  </span>
                </div>
                <details className="text-sm text-slate-200">
                  <summary className="cursor-pointer text-xs font-semibold text-electric-300">Read proposal</summary>
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-navy-950 p-3 text-xs">{pitch.body}</p>
                </details>
                <div className="flex flex-wrap items-center gap-3">
                  <DraftActions pitch={pitch} onUpdate={updated} />
                  {pitch.leadId && <button type="button" onClick={() => onOpenLead(pitch.leadId!)}
                    className="text-xs font-semibold text-electric-300">Open CRM lead</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
