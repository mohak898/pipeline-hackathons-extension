'use client';

import { useState } from 'react';
import { Field, Icon, Modal } from '@/components/ui';
import { useWorkspace } from '@/lib/client/workspace';
import { fromLocalInput, toLocalInput } from '@/lib/client/format';
import { STAGES } from '@/lib/shared/model';

const DATE_FIELDS = [
  ['registrationDeadline', 'Registration closes'],
  ['startTime', 'Hacking starts'],
  ['submissionDeadline', 'Submission due'],
  ['endTime', 'Event ends / results'],
];

function toForm(h = {}) {
  return {
    name: h.name || '', url: h.url || '', stage: h.stage || 'shortlisted', mode: h.mode || 'unknown',
    location: h.location || '', prize: h.prize || '', teamSize: h.teamSize || '', tags: (h.tags || []).join(', '),
    notes: h.notes || '', description: h.description || '', image: h.image || null,
    ...Object.fromEntries(DATE_FIELDS.map(([k]) => [k, toLocalInput(h[k])])),
  };
}

/**
 * Add or edit a hackathon. When adding, "Fetch details" asks the server to
 * read the page (JSON-LD, meta tags, keyword dates) so teammates without the
 * extension can add hackathons from ANY website in two clicks.
 */
export default function HackathonForm({ open, onClose, hackathon, onSaved }) {
  const { api, toast } = useWorkspace();
  const editing = !!hackathon;
  const [f, setF] = useState(() => toForm(hackathon));
  const [registerSelf, setRegisterSelf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [hint, setHint] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function fetchDetails() {
    if (!f.url.trim()) return;
    setFetching(true); setHint('');
    try {
      const r = await api('GET', `unfurl?url=${encodeURIComponent(f.url.trim())}`);
      const d = r.draft || {};
      setF((x) => ({
        ...x,
        name: x.name || d.name || '',
        url: d.url || x.url,
        mode: d.mode || x.mode,
        location: x.location || d.location || '',
        description: x.description || d.description || '',
        image: x.image || d.image || null,
        ...Object.fromEntries(DATE_FIELDS.map(([k]) => [k, x[k] || toLocalInput(d[k])])),
      }));
      const found = DATE_FIELDS.filter(([k]) => d[k]).length;
      setHint(r.error ? r.error : `Filled ${d.name ? 'name' : 'nothing for name'}${found ? ` and ${found} date${found > 1 ? 's' : ''}` : ', no dates found'} — double-check before saving.`);
    } catch { /* toast shown */ }
    setFetching(false);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: f.name, url: f.url || null, stage: f.stage, mode: f.mode, location: f.location, prize: f.prize,
      teamSize: f.teamSize, tags: f.tags, notes: f.notes, description: f.description || null, image: f.image,
      ...Object.fromEntries(DATE_FIELDS.map(([k]) => [k, fromLocalInput(f[k])])),
    };
    try {
      if (editing) {
        await api('PATCH', `hackathons/${hackathon.id}`, body);
        toast('Saved');
        onSaved?.(hackathon);
      } else {
        const r = await api('POST', 'hackathons', { ...body, registerSelf });
        toast(r.merged ? `Already in the pipeline — merged into “${r.hackathon.name}”` : 'Hackathon added');
        onSaved?.(r.hackathon);
      }
      onClose();
    } catch { /* toast shown */ }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} wide title={editing ? 'Edit hackathon' : 'Add a hackathon'}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="hack-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add to pipeline'}</button>
      </>}>
      <form id="hack-form" onSubmit={save} className="grid sm:grid-cols-2 gap-3.5">
        <Field label="Link (any website)" className="sm:col-span-2" hint={hint || 'Devfolio, Devpost, Unstop, MLH, Luma or the hackathon’s own site.'}>
          <div className="flex gap-2">
            <input className="input" type="text" inputMode="url" placeholder="https://…" value={f.url} onChange={set('url')} />
            {!editing && <button type="button" className="btn" onClick={fetchDetails} disabled={fetching || !f.url}>
              <Icon name="sparkle" size={14} />{fetching ? 'Reading…' : 'Fetch details'}</button>}
          </div>
        </Field>
        <Field label="Name" className="sm:col-span-2">
          <input className="input" required maxLength={160} value={f.name} onChange={set('name')} placeholder="e.g. ETHIndia 2026" />
        </Field>
        {DATE_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className="input" type="datetime-local" value={f[k]} onChange={set(k)} />
          </Field>
        ))}
        <Field label="Stage">
          <select className="input" value={f.stage} onChange={set('stage')}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Mode">
          <select className="input" value={f.mode} onChange={set('mode')}>
            <option value="unknown">Not sure</option><option value="online">Online</option>
            <option value="offline">In person</option><option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Location"><input className="input" value={f.location} onChange={set('location')} placeholder="City / venue" /></Field>
        <Field label="Prize pool"><input className="input" value={f.prize} onChange={set('prize')} placeholder="e.g. $20k" /></Field>
        <Field label="Team size"><input className="input" value={f.teamSize} onChange={set('teamSize')} placeholder="e.g. 2–4" /></Field>
        <Field label="Tags" hint="Comma separated"><input className="input" value={f.tags} onChange={set('tags')} placeholder="web3, ai" /></Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input" value={f.notes} onChange={set('notes')} placeholder="Eligibility, tracks, judging criteria, links…" />
        </Field>
        {!editing && (
          <label className="sm:col-span-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={registerSelf} onChange={(e) => setRegisterSelf(e.target.checked)} />
            I’ve already registered for this one
          </label>
        )}
      </form>
    </Modal>
  );
}
