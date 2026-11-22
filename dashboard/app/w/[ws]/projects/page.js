'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import { AvatarStack, Empty, Field, Icon, Modal } from '@/components/ui';
import { PROJECT_STATUSES } from '@/lib/shared/model';

export default function ProjectsPage() {
  const { snap, wsId, hackById, memberById } = useWorkspace();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted text-[13px]">What the team is building — with tasks, links and discussion.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />New project</button>
      </div>
      {snap.projects.length === 0 ? (
        <Empty icon="folder" title="No projects yet" action={<button className="btn btn-primary" onClick={() => setAdding(true)}>Start one</button>}>
          Create one directly, or promote the winning idea from the Ideas board.
        </Empty>
      ) : PROJECT_STATUSES.map((st) => {
        const items = snap.projects.filter((p) => p.status === st);
        if (!items.length) return null;
        return (
          <section key={st}>
            <p className="section-title mb-2 capitalize">{st}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((p) => {
                const tasks = snap.tasks.filter((t) => t.projectId === p.id);
                const done = tasks.filter((t) => t.status === 'done').length;
                return (
                  <Link key={p.id} href={`/w/${wsId}/projects/${p.id}`} className="card card-hover p-4 flex flex-col gap-2">
                    <p className="font-semibold">{p.name}</p>
                    {p.hackathonId && hackById[p.hackathonId] && <p className="text-[12.5px] text-muted">for {hackById[p.hackathonId].name}</p>}
                    {p.description && <p className="text-[13px] text-muted line-clamp-2">{p.description}</p>}
                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <AvatarStack members={(p.memberIds || []).map((id) => memberById[id]).filter(Boolean)} size={22} />
                      {tasks.length > 0 && (
                        <span className="text-[12px] text-muted flex items-center gap-2">
                          <span className="w-16 h-1.5 rounded-full bg-surface-3 overflow-hidden"><span className="block h-full bg-accent" style={{ width: `${(done / tasks.length) * 100}%` }} /></span>
                          {done}/{tasks.length}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {adding && <NewProject onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewProject({ onClose }) {
  const { snap, api, wsId } = useWorkspace();
  const router = useRouter();
  const [f, setF] = useState({ name: '', description: '', hackathonId: '' });
  return (
    <Modal open onClose={onClose} title="New project" footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" form="proj-form">Create</button></>}>
      <form id="proj-form" className="flex flex-col gap-3.5" onSubmit={async (e) => {
        e.preventDefault();
        try { const p = await api('POST', 'projects', { ...f, hackathonId: f.hackathonId || null }); router.push(`/w/${wsId}/projects/${p.id}`); } catch { /* toast */ }
      }}>
        <Field label="Name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="For hackathon (optional)">
          <select className="input" value={f.hackathonId} onChange={(e) => setF({ ...f, hackathonId: e.target.value })}>
            <option value="">— none —</option>
            {snap.hackathons.filter((h) => !h.archived).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="Description"><textarea className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
