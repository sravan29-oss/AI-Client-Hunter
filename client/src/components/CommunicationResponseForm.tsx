import { useState, type FormEvent } from 'react';
import { apiClient } from '../api/client';
import type { Pitch } from '../types';
import type { ResponseKind } from '../types/engagement';
import { engagementButton, engagementField, pastEventInstant, responseLabels } from '../utils/engagement';

export function CommunicationResponseForm({ leadId, pitchId, onSave, onCancel }: {
  leadId: string; pitchId: string; onSave: (pitch: Pitch) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<ResponseKind>('QUESTION');
  const [summary, setSummary] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const occurredAt = pastEventInstant(localTime);
    if (!occurredAt) { setError('Enter the time when the client actually responded.'); return; }
    setBusy(true);
    setError('');
    try {
      const { pitch } = await apiClient.recordLeadResponse(leadId, { pitchId, kind, summary, occurredAt });
      onSave(pitch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record the response.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="basis-full space-y-3 rounded-xl border border-slate-800 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Response or objection
          <select value={kind} onChange={(event) => setKind(event.target.value as ResponseKind)} className={engagementField}>
            {Object.entries(responseLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-300">Actual response time
          <input type="datetime-local" required step={1} value={localTime} onChange={(event) => setLocalTime(event.target.value)} className={engagementField} />
        </label>
      </div>
      {kind === 'OPT_OUT' && <p className="text-xs text-amber-300">Saving this response also applies suppression.</p>}
      <label className="block text-xs text-slate-300">What the client actually said
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} required rows={2} minLength={3} maxLength={1500} className={engagementField} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={engagementButton}>Save actual response</button>
        <button type="button" disabled={busy} onClick={onCancel} className={engagementButton}>Close</button>
      </div>
    </form>
  );
}
