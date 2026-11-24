import { useEffect, useState } from 'react';
import type { Pitch } from '../types';
import type { DraftEligibility } from '../types/engagement';
import { apiClient } from '../api/client';
import { availableDraftActions, type DraftAction } from '../utils/salesConversion';
import { eligibilityLabels, engagementButton, engagementField, pastEventInstant } from '../utils/engagement';
import { CommunicationResponseForm } from './CommunicationResponseForm';

const actionLabels: Record<DraftAction, string> = {
  approve: 'Approve draft',
  'record-send': 'Record manual delivery',
  'record-reply': 'Record reply',
  'record-conversion': 'Record win',
};

export function DraftActions({ pitch, onUpdate }: { pitch: Pitch; onUpdate: (pitch: Pitch) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [eligibility, setEligibility] = useState<DraftEligibility | null>(null);
  const [showReply, setShowReply] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [time, setTime] = useState('');

  useEffect(() => {
    if (pitch.status !== 'DRAFT') return;
    let active = true;
    setEligibility(null);
    apiClient.getDraftEligibility(pitch.id).then((result) => {
      if (active) setEligibility(result);
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [pitch.id, pitch.status, pitch.updatedAt]);

  async function apply(action: DraftAction, occurredAt?: string) {
    setError('');
    setMessage('');
    if (action === 'record-reply') { setShowReply(true); return; }
    if (action === 'record-send' && !occurredAt) { setShowDelivery(true); return; }
    if (action === 'approve' && !window.confirm('Approve the current draft under the displayed contact policy?')) return;
    if (action === 'record-send' && !window.confirm('Confirm that you already delivered this exact message outside the workspace.')) return;
    if (action === 'record-conversion' && !window.confirm('Record this as a won deal?')) return;
    setBusy(true);
    try {
      let updated: Pitch;
      switch (action) {
        case 'approve': updated = await apiClient.approvePitch(pitch.id, pitch.updatedAt); break;
        case 'record-send': updated = await apiClient.markPitchSent(pitch.id, pitch.updatedAt, occurredAt!); break;
        default: updated = await apiClient.updatePitch(pitch.id, { status: 'CONVERTED', updatedAt: pitch.updatedAt });
      }
      setShowDelivery(false);
      onUpdate(updated);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update this draft.');
      if (pitch.status === 'DRAFT') {
        apiClient.getDraftEligibility(pitch.id).then(setEligibility).catch(() => setEligibility(null));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyApprovedDraft() {
    setError('');
    setMessage('');
    try {
      const current = await apiClient.getDraftEligibility(pitch.id);
      if (!current.approved || current.updatedAt !== pitch.updatedAt) {
        setEligibility(current);
        throw new Error('The draft or contact policy changed. Review the saved draft again.');
      }
      const text = pitch.subject && pitch.channel === 'COLD_EMAIL' ? `${pitch.subject}\n\n${pitch.body}` : pitch.body;
      await navigator.clipboard.writeText(text);
      setMessage('Approved draft copied.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Clipboard unavailable.'); }
  }

  const current = eligibility?.updatedAt === pitch.updatedAt ? eligibility : null;
  const actions = pitch.status !== 'DRAFT'
    ? availableDraftActions(pitch).filter((action) => action !== 'record-reply' || Boolean(pitch.leadId && pitch.sentAt))
    : current?.eligible ? availableDraftActions({ status: 'DRAFT', approvedAt: current.approved ? pitch.approvedAt : null }) : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pitch.status === 'DRAFT' && current && <span className="text-xs font-semibold text-slate-300">
        {current.approved ? 'Approved under current policy' : eligibilityLabels[current.reason]}
      </span>}
      {actions.map((action) => (
        <button key={action} type="button" disabled={busy} onClick={() => void apply(action)}
          className={engagementButton}>
          {actionLabels[action]}
        </button>
      ))}
      {pitch.status === 'DRAFT' && current?.approved && <button type="button" onClick={() => void copyApprovedDraft()} className={engagementButton}>
        Copy approved draft
      </button>}
      {showDelivery && pitch.status === 'DRAFT' && current?.approved && (
        <form className="basis-full space-y-2 rounded-xl border border-slate-800 p-3" onSubmit={(event) => {
          event.preventDefault();
          const occurredAt = pastEventInstant(time);
          if (occurredAt) void apply('record-send', occurredAt);
          else setError('Enter a delivery time that has already occurred.');
        }}>
          <label className="block text-xs text-slate-300">Actual manual delivery time
            <input type="datetime-local" required step={1} className={engagementField} value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <button type="submit" disabled={busy} className={engagementButton}>Confirm recorded delivery</button>
          <button type="button" disabled={busy} className={engagementButton} onClick={() => setShowDelivery(false)}>Close</button>
        </form>
      )}
      {showReply && pitch.leadId && <CommunicationResponseForm leadId={pitch.leadId} pitchId={pitch.id}
        onSave={(updated) => { setShowReply(false); onUpdate(updated); }} onCancel={() => setShowReply(false)} />}
      {error && <p role="alert" className="basis-full text-xs text-rose-300">{error}</p>}
      {message && <p role="status" className="basis-full text-xs text-emerald-300">{message}</p>}
    </div>
  );
}
