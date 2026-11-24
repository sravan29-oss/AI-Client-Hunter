import { useEffect, useState, type FormEvent } from 'react';
import { Compass, Copy, MapPin, Plus, Target } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Currency, IdealClientProfile, IdealProfileInput, TargetLocation } from '../types';

const field = 'mt-1 w-full rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white focus:border-electric-400 focus:outline-none';
const label = 'block text-xs font-medium text-slate-300';
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-electric-400 aria-pressed:border-electric-500 aria-pressed:bg-electric-950/60 disabled:opacity-50';
const primary = 'rounded-lg bg-electric-600 px-3 py-2 text-xs font-semibold text-white hover:bg-electric-500 disabled:opacity-50';
const industryOptions = ['Restaurants', 'Retail stores', 'Hotels', 'Healthcare businesses', 'Education', 'Real estate', 'E-commerce', 'Travel agencies', 'Offices', 'Local service providers', 'Startups', 'Professional services'];
const sizes = ['1–10', '11–50', '51–200', '201+'];
const newLocation = (): TargetLocation => ({ country: '', city: '', radius: null, schedule: null });
const newProfile = (): IdealProfileInput => ({ name: '', targeting: {
  locations: [newLocation()], industries: [], categories: [], companySizes: [], services: [], minProjectBudget: null, preferredBusinessTypes: [], minLeadScore: 60,
} });
const clean = (entries: string[]) => entries.map((item) => item.trim()).filter(Boolean);
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'The profile request failed.';

