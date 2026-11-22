'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import { Avatar, Empty, Field, Icon, Modal, RichText } from '@/components/ui';
import Tasks from '@/components/Tasks';
import Thread from '@/components/Thread';
import { PROJECT_STATUSES } from '@/lib/shared/model';

export default function ProjectDetail() {
  const { pid } = useParams();
  const router = useRouter();
  const { snap, api, wsId, hackById, memberById, me, isLead } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const p = snap.projects.find((x) => x.id === pid);
  if (!p) return <Empty icon="folder" title="Project not found" action={<Link className="btn" href={`/w/${wsId}/projects`}>Back</Link>} />;
  const h = p.hackathonId && hackById[p.hackathonId];
  const team = new Set(p.memberIds || []);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/w/${wsId}/projects`} className="text-[13px] text-muted hover:text-ink w-fit">← Projects</Link>
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
          {h && <p className="text-muted text-[13px] mt-1">for <Link className="underline underline-offset-2" href={`/w/${wsId}/hackathons/${h.id}`}>{h.name}</Link></p>}
        </div>
        <select className="input w-auto capitalize" value={p.status} onChange={(e) => api('PATCH', `projects/${p.id}`, { status: e.target.value })} aria-label="Status">
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} />Edit</button>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {p.description ? <div className="card p-4"><RichText text={p.description} className="text-[13.5px]" /></div>
            : <button className="card border-dashed p-4 text-left text-muted text-[13px]" onClick={() => setEditing(true)}>+ Add a description: problem, solution, architecture…</button>}
          <section><p className="section-title mb-2">Tasks</p><Tasks projectId={p.id} /></section>
          <section><p className="section-title mb-2">Discussion</p><Thread threadType="project" threadId={p.id} placeholder={`Discuss ${p.name}…`} /></section>
        </div>
        <aside className="flex flex-col gap-4">
          <section className="card p-4">
            <p className="font-semibold mb-2">Links</p>
            {[['repoUrl', 'Repository'], ['demoUrl', 'Live demo'], ['pitchUrl', 'Pitch deck / video']].map(([k, l]) => (
              p[k] ? <a key={k} href={p[k]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1.5 text-[13px] hover:underline"><Icon name="link" size={14} className="text-muted" />{l}</a>
                : <p key={k} className="py-1.5 text-[13px] text-faint">{l}: not set</p>
            ))}
            {p.techStack?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{p.techStack.map((t) => <span key={t} className="badge">{t}</span>)}</div>}
          </section>
          <section className="card p-4">
            <p className="font-semibold mb-2">Team</p>
            {snap.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2.5 py-1.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={team.has(m.id)} onChange={(e) => {
                  const next = new Set(team); if (e.target.checked) next.add(m.id); else next.delete(m.id);
                  api('PATCH', `projects/${p.id}`, { memberIds: [...next] });
                }} />
                <Avatar member={m} size={22} />{m.name}
              </label>
            ))}
          </section>
          {(isLead || p.createdBy === me.id) && (
            <button className="btn btn-danger" onClick={async () => {
              if (!confirm(`Delete project “${p.name}” and its tasks?`)) return;
              await api('DELETE', `projects/${p.id}`); router.push(`/w/${wsId}/projects`);
            }}><Icon name="trash" size={14} />Delete project</button>
          )}
          <p className="text-[11.5px] text-faint">Created by {memberById[p.createdBy]?.name || '—'}</p>
        </aside>
      </div>
      {editing && <EditProject p={p} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditProject({ p, onClose }) {
  const { snap, api } = useWorkspace();
  const [f, setF] = useState({
    name: p.name, description: p.description || '', hackathonId: p.hackathonId || '', repoUrl: p.repoUrl || '',
    demoUrl: p.demoUrl || '', pitchUrl: p.pitchUrl || '', techStack: (p.techStack || []).join(', '),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Edit project" wide footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="ep">Save</button></>}>
      <form id="ep" className="grid sm:grid-cols-2 gap-3.5" onSubmit={async (e) => {
        e.preventDefault();
        try { await api('PATCH', `projects/${p.id}`, { ...f, hackathonId: f.hackathonId || null }); onClose(); } catch { /* toast */ }
      }}>
        <Field label="Name" className="sm:col-span-2"><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className="input min-h-[140px]" value={f.description} onChange={set('description')} /></Field>
        <Field label="Hackathon">
          <select className="input" value={f.hackathonId} onChange={set('hackathonId')}>
            <option value="">— none —</option>{snap.hackathons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="Tech stack" hint="Comma separated"><input className="input" value={f.techStack} onChange={set('techStack')} /></Field>
        <Field label="Repository URL"><input className="input" value={f.repoUrl} onChange={set('repoUrl')} /></Field>
        <Field label="Demo URL"><input className="input" value={f.demoUrl} onChange={set('demoUrl')} /></Field>
        <Field label="Pitch deck / video URL" className="sm:col-span-2"><input className="input" value={f.pitchUrl} onChange={set('pitchUrl')} /></Field>
      </form>
    </Modal>
  );
}
