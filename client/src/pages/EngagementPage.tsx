import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '../api/client';
import { CommunicationResponseForm } from '../components/CommunicationResponseForm';
import type { Lead } from '../types';
import type { CampaignChannel, CampaignInput, CampaignPreview, ContactScope, ContactStatus, LeadEngagement, OutreachCampaign } from '../types/engagement';
import {
  channelLabels, eligibilityLabels, engagementButton, engagementField, policyChoices, responseLabels, statusLabels,
} from '../utils/engagement';

const blankCampaign: CampaignInput = { name: '', channel: 'COLD_EMAIL', criteria: { minimumScore: 0, qualifiedOnly: false } };
const panel = 'space-y-4 rounded-2xl border border-slate-800 bg-navy-900/60 p-4';
const title = 'text-sm font-semibold text-white';
const label = 'block space-y-1 text-xs text-slate-300';
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function EngagementPage({ leads, initialLeadId, onOpenLead, onFollowUp, onDraft, onOpenDraft, onUpdated }: {
  leads: Lead[];
  initialLeadId: string;
  onOpenLead: (leadId: string) => void;
  onFollowUp: (leadId: string) => void;
  onDraft: (leadId: string, campaign: OutreachCampaign) => void;
  onOpenDraft: (pitchId: string) => void;
  onUpdated: () => void;
}) {
  const [view, setView] = useState<'campaigns' | 'lead'>(initialLeadId ? 'lead' : 'campaigns');
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [campaignForm, setCampaignForm] = useState<CampaignInput>(blankCampaign);
  const [archived, setArchived] = useState(false);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [leadId, setLeadId] = useState(initialLeadId);
  const [engagement, setEngagement] = useState<LeadEngagement | null>(null);
  const [scope, setScope] = useState<ContactScope>('COLD_EMAIL');
  const [status, setStatus] = useState<ContactStatus | ''>('');
  const [evidence, setEvidence] = useState('');
  const [replyPitch, setReplyPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);

  const selectedCampaign = campaigns.find((item) => item.id === campaignId);
  const policy = engagement?.policies.find((item) => item.scope === scope);
  const delivered = engagement?.drafts.filter((item) => item.sentAt) ?? [];

  useEffect(() => {
    apiClient.getCampaigns().then(setCampaigns).catch((err: Error) => setError(err.message));
  }, []);
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (campaignId && view === 'campaigns') {
      apiClient.getCampaignSegment(campaignId).then((result) => { if (active) setPreview(result); })
        .catch((err: Error) => { if (active) setError(err.message); });
    }
    return () => { active = false; };
  }, [campaignId, view, version]);
  useEffect(() => {
    let active = true;
    setEngagement(null);
    setReplyPitch('');
    if (leadId && view === 'lead') {
      apiClient.getLeadEngagement(leadId).then((result) => { if (active) setEngagement(result); })
        .catch((err: Error) => { if (active) setError(err.message); });
    }
    return () => { active = false; };
  }, [leadId, view, version]);

  function selectCampaign(id: string) {
    const campaign = campaigns.find((item) => item.id === id);
    setCampaignId(id);
    setCampaignForm(campaign ? { name: campaign.name, channel: campaign.channel, criteria: campaign.criteria } : blankCampaign);
    setArchived(Boolean(campaign?.archivedAt));
    setError('');
    setNotice('');
  }

  function selectLead(id: string) {
    setLeadId(id);
    setStatus('');
    setEvidence('');
    setError('');
    setNotice('');
    setView('lead');
  }

  function updated(message: string) {
    setNotice(message);
    setVersion((current) => current + 1);
    onUpdated();
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const saved = selectedCampaign
        ? await apiClient.updateCampaign(selectedCampaign.id, { ...campaignForm, revision: selectedCampaign.revision, archived })
        : await apiClient.createCampaign(campaignForm);
      setCampaigns((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setCampaignId(saved.id);
      setCampaignForm({ name: saved.name, channel: saved.channel, criteria: saved.criteria });
      setArchived(Boolean(saved.archivedAt));
      updated('Campaign saved.');
    } catch (err) { setError(errorText(err, 'Unable to save the campaign.')); }
    finally { setBusy(false); }
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || !status) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await apiClient.updateContactPolicy(leadId, { scope, status, evidence, version: policy.version });
      setStatus('');
      setEvidence('');
      updated('Communication policy saved.');
    } catch (err) {
      setError(errorText(err, 'Unable to save the policy.'));
      setVersion((current) => current + 1);
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-white">Client engagement</h1>
          <p className="mt-1 text-sm text-slate-400">Plan campaigns, manage consent, and record actual conversations. Drafts only.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-pressed={view === 'campaigns'} className={engagementButton} onClick={() => { setView('campaigns'); setError(''); setNotice(''); }}>Campaigns</button>
          <button type="button" aria-pressed={view === 'lead'} className={engagementButton} onClick={() => { setView('lead'); setError(''); setNotice(''); }}>Lead communications</button>
        </div>
      </header>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}

      {view === 'campaigns' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_2fr]">
          <section className={panel} aria-label="Campaign settings">
            <label className={label}>Saved campaign
              <select value={campaignId} onChange={(event) => selectCampaign(event.target.value)} className={engagementField}>
                <option value="">New campaign</option>
                {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.archivedAt ? ' (archived)' : ''}</option>)}
              </select>
            </label>
            <form onSubmit={saveCampaign} className="space-y-3">
              <label className={label}>Campaign name
                <input className={engagementField} required maxLength={120} value={campaignForm.name}
                  onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })} />
              </label>
              <label className={label}>Draft channel
                <select value={campaignForm.channel} onChange={(event) => setCampaignForm({ ...campaignForm, channel: event.target.value as CampaignChannel })} className={engagementField}>
                  <option value="COLD_EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['country', 'city', 'industry'] as const).map((key) => <label key={key} className={label}>
                  {{ country: 'Country', city: 'City', industry: 'Industry' }[key]}
                  <input className={engagementField} maxLength={100} value={campaignForm.criteria[key] ?? ''}
                    onChange={(event) => setCampaignForm({ ...campaignForm, criteria: { ...campaignForm.criteria, [key]: event.target.value || undefined } })} />
                </label>)}
                <label className={label}>Minimum score
                  <input className={engagementField} type="number" min={0} max={100} value={campaignForm.criteria.minimumScore}
                    onChange={(event) => setCampaignForm({ ...campaignForm, criteria: { ...campaignForm.criteria, minimumScore: Number(event.target.value) } })} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={campaignForm.criteria.qualifiedOnly}
                  onChange={(event) => setCampaignForm({ ...campaignForm, criteria: { ...campaignForm.criteria, qualifiedOnly: event.target.checked } })} />
                Qualified leads only
              </label>
              {selectedCampaign && <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
                Archive campaign
              </label>}
              <button type="submit" disabled={busy} className={engagementButton}>Save campaign</button>
            </form>
          </section>
          <section className={panel} aria-labelledby="segment-preview">
            <h2 id="segment-preview" className={title}>Segment preview</h2>
            {!selectedCampaign && <p className="text-sm text-slate-400">Save a campaign to see eligible and restricted leads.</p>}
            {selectedCampaign && !preview && !error && <p role="status" className="text-sm text-slate-400">Loading segment…</p>}
            {preview && <p className="text-sm text-slate-400">{preview.matches} CRM matches{preview.matches > preview.rows.length ? ` · first ${preview.rows.length} shown` : ''}</p>}
            {preview?.rows.map((lead) => (
              <article key={lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-3">
                <div>
                  <h3 className={title}>{lead.businessName}</h3>
                  <p className="text-xs text-slate-400">{[lead.city, lead.country, lead.industry, `Score ${lead.opportunityScore}`].filter(Boolean).join(' · ')}</p>
                  <p className={`text-xs ${lead.reason === 'ELIGIBLE' ? 'text-emerald-300' : 'text-amber-300'}`}>{eligibilityLabels[lead.reason]}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={engagementButton} onClick={() => selectLead(lead.id)}>Review lead policy</button>
                  {lead.draft ? <button type="button" className={engagementButton} onClick={() => onOpenDraft(lead.draft!.id)}>Open saved draft</button>
                    : selectedCampaign && !selectedCampaign.archivedAt && lead.reason === 'ELIGIBLE' &&
                      <button type="button" className={engagementButton} onClick={() => onDraft(lead.id, selectedCampaign)}>Draft in Pitch Studio</button>}
                </div>
              </article>
            ))}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className={label}>CRM lead
              <select className={engagementField} value={leadId} onChange={(event) => selectLead(event.target.value)}>
                <option value="">Select a lead</option>
                {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.businessName}</option>)}
              </select>
            </label>
            {leadId && <button type="button" className={engagementButton} onClick={() => onOpenLead(leadId)}>Open CRM lead</button>}
          </div>
          {leadId && !engagement && !error && <p role="status" className="text-sm text-slate-400">Loading communications…</p>}
          {engagement && <div className="grid gap-4 lg:grid-cols-2">
            <section className={panel}>
              <h2 className={title}>Consent and suppression</h2>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                {engagement.policies.map((item) => <div key={item.scope} className="rounded-lg border border-slate-800 p-2">
                  <dt className="text-slate-400">{channelLabels[item.scope]}</dt><dd className="break-words text-white">{eligibilityLabels[item.reason]}</dd>
                </div>)}
              </dl>
              <form onSubmit={savePolicy} className="space-y-3">
                <label className={label}>Policy scope
                  <select className={engagementField} value={scope} onChange={(event) => { setScope(event.target.value as ContactScope); setStatus(''); setEvidence(''); }}>
                    {engagement.policies.map((item) => <option key={item.scope} value={item.scope}>{channelLabels[item.scope]}</option>)}
                  </select>
                </label>
                {policy?.recipient && <p className="break-all text-xs text-slate-400">Current recipient · {policy.recipient}</p>}
                {policy?.evidence && <p className="break-words text-xs text-slate-400">Recorded reference · {policy.evidence}</p>}
                <label className={label}>Decision
                  <select className={engagementField} required value={status} onChange={(event) => setStatus(event.target.value as ContactStatus | '')}>
                    <option value="">Choose a decision</option>
                    {policyChoices(scope).map((choice) => <option key={choice} value={choice}>{statusLabels[choice]}</option>)}
                  </select>
                </label>
                <label className={label}>Evidence or reference
                  <textarea className={engagementField} required minLength={5} maxLength={1000} rows={2}
                    placeholder="Record the actual source and date of permission or the stop request."
                    value={evidence} onChange={(event) => setEvidence(event.target.value)} />
                </label>
                <button type="submit" disabled={busy || !policy} className={engagementButton}>Save policy decision</button>
              </form>
            </section>
            <div className="space-y-4">
              <section className={panel}>
                <h2 className={title}>Follow-up recommendation</h2>
                <p className="text-sm text-slate-300">{engagement.recommendation.text}</p>
                {engagement.recommendation.suggestionAt && <p className="text-xs text-slate-400">{new Date(engagement.recommendation.suggestionAt).toLocaleString()}</p>}
                {!['HOLD', 'SCHEDULED'].includes(engagement.recommendation.kind) &&
                  <button type="button" className={engagementButton} onClick={() => onFollowUp(leadId)}>Open follow-up scheduler</button>}
              </section>
              <section className={panel}>
                <h2 className={title}>Record a client response</h2>
                <label className={label}>Associated manual delivery
                  <select className={engagementField} value={replyPitch} onChange={(event) => setReplyPitch(event.target.value)}>
                    <option value="">{delivered.length ? 'Choose a recorded delivery' : 'No recorded deliveries for this lead'}</option>
                    {delivered.map((pitch) => <option key={pitch.id} value={pitch.id}>{pitch.subject || channelLabels[pitch.channel]} · {new Date(pitch.sentAt!).toLocaleString()}</option>)}
                  </select>
                </label>
                {replyPitch && <CommunicationResponseForm key={replyPitch} leadId={leadId} pitchId={replyPitch}
                  onSave={() => updated('Client response recorded.')} onCancel={() => setReplyPitch('')} />}
              </section>
            </div>
          </div>}
          {engagement && <section className={panel} aria-labelledby="communication-timeline">
            <h2 id="communication-timeline" className={title}>Communication timeline</h2>
            {!engagement.timeline.length && <p className="text-sm text-slate-400">No communication events recorded.</p>}
            <ol className="space-y-2">
              {engagement.timeline.map((item) => <li key={item.id} className="rounded-lg border border-slate-800 p-3 text-xs">
                <p className="font-semibold text-white">{item.kind ? responseLabels[item.kind] : item.description}</p>
                <p className="text-slate-400">{item.channel ? channelLabels[item.channel] + ' · ' : ''}{new Date(item.occurredAt ?? item.createdAt).toLocaleString()}</p>
                {item.detail && <p className="whitespace-pre-wrap break-words text-slate-300">{item.detail}</p>}
              </li>)}
            </ol>
            {engagement.drafts.length > 0 && <details className="text-xs text-slate-300">
              <summary className="cursor-pointer font-semibold text-white">Saved communication records</summary>
              <ul className="mt-2 space-y-2">
                {engagement.drafts.map((pitch) => <li key={pitch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-2">
                  <div>
                    <p className="font-semibold text-white">{pitch.subject || 'Outreach draft'}</p>
                    <p className="text-slate-400">
                      {pitch.messageType === 'INSTAGRAM_DM' ? 'Instagram' : channelLabels[pitch.channel]} · {pitch.sentAt
                        ? `Delivery recorded for ${new Date(pitch.sentAt).toLocaleString()}`
                        : `Draft saved ${new Date(pitch.createdAt).toLocaleString()}`}
                    </p>
                  </div>
                  {pitch.messageType !== 'SERVICE_PROPOSAL' && <button type="button" className={engagementButton} onClick={() => onOpenDraft(pitch.id)}>Open in Pitch Studio</button>}
                </li>)}
              </ul>
            </details>}
          </section>}
        </div>
      )}
    </section>
  );
}
