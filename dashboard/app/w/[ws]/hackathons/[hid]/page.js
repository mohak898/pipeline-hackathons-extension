'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useNow } from '@/lib/client/hooks';
import { useWorkspace } from '@/lib/client/workspace';
import { Avatar, Countdown, Empty, Icon, PlatformBadge, RichText, Segmented, StageBadge } from '@/components/ui';
import HackathonForm from '@/components/HackathonForm';
import Thread from '@/components/Thread';
import Tasks from '@/components/Tasks';
import Ideas from '@/components/Ideas';
import { STAGES, hackathonDeadlines } from '@/lib/shared/model';
import { fmtDate, fromLocalInput, PLATFORM_META } from '@/lib/client/format';

export default function HackathonDetail() {
  const { hid } = useParams();
  const router = useRouter();
  const { snap, api, me, isLead, wsId, toast, memberById } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('plan');
  const h = snap.hackathons.find((x) => x.id === hid);

  if (!h) return <Empty icon="trophy" title="Hackathon not found" action={<Link className="btn" href={`/w/${wsId}/hackathons`}>Back to hackathons</Link>}>It may have been deleted.</Empty>;

  const projects = snap.projects.filter((p) => p.hackathonId === h.id);
  const registered = !!h.registrations?.[me.id];
  const canDelete = isLead || h.createdBy === me.id;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/w/${wsId}/hackathons`} className="text-[13px] text-muted hover:text-ink w-fit">← Hackathons</Link>

      <header className="flex flex-col sm:flex-row sm:items-start gap-4">
        <PlatformBadge platform={h.platform} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{h.name}</h1>
          <p className="text-muted text-[13px] mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <span>{PLATFORM_META[h.platform]?.label || 'Website'}</span>
            {h.mode && h.mode !== 'unknown' && <span className="capitalize">{h.mode === 'offline' ? 'In person' : h.mode}</span>}
            {h.location && <span>{h.location}</span>}
            {h.prize && <span>🏆 {h.prize}</span>}
            {h.teamSize && <span>Team {h.teamSize}</span>}
            <span>Added by {memberById[h.createdBy]?.name || 'extension'}{h.source === 'extension' ? ' (extension)' : ''}</span>
          </p>
          {h.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{h.tags.map((t) => <span key={t} className="badge">#{t}</span>)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {h.url && <a className="btn" href={h.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />Open page</a>}
          <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} />Edit</button>
          <select className="input w-auto" value={h.stage} onChange={(e) => api('PATCH', `hackathons/${h.id}`, { stage: e.target.value })} aria-label="Stage">
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </header>

      {h.stage === 'discovered' && (
        <div className="card p-4 flex flex-wrap items-center gap-3 urgency-soon">
          <p className="flex-1 min-w-[200px] text-[13.5px]"><span className="font-semibold">In the inbox.</span> <span className="text-muted">Shortlist it to put it on everyone’s radar — teammates will be nudged to register.</span></p>
          <button className="btn btn-primary" onClick={() => api('PATCH', `hackathons/${h.id}`, { stage: 'shortlisted' })}>Shortlist</button>
          <button className="btn" onClick={() => api('PATCH', `hackathons/${h.id}`, { archived: true }).then(() => toast('Archived'))}>Not for us</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <Dates h={h} />
          <section>
            <div className="flex items-center justify-between mb-3">
              <Segmented value={tab} onChange={setTab} options={[
                { value: 'plan', label: 'Projects & tasks' }, { value: 'ideas', label: 'Ideas' }, { value: 'discuss', label: 'Discussion' },
              ]} />
            </div>
            {tab === 'plan' && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  {projects.map((p) => (
                    <Link key={p.id} href={`/w/${wsId}/projects/${p.id}`} className="card card-hover p-3.5 flex items-center gap-3">
                      <Icon name="folder" className="text-muted" />
                      <span className="font-semibold flex-1 truncate">{p.name}</span>
                      <span className="badge capitalize">{p.status}</span>
                    </Link>
                  ))}
                  <NewProjectInline hackathonId={h.id} />
                </div>
                <div>
                  <p className="section-title mb-2">Hackathon tasks</p>
                  <Tasks hackathonId={h.id} />
                </div>
              </div>
            )}
            {tab === 'ideas' && <Ideas hackathonId={h.id} />}
            {tab === 'discuss' && <Thread threadType="hackathon" threadId={h.id} placeholder={`Discuss ${h.name}…`} />}
          </section>
        </div>

        <aside className="flex flex-col gap-4 min-w-0">
          <section className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">Team registration</p>
              <span className="text-[12px] text-muted">{Object.keys(h.registrations || {}).filter((id) => memberById[id]).length}/{snap.members.length}</span>
            </div>
            <p className="text-[12.5px] text-muted mb-3">Most platforms need every teammate registered individually.</p>
            <div className="flex flex-col gap-1.5">
              {snap.members.map((m) => {
                const done = !!h.registrations?.[m.id];
                const can = m.id === me.id || isLead;
                return (
                  <div key={m.id} className="flex items-center gap-2.5 py-1">
                    <Avatar member={m} size={24} />
                    <span className="flex-1 text-[13px]">{m.name}{m.id === me.id && <span className="text-faint"> (you)</span>}</span>
                    {can ? (
                      <button className={`btn btn-sm ${done ? '' : m.id === me.id ? 'btn-primary' : ''}`}
                        onClick={() => api('POST', `hackathons/${h.id}/registration`, { memberId: m.id, registered: !done })}>
                        {done ? <><Icon name="check" size={13} className="text-accent" />Registered</> : m.id === me.id ? 'I’ve registered' : 'Mark'}
                      </button>
                    ) : <span className={`badge ${done ? 'badge-green' : ''}`}>{done ? 'Registered' : 'Pending'}</span>}
                  </div>
                );
              })}
            </div>
            {!registered && h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" className="btn w-full mt-3"><Icon name="external" size={14} />Go register</a>}
          </section>

          {(h.notes || h.description) && (
            <section className="card p-4">
              <p className="font-semibold mb-2">Notes</p>
              {h.description && <p className="text-[13px] text-muted mb-2">{h.description}</p>}
              {h.notes && <RichText text={h.notes} className="text-[13px]" />}
            </section>
          )}

          <section className="card p-4 flex flex-col gap-2">
            <button className="btn" onClick={() => api('PATCH', `hackathons/${h.id}`, { archived: !h.archived })}><Icon name="archive" size={14} />{h.archived ? 'Unarchive' : 'Archive'}</button>
            {h.stage === 'done' && (
              <select className="input" value={h.result || 'none'} onChange={(e) => api('PATCH', `hackathons/${h.id}`, { result: e.target.value })} aria-label="Result">
                <option value="none">Result…</option><option value="won">🏆 Won</option><option value="finalist">Finalist</option>
                <option value="participated">Participated</option><option value="dropped">Dropped out</option>
              </select>
            )}
            {canDelete && <button className="btn btn-danger" onClick={async () => {
              if (!confirm(`Delete “${h.name}”? Projects stay, but its tasks, ideas and discussion lose their link.`)) return;
              await api('DELETE', `hackathons/${h.id}`); router.push(`/w/${wsId}/hackathons`);
            }}><Icon name="trash" size={14} />Delete</button>}
            <p className="text-[11.5px] text-faint">Stage: <StageBadge stage={h.stage} /> · updated {fmtDate(h.updatedAt)}</p>
          </section>
        </aside>
      </div>

      {editing && <HackathonForm open hackathon={h} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Dates({ h }) {
  const { api } = useWorkspace();
  const [label, setLabel] = useState('');
  const [at, setAt] = useState('');
  const now = useNow();
  const all = hackathonDeadlines(h);
  async function addMilestone(e) {
    e.preventDefault();
    if (!label || !at) return;
    await api('PATCH', `hackathons/${h.id}`, { milestones: [...(h.milestones || []), { label, at: fromLocalInput(at) }] }).catch(() => {});
    setLabel(''); setAt('');
  }
  return (
    <section>
      <p className="section-title mb-3">Key dates</p>
      {all.length === 0 && <p className="text-muted text-[13px] mb-3">No dates yet — edit the hackathon to add registration and submission deadlines.</p>}
      <div className="grid sm:grid-cols-2 gap-2.5">
        {all.map((d) => {
          const past = new Date(d.at).getTime() < now;
          return (
            <div key={d.id} className={`card p-3.5 ${past ? 'opacity-55' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] text-muted">{d.label}</p>
                {d.field === 'milestone' && <button className="btn btn-ghost btn-sm btn-icon -my-1" aria-label="Remove milestone"
                  onClick={() => api('PATCH', `hackathons/${h.id}`, { milestones: (h.milestones || []).filter((m) => `${h.id}:ms:${m.id}` !== d.id) })}><Icon name="x" size={12} /></button>}
              </div>
              <p className="font-semibold text-[14px]">{fmtDate(d.at)}</p>
              <div className="mt-1">{past ? <span className="text-[12px] text-faint">passed</span> : <Countdown at={d.at} className="text-[13px]" />}</div>
            </div>
          );
        })}
      </div>
      <form onSubmit={addMilestone} className="flex flex-wrap gap-2 mt-2.5">
        <input className="input flex-1 min-w-[160px]" placeholder="Add milestone (e.g. PPT round)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input type="datetime-local" className="input w-auto" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Milestone date" />
        <button className="btn" disabled={!label || !at}><Icon name="plus" size={14} />Add</button>
      </form>
    </section>
  );
}

function NewProjectInline({ hackathonId }) {
  const { api, wsId } = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState('');
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      try { const p = await api('POST', 'projects', { name, hackathonId }); router.push(`/w/${wsId}/projects/${p.id}`); } catch { /* toast */ }
    }}>
      <input className="input" placeholder="New project for this hackathon…" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn" disabled={!name.trim()}><Icon name="plus" size={14} />Create</button>
    </form>
  );
}
