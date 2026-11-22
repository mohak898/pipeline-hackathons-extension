'use client';

import { useState } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import { Avatar, Icon } from '@/components/ui';
import { fmtDate, fromLocalInput } from '@/lib/client/format';
import { urgencyFor } from '@/lib/shared/model';

const COLS = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];

/** Task board scoped to a project or a hackathon. */
export default function Tasks({ projectId = null, hackathonId = null }) {
  const { snap, api, memberById, me } = useWorkspace();
  const tasks = snap.tasks.filter((t) => (projectId ? t.projectId === projectId : t.hackathonId === hackathonId && !t.projectId));
  const [f, setF] = useState({ title: '', assigneeId: me.id, dueAt: '' });

  async function add(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    try {
      await api('POST', 'tasks', { ...f, dueAt: fromLocalInput(f.dueAt), projectId, hackathonId });
      setF({ ...f, title: '', dueAt: '' });
    } catch { /* toast */ }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input className="input flex-1 min-w-[180px]" placeholder="Add a task…" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <select className="input w-auto" value={f.assigneeId || ''} onChange={(e) => setF({ ...f, assigneeId: e.target.value || null })} aria-label="Assignee">
          <option value="">Unassigned</option>
          {snap.members.map((m) => <option key={m.id} value={m.id}>{m.id === me.id ? `${m.name} (me)` : m.name}</option>)}
        </select>
        <input type="datetime-local" className="input w-auto" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} aria-label="Due" />
        <button className="btn btn-primary"><Icon name="plus" size={14} />Add</button>
      </form>
      <div className="grid md:grid-cols-3 gap-3">
        {COLS.map(([status, label]) => {
          const items = tasks.filter((t) => t.status === status);
          return (
            <div key={status} className="rounded-[14px] bg-surface-2/60 p-2 min-h-[120px]">
              <p className="font-semibold text-[12.5px] px-1.5 pb-2 pt-1 flex justify-between">{label}<span className="mono text-faint">{items.length}</span></p>
              <div className="flex flex-col gap-2">
                {items.map((t) => {
                  const who = memberById[t.assigneeId];
                  const urg = t.dueAt && status !== 'done' ? urgencyFor(t.dueAt) : null;
                  return (
                    <div key={t.id} className="card p-2.5 group">
                      <div className="flex items-start gap-2">
                        <button className={`mt-0.5 w-4 h-4 rounded-[5px] border shrink-0 inline-flex items-center justify-center ${status === 'done' ? 'bg-accent border-accent text-accent-ink' : 'border-line-strong'}`}
                          aria-label={status === 'done' ? 'Mark not done' : 'Mark done'}
                          onClick={() => api('PATCH', `tasks/${t.id}`, { status: status === 'done' ? 'todo' : 'done' })}>
                          {status === 'done' && <Icon name="check" size={11} />}
                        </button>
                        <p className={`text-[13px] flex-1 ${status === 'done' ? 'line-through text-faint' : ''}`}>{t.title}</p>
                        <button className="btn btn-ghost btn-sm btn-icon -mt-1 -mr-1 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Delete task" onClick={() => api('DELETE', `tasks/${t.id}`)}><Icon name="trash" size={12} /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                        {who ? <Avatar member={who} size={20} /> : <span className="text-[11px] text-faint">Unassigned</span>}
                        {t.dueAt && <span className={`text-[11.5px] whitespace-nowrap ${urg === 'critical' || urg === 'overdue' ? 'text-danger' : urg === 'soon' ? 'text-warn' : 'text-muted'}`}>{fmtDate(t.dueAt, { weekday: false })}</span>}
                        <select className="ml-auto bg-transparent text-[11.5px] text-muted" value={t.status} aria-label="Status"
                          onChange={(e) => api('PATCH', `tasks/${t.id}`, { status: e.target.value })}>
                          {COLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
