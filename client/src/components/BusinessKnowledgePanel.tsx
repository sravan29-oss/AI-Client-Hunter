import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '../api/client';
import type { BusinessKnowledge, BusinessProfile, PortfolioProject, PortfolioProjectInput, ProjectClaim, ProjectClaimKind } from '../types';

const panel = 'space-y-4 rounded-2xl border border-slate-800 bg-navy-900/60 p-5';
const field = 'mt-1 w-full rounded-xl border border-slate-700 bg-navy-950 px-3 py-2 text-sm text-white focus:border-electric-400 focus:outline-none';
const button = 'rounded-lg border border-slate-700 bg-navy-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-electric-400 disabled:opacity-50';
const primary = 'rounded-lg bg-electric-600 px-3 py-2 text-xs font-semibold text-white hover:bg-electric-500 disabled:opacity-50';
const claimLabels: Record<ProjectClaimKind, string> = {
  description: 'Description', feature: 'Feature', technology: 'Technology', business_problem: 'Business problem solved', screenshot: 'Screenshot',
};
const emptyProject: PortfolioProjectInput = { name: '', url: '', serviceCategories: [], claims: [], shareable: false };
const parseLines = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The change could not be saved.';

export function BusinessKnowledgePanel() {
  const [knowledge, setKnowledge] = useState<BusinessKnowledge>();
  const [profileDraft, setProfileDraft] = useState<BusinessProfile>();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    apiClient.getBusinessKnowledge().then((data) => {
      if (!live) return;
      setKnowledge(data);
      setProfileDraft(data.profile);
    }).catch((cause) => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, []);

  function changeProfile<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setProfileDraft((profile) => profile && { ...profile, [key]: value });
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileDraft) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const profile = await apiClient.saveBusinessProfile({ ...profileDraft, services: parseLines(profileDraft.services), technologies: parseLines(profileDraft.technologies) });
      setProfileDraft(profile);
      setKnowledge((current) => current && { ...current, profile });
      setNotice('Business profile saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  function updateProject(project: PortfolioProject, message: string) {
    setKnowledge((current) => {
      if (!current) return current;
      const projects = current.projects.some((item) => item.id === project.id)
        ? current.projects.map((item) => item.id === project.id ? project : item)
        : [...current.projects, project];
      return { ...current, projects };
    });
    setAdding(false);
    setNotice(message);
  }

  return (
    <>
      {notice && <p role="status" className="rounded-xl border border-emerald-700 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">{error}</p>}
      <section className={panel}>
        <h2 className="text-sm font-bold text-white">Business profile</h2>
        {knowledge?.storage === 'temporary' && <p className="text-xs text-amber-300">Temporary preview. Connect PostgreSQL to keep these edits after restart.</p>}
        {!profileDraft && !error && <p role="status" className="text-xs text-slate-400">Loading business profile…</p>}
        {profileDraft && (
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Professional name
                <input required maxLength={120} className={field} value={profileDraft.displayName} onChange={(e) => changeProfile('displayName', e.target.value)} />
              </label>
              <label className="text-xs text-slate-300">Default currency
                <select className={field} value={profileDraft.defaultCurrency} onChange={(e) => changeProfile('defaultCurrency', e.target.value as BusinessProfile['defaultCurrency'])}>
                  {['INR', 'USD', 'EUR', 'GBP'].map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs text-slate-300">Professional role
              <input required maxLength={160} className={field} value={profileDraft.professionalRole} onChange={(e) => changeProfile('professionalRole', e.target.value)} />
            </label>
            <label className="block text-xs text-slate-300">Personal portfolio URL
              <input required type="url" maxLength={500} className={field} value={profileDraft.portfolioUrl} onChange={(e) => changeProfile('portfolioUrl', e.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Services, one per line
                <textarea required rows={6} className={field} value={profileDraft.services.join('\n')} onChange={(e) => changeProfile('services', e.target.value.split('\n'))} />
              </label>
              <label className="text-xs text-slate-300">Technologies, one per line
                <textarea rows={6} className={field} value={profileDraft.technologies.join('\n')} onChange={(e) => changeProfile('technologies', e.target.value.split('\n'))} />
              </label>
            </div>
            <button type="submit" disabled={saving} className={primary}>{saving ? 'Saving…' : 'Save business profile'}</button>
          </form>
        )}
      </section>

      {knowledge && (
        <section className={panel}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-white">Project knowledge base</h2>
            {!adding && <button type="button" onClick={() => { setAdding(true); setNotice(''); }} className={button}>Add project</button>}
          </div>
          <p className="text-xs text-slate-400">A draft can reference a project after you enable sharing and approve a claim with supporting evidence.</p>
          {adding && <ProjectEditor onSaved={updateProject} onCancel={() => setAdding(false)} />}
          {knowledge.projects.map((project) => (
            <details key={project.id} className="rounded-xl border border-slate-700 bg-navy-950/50 px-3 py-2.5">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                {project.name}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {project.archivedAt ? 'Archived' : project.shareable && project.claims.some((claim) => claim.approved && claim.kind !== 'screenshot') ? 'Approved for drafts' : 'Awaiting approval'}
                </span>
              </summary>
              <ProjectEditor key={project.revision} project={project} onSaved={updateProject} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}

function ProjectEditor({ project, onSaved, onCancel }: {
  project?: PortfolioProject;
  onSaved: (project: PortfolioProject, message: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<PortfolioProjectInput>(project ?? emptyProject);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateClaim(index: number, changes: Partial<ProjectClaim>) {
    setDraft((current) => ({ ...current, claims: current.claims.map((claim, position) => position === index ? { ...claim, approved: false, ...changes } : claim) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const input = { ...draft, serviceCategories: parseLines(draft.serviceCategories), claims: draft.claims.map((claim) => ({ ...claim, evidenceUrl: claim.evidenceUrl?.trim() || undefined })) };
      const saved = project ? await apiClient.savePortfolioProject(project.id, project.revision, input) : await apiClient.createPortfolioProject(input);
      onSaved(saved, 'Portfolio project saved.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  async function archive() {
    if (!project) return;
    setSaving(true);
    setError('');
    try {
      const archived = !project.archivedAt;
      onSaved(await apiClient.setPortfolioArchive(project, archived), archived ? 'Project archived.' : 'Project restored.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Project name
          <input required maxLength={160} className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, shareable: false })} />
        </label>
        <label className="text-xs text-slate-300">Project URL
          <input required type="url" maxLength={500} className={field} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value, shareable: false })} />
        </label>
      </div>
      <label className="block text-xs text-slate-300">Relevant services, one per line
        <textarea rows={2} className={field} value={draft.serviceCategories.join('\n')} onChange={(e) => setDraft({ ...draft, serviceCategories: e.target.value.split('\n') })} />
      </label>
      {draft.claims.map((claim, index) => (
        <fieldset key={index} className="space-y-2 rounded-lg border border-slate-800 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-300">Project evidence</legend>
          <label className="block text-xs text-slate-300">Claim type
            <select className={field} value={claim.kind} onChange={(e) => updateClaim(index, { kind: e.target.value as ProjectClaimKind })}>
              {Object.entries(claimLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-300">Claim
            <input required maxLength={500} className={field} value={claim.statement} onChange={(e) => updateClaim(index, { statement: e.target.value })} />
          </label>
          <label className="block text-xs text-slate-300">Evidence source
            <input required maxLength={300} className={field} value={claim.evidence} onChange={(e) => updateClaim(index, { evidence: e.target.value })} placeholder="Public page or project material" />
          </label>
          <label className="block text-xs text-slate-300">{claim.kind === 'screenshot' ? 'Screenshot URL' : 'Evidence URL (optional)'}
            <input required={claim.kind === 'screenshot'} type="url" maxLength={500} className={field} value={claim.evidenceUrl ?? ''} onChange={(e) => updateClaim(index, { evidenceUrl: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input type="checkbox" checked={claim.approved} onChange={(e) => updateClaim(index, { approved: e.target.checked })} />
              Approve this claim
            </label>
            <button type="button" className={button} onClick={() => setDraft({ ...draft, claims: draft.claims.filter((_, position) => position !== index) })}>Remove claim</button>
          </div>
        </fieldset>
      ))}
      <button type="button" className={button} disabled={draft.claims.length >= 30} onClick={() => setDraft({ ...draft, claims: [...draft.claims, { kind: 'description', statement: '', evidence: '', approved: false }] })}>Add evidence</button>
      <label className="flex items-center gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={draft.shareable} onChange={(e) => setDraft({ ...draft, shareable: e.target.checked })} />
        Allow this project in outreach drafts
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primary}>{saving ? 'Saving…' : 'Save project'}</button>
        {project && <button type="button" className={button} disabled={saving} onClick={archive}>{project.archivedAt ? 'Restore project' : 'Archive project'}</button>}
        {onCancel && <button type="button" className={button} disabled={saving} onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