export function IdealClientProfilesPanel() {
  const [profiles, setProfiles] = useState<IdealClientProfile[]>([]);
  const [selected, setSelected] = useState<IdealClientProfile>();
  const [draft, setDraft] = useState<IdealProfileInput>();
  const [offerings, setOfferings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function open(profile?: IdealClientProfile) {
    setSelected(profile);
    setDraft(profile ? { name: profile.name, targeting: profile.targeting } : newProfile());
    setError('');
    setNotice('');
  }

  useEffect(() => {
    let live = true;
    apiClient.listIdealProfiles().then((items) => {
      if (!live) return;
      setProfiles(items);
      if (items.length) open(items[0]);
    }).catch((cause) => { if (live) setError(message(cause)); }).finally(() => { if (live) setLoading(false); });
    apiClient.getBusinessKnowledge().then((knowledge) => { if (live) setOfferings(knowledge.profile.services); }).catch(() => {});
    return () => { live = false; };
  }, []);

  async function change(action: () => Promise<IdealClientProfile>, status: string) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const returned = await action();
      open(returned);
      setProfiles((previous) => [returned, ...previous.filter((item) => item.id !== returned.id).map((item) => returned.active ? { ...item, active: false } : item)]);
      setNotice(status);
      try { setProfiles(await apiClient.listIdealProfiles()); } catch { setNotice(`${status} Reload to refresh the profile list.`); }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  function changeTarget<K extends keyof IdealProfileInput['targeting']>(key: K, value: IdealProfileInput['targeting'][K]) {
    setDraft((profile) => profile && ({ ...profile, targeting: { ...profile.targeting, [key]: value } }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const t = draft.targeting;
    void change(() => apiClient.saveIdealProfile({ ...draft, targeting: { ...t,
      industries: clean(t.industries), categories: clean(t.categories), services: clean(t.services), preferredBusinessTypes: clean(t.preferredBusinessTypes),
      locations: t.locations.map((location) => ({ ...location, city: location.city.trim() })),
    } }, selected), 'Profile saved.');
  }

  const dirty = Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify({ name: selected.name, targeting: selected.targeting }));
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-navy-900/60" aria-label="Ideal Client Profiles">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-gradient-to-r from-electric-950/70 to-navy-950 px-5 py-4">
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 text-electric-300" aria-hidden="true" />
          <div><h2 className="font-bold text-white">Ideal Client Profiles</h2><p className="text-xs text-slate-400">Set the audience and locations Auto Hunter should search.</p></div>
        </div>
        <button type="button" className={button} disabled={loading || busy} onClick={() => open()}><Plus className="h-3.5 w-3.5" /> New profile</button>
      </header>
      {error && <p role="alert" className="mx-5 mt-4 text-sm text-rose-300">{error}</p>}
      {notice && <p role="status" className="mx-5 mt-4 text-sm text-emerald-300">{notice}</p>}
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(11rem,1fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-300">Saved profiles</h3>
          {loading ? <p className="text-xs text-slate-400">Loading profiles…</p> : !profiles.length ? <p className="text-xs text-slate-400">Create a profile to start targeting.</p> : null}
          {profiles.map((profile) => (
            <button key={profile.id} type="button" onClick={() => open(profile)} disabled={busy} aria-pressed={selected?.id === profile.id}
              className={`block w-full rounded-xl border px-3 py-2.5 text-left ${selected?.id === profile.id ? 'border-electric-500 bg-electric-950/50' : 'border-slate-800 hover:border-slate-600'}`}>
              <span className="block break-words text-sm font-semibold text-white">{profile.name}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400"><span>{profile.targeting.locations.length} {profile.targeting.locations.length === 1 ? 'location' : 'locations'}</span>
                <span className={profile.active ? 'text-emerald-300' : ''}>{profile.active ? 'Active' : 'Inactive'}</span></span>
            </button>
          ))}
          <p className="text-xs leading-relaxed text-slate-400">Auto Hunter uses the active profile when one is selected. Its existing targeting applies when all profiles are inactive.</p>
        </div>
        {draft && (
          <form onSubmit={submit} className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-end gap-2">
              <label className={`min-w-48 flex-1 ${label}`}>Profile name<input className={field} required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              {selected && <><button type="button" className={button} disabled={busy || dirty} onClick={() => void change(() => apiClient.duplicateIdealProfile(selected), 'Profile duplicated.')}><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                <button type="button" className={button} disabled={busy || dirty} onClick={() => void change(() => apiClient.activateIdealProfile(selected, !selected.active), selected.active ? 'Profile deactivated.' : 'Profile activated.')}>{selected.active ? 'Deactivate' : 'Activate'}</button></>}
            </div>
            <div className="space-y-3 rounded-xl border border-slate-800 bg-navy-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-white"><MapPin className="h-4 w-4 text-electric-300" /> Target locations</h3>
                <button type="button" className={button} disabled={draft.targeting.locations.length >= 40} onClick={() => changeTarget('locations', [...draft.targeting.locations, newLocation()])}>Add location</button></div>
              {draft.targeting.locations.map((location, index) => <LocationEditor key={index} location={location} index={index}
                onChange={(value) => changeTarget('locations', draft.targeting.locations.map((item, position) => position === index ? value : item))}
                onRemove={draft.targeting.locations.length > 1 ? () => changeTarget('locations', draft.targeting.locations.filter((_, position) => position !== index)) : undefined} />)}
            </div>
            <div className="space-y-4 rounded-xl border border-slate-800 bg-navy-950/50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Compass className="h-4 w-4 text-electric-300" /> Audience and qualification</h3>
              <label className={label}>Industries, one per line<textarea className={field} required rows={2} value={draft.targeting.industries.join('\n')} onChange={(e) => changeTarget('industries', e.target.value.split('\n'))} /></label>
              <div className="flex flex-wrap gap-1.5">{industryOptions.map((industry) => <button type="button" key={industry} className={button} aria-pressed={draft.targeting.industries.includes(industry)}
                onClick={() => changeTarget('industries', draft.targeting.industries.includes(industry) ? draft.targeting.industries.filter((item) => item !== industry) : [...clean(draft.targeting.industries), industry])}>{industry}</button>)}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>Business categories, one per line<textarea className={field} rows={2} value={draft.targeting.categories.join('\n')} placeholder="Bakery" onChange={(e) => changeTarget('categories', e.target.value.split('\n'))} /></label>
                <label className={label}>Preferred business types, one per line<textarea className={field} rows={2} value={draft.targeting.preferredBusinessTypes.join('\n')} onChange={(e) => changeTarget('preferredBusinessTypes', e.target.value.split('\n'))} /></label>
              </div>
              <fieldset><legend className="text-xs font-medium text-slate-300">Company size in employees</legend><div className="mt-2 flex flex-wrap gap-3">{sizes.map((size) => <label key={size} className="flex items-center gap-1 text-xs text-slate-200"><input type="checkbox" checked={draft.targeting.companySizes.includes(size)} onChange={(e) => changeTarget('companySizes', e.target.checked ? [...draft.targeting.companySizes, size] : draft.targeting.companySizes.filter((item) => item !== size))} />{size}</label>)}</div></fieldset>
              <label className={label}>Target services, one per line<textarea className={field} required rows={2} value={draft.targeting.services.join('\n')} onChange={(e) => changeTarget('services', e.target.value.split('\n'))} /></label>
              {offerings.length > 0 && <select aria-label="Add a saved service" className={field} value="" onChange={(e) => { if (e.target.value) changeTarget('services', [...new Set([...clean(draft.targeting.services), e.target.value])]); }}><option value="">Add a service from your business profile</option>{offerings.map((service) => <option key={service}>{service}</option>)}</select>}
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset><legend className="text-xs font-medium text-slate-300">Minimum project budget</legend><div className="flex flex-wrap gap-2"><input aria-label="Minimum budget amount" className={`${field} min-w-28 flex-1`} type="number" min="1" max="100000000" placeholder="Optional" value={draft.targeting.minProjectBudget?.amount || ''} onChange={(e) => changeTarget('minProjectBudget', e.target.value ? { amount: e.target.valueAsNumber, currency: draft.targeting.minProjectBudget?.currency ?? 'INR' } : null)} />
                    <select aria-label="Budget currency" className={`${field} w-24`} disabled={!draft.targeting.minProjectBudget} value={draft.targeting.minProjectBudget?.currency ?? 'INR'} onChange={(e) => draft.targeting.minProjectBudget && changeTarget('minProjectBudget', { ...draft.targeting.minProjectBudget, currency: e.target.value as Currency })}>{['INR', 'USD', 'EUR', 'GBP'].map((currency) => <option key={currency}>{currency}</option>)}</select></div></fieldset>
                <label className={label}>Minimum lead score<input type="number" min="0" max="100" step="1" required className={field} value={Number.isFinite(draft.targeting.minLeadScore) ? draft.targeting.minLeadScore : ''} onChange={(e) => changeTarget('minLeadScore', e.target.valueAsNumber)} /></label>
              </div>
              <p className="text-xs text-slate-400">Discovery records unknown company size, budget, and business type as unverified.</p>
            </div>
            <button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save profile'}</button>
          </form>
        )}
      </div>
    </section>
  );
}

function LocationEditor({ location, index, onChange, onRemove }: { location: TargetLocation; index: number; onChange: (location: TargetLocation) => void; onRemove?: () => void }) {
  const coordinate = (key: 'latitude' | 'longitude' | 'km', value: number) => location.radius && onChange({ ...location, radius: { ...location.radius, [key]: value } });
  return <fieldset className="space-y-3 rounded-lg border border-slate-800 p-3">
    <legend className="px-1 text-xs font-semibold text-slate-400">Location {index + 1}</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={label}>Country or ISO code<input className={field} required maxLength={120} value={location.country} placeholder="India or IN" onChange={(e) => onChange({ ...location, country: e.target.value })} /></label>
      <label className={label}>City<input className={field} required={Boolean(location.radius)} maxLength={120} value={location.city} placeholder="Optional for country-wide search" onChange={(e) => onChange({ ...location, city: e.target.value })} /></label>
    </div>
    <label className={label}>Location schedule<select className={field} value={location.schedule?.mode ?? 'inherit'} onChange={(e) => onChange({ ...location, schedule: e.target.value === 'inherit' ? null : { mode: e.target.value as NonNullable<TargetLocation['schedule']>['mode'], time: location.schedule?.time ?? '09:00', timezone: location.schedule?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') } })}>
      <option value="inherit">Use Auto Hunter schedule</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly on Monday</option><option value="MANUAL">Run now only</option></select></label>
    {location.schedule && location.schedule.mode !== 'MANUAL' && <div className="grid gap-3 sm:grid-cols-2">
      <label className={label}>Discovery time<input type="time" required className={field} value={location.schedule.time} onChange={(e) => onChange({ ...location, schedule: { ...location.schedule!, time: e.target.value } })} /></label>
      <label className={label}>IANA time zone<input required className={field} placeholder="Asia/Kolkata" value={location.schedule.timezone} onChange={(e) => onChange({ ...location, schedule: { ...location.schedule!, timezone: e.target.value } })} /></label>
    </div>}
    <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(location.radius)} onChange={(e) => onChange({ ...location, radius: e.target.checked ? { latitude: NaN, longitude: NaN, km: 5 } : null })} /> Limit by radius with Overpass</label>
    {location.radius && <div className="grid gap-3 sm:grid-cols-3">{([['latitude', 'Latitude', -90, 90], ['longitude', 'Longitude', -180, 180], ['km', 'Radius in km', 0.1, 100]] as const).map(([key, title, min, max]) => <label key={key} className={label}>{title}<input required type="number" step="any" min={min} max={max} className={field} value={Number.isFinite(location.radius![key]) ? location.radius![key] : ''} onChange={(e) => coordinate(key, e.target.valueAsNumber)} /></label>)}</div>}
    {onRemove && <button className={button} type="button" onClick={onRemove}>Remove location</button>}
  </fieldset>;
}
