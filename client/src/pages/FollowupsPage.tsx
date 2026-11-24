import React, { useState, useEffect } from 'react';
import {
  Clock,
  Send,
  CheckCircle2,
  Calendar,
  Building2,
  Mail,
  MessageSquare,
  Linkedin,
  AlertCircle,
} from 'lucide-react';
import { Pitch, Lead, ScheduledFollowUp } from '../types';
import { apiClient } from '../api/client';
import { Badge } from '../components/Badge';
import { DraftActions } from '../components/DraftActions';
import { followUpDueAt } from '../utils/salesConversion';

interface FollowupsPageProps {
  leads: Lead[];
  initialLeadId?: string;
  onOpenLead: (id: string) => void;
  onRefreshLeads: () => void;
}

const field = 'w-full min-w-0 rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white [color-scheme:dark]';
const action = 'rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-electric-400 disabled:opacity-50';

export const FollowupsPage: React.FC<FollowupsPageProps> = ({ leads, initialLeadId = '', onOpenLead, onRefreshLeads }) => {
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [reminders, setReminders] = useState<ScheduledFollowUp[] | null>(null);
  const [leadId, setLeadId] = useState(initialLeadId);
  const [pitchId, setPitchId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState('');
  const [rescheduling, setRescheduling] = useState('');
  const [newDue, setNewDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    apiClient.getPitches().then(setPitches).catch((err: Error) => setError(err.message));
    apiClient.getFollowUps().then(setReminders).catch((err: Error) => setError(err.message));
  }, []);

  async function saveReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dueAt = followUpDueAt(due);
    if (!dueAt || !leadId || !title.trim()) {
      setError('Select a lead, enter a title, and choose a future time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await apiClient.scheduleFollowUp({ leadId, pitchId: pitchId || undefined, title, notes, dueAt });
      setReminders((current) => [...(current ?? []), saved]);
      setTitle('');
      setNotes('');
      setDue('');
      setShowHistory(false);
      onRefreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule this reminder.');
    } finally {
      setBusy(false);
    }
  }

  async function updateReminder(reminder: ScheduledFollowUp, status?: 'COMPLETED' | 'CANCELLED') {
    const dueAt = status ? undefined : followUpDueAt(newDue);
    if (!status && !dueAt) {
      setError('Choose a future time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await apiClient.updateFollowUp(reminder.id, { revision: reminder.revision, status, dueAt });
      setReminders((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item));
      setRescheduling('');
      onRefreshLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update this reminder.');
      apiClient.getFollowUps().then(setReminders).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const filteredPitches = pitches.filter((p) => {
    if (filterChannel !== 'ALL' && p.channel !== filterChannel) return false;
    return !p.proposal;
  });
  const visibleReminders = (reminders ?? []).filter((item) => showHistory ? item.status !== 'PENDING' : item.status === 'PENDING')
    .sort((a, b) => showHistory ? b.dueAt.localeCompare(a.dueAt) : a.dueAt.localeCompare(b.dueAt));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Follow-Up Tracker
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Schedule in-app reminders and record outreach and replies.
        </p>
      </div>

      <section aria-labelledby="follow-up-scheduling" className="space-y-4 rounded-2xl border border-slate-800 bg-navy-900/60 p-4">
        <h2 id="follow-up-scheduling" className="text-sm font-bold text-white">Schedule a follow-up</h2>
        <form onSubmit={saveReminder} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-300">Lead
            <select required value={leadId} onChange={(event) => { setLeadId(event.target.value); setPitchId(''); }} className={field}>
              <option value="">Select a CRM lead</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.businessName}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-300">Related draft or proposal
            <select value={pitchId} onChange={(event) => setPitchId(event.target.value)} className={field}>
              <option value="">No linked draft</option>
              {pitches.filter((pitch) => pitch.leadId === leadId).map((pitch) => (
                <option key={pitch.id} value={pitch.id}>{pitch.subject || pitch.messageType || 'Outreach draft'}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-300">Reminder title
            <input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={field} />
          </label>
          <label className="space-y-1 text-xs text-slate-300">Due date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            <input required type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} className={field} />
          </label>
          <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">Notes
            <textarea rows={2} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} className={field} />
          </label>
          <div><button type="submit" disabled={busy} className={action}>Schedule reminder</button></div>
        </form>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">{showHistory ? 'Follow-up history' : 'Upcoming and due'}</h2>
          <button type="button" aria-pressed={showHistory} onClick={() => setShowHistory(!showHistory)} className={action}>
            {showHistory ? 'Show pending' : 'Show history'}
          </button>
        </div>
        {!reminders && !error && <p role="status" className="text-xs text-slate-400">Loading reminders…</p>}
        {reminders && !visibleReminders.length && <p className="text-xs text-slate-400">No {showHistory ? 'completed or cancelled' : 'pending'} reminders.</p>}
        {visibleReminders.map((reminder) => (
          <article key={reminder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-navy-900/60 p-4">
            <div className="min-w-0 space-y-1">
              <h3 className="break-words text-sm font-semibold text-white">{reminder.title}</h3>
              <button type="button" className="break-words text-xs text-electric-300" onClick={() => onOpenLead(reminder.leadId)}>
                {reminder.lead.businessName}
              </button>
              <p className="text-xs text-slate-400">
                {reminder.status === 'PENDING' && Date.parse(reminder.dueAt) <= Date.now() ? 'Due' : reminder.status} ·{' '}
                <time dateTime={reminder.dueAt}>{new Date(reminder.dueAt).toLocaleString()}</time>
              </p>
              {reminder.notes && <p className="whitespace-pre-wrap break-words text-xs text-slate-300">{reminder.notes}</p>}
            </div>
            {reminder.status === 'PENDING' && (
              <div className="flex flex-wrap items-center gap-2">
                {rescheduling === reminder.id ? (
                  <>
                    <input type="datetime-local" aria-label="New due date and time" value={newDue}
                      onChange={(event) => setNewDue(event.target.value)} className={field} />
                    <button type="button" className={action} disabled={busy} onClick={() => void updateReminder(reminder)}>Save time</button>
                    <button type="button" className={action} onClick={() => setRescheduling('')}>Close</button>
                  </>
                ) : (
                  <>
                    <button type="button" className={action} disabled={busy} onClick={() => { setRescheduling(reminder.id); setNewDue(''); }}>Reschedule</button>
                    <button type="button" className={action} disabled={busy} onClick={() => void updateReminder(reminder, 'COMPLETED')}>Complete</button>
                    <button type="button" className={action} disabled={busy} onClick={() => {
                      if (window.confirm('Cancel this reminder?')) void updateReminder(reminder, 'CANCELLED');
                    }}>Cancel reminder</button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </section>

      <h2 className="text-sm font-bold text-white">Outreach follow-up drafts</h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-slate-300">Filter Channel:</span>
        <div className="flex min-w-0 flex-wrap gap-2">
          {[
            { id: 'ALL', label: 'All Channels' },
            { id: 'COLD_EMAIL', label: 'Email', icon: Mail },
            { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquare },
            { id: 'LINKEDIN', label: 'LinkedIn', icon: Linkedin },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterChannel(item.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                filterChannel === item.id
                  ? 'bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-sm'
                  : 'bg-navy-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pitches List with Follow-ups */}
      {filteredPitches.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-navy-900/40 p-12 text-center flex flex-col items-center justify-center">
          <Clock className="h-10 w-10 text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-slate-300">No active outreach sequences yet</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Generate a pitch in the AI Outreach Studio to review its follow-up drafts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPitches.map((pitch) => {
            const linkedLead = pitch.leadId
              ? leads.find((l) => l.id === pitch.leadId)
              : null;

            return (
              <div
                key={pitch.id}
                className="rounded-2xl border border-slate-800 bg-navy-900/60 p-5 space-y-4 hover:border-slate-700 transition"
              >
                {/* Pitch Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-4 w-4 text-electric-400" />
                    <span className="font-bold text-white text-sm">
                      {linkedLead?.businessName || linkedLead?.companyName || 'Target business'}
                    </span>
                    <Badge variant="channel" value={pitch.channel} size="xs">
                      {pitch.channel.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="region" value={pitch.targetRegion} size="xs">
                      {pitch.targetRegion}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{pitch.status}</span>
                    <DraftActions pitch={pitch} onUpdate={(updated) => {
                      setPitches((current) => current.map((item) => item.id === updated.id ? updated : item));
                      onRefreshLeads();
                    }} />
                  </div>
                </div>

                {/* Primary Pitch Copy */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                    <span>Initial Outreach Touchpoint:</span>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-navy-950/80 p-3 text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto font-mono text-[11px]">
                    {pitch.body}
                  </div>
                </div>

                {/* Follow-up Sequence Items */}
                {pitch.followUpSequence && pitch.followUpSequence.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-400" />
                      <span>Follow-up Cadence:</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {pitch.followUpSequence.map((fu, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-800 bg-navy-950/60 p-3 text-xs space-y-2 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                              <span>Touchpoint #{idx + 1} (Day {fu.delayDays})</span>
                              <span className="text-[10px] text-slate-500">Suggested draft</span>
                            </div>
                            <p className="mt-1.5 text-slate-400 whitespace-pre-line text-[11px] leading-relaxed line-clamp-3">
                              {fu.body}
                            </p>
                          </div>

                          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800/60 pt-2">
                            {pitch.leadId && <button type="button" onClick={() => {
                              setLeadId(pitch.leadId!); setPitchId(pitch.id); setTitle(fu.subject || 'Follow up on outreach');
                              setNotes(fu.body.slice(0, 3000));
                              document.getElementById('follow-up-scheduling')?.scrollIntoView({ behavior: 'smooth' });
                            }} className="text-xs font-semibold text-electric-300">Schedule reminder</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
