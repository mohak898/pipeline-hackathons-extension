'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/client/workspace';
import { Avatar, Empty, Icon, RichText } from '@/components/ui';

/** Idea list with voting; optionally scoped to one hackathon. */
export default function Ideas({ hackathonId, showHackathon = false }) {
  const { snap, api, me, memberById, hackById, wsId, toast } = useWorkspace();
  const router = useRouter();
  const [f, setF] = useState({ title: '', body: '' });
  const [open, setOpen] = useState(false);
  const ideas = snap.ideas
    .filter((i) => (hackathonId === undefined ? true : i.hackathonId === hackathonId))
    .sort((a, b) => (a.status === 'parked') - (b.status === 'parked') || (b.votes?.length || 0) - (a.votes?.length || 0));

  async function add(e) {
    e.preventDefault();
    try { await api('POST', 'ideas', { ...f, hackathonId: hackathonId || null }); setF({ title: '', body: '' }); setOpen(false); } catch { /* toast */ }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="card p-3 flex flex-col gap-2">
        <input className="input" placeholder="Pitch an idea in one line…" value={f.title} onFocus={() => setOpen(true)} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} />
        {open && <>
          <textarea className="input" placeholder="Problem, solution, tech, why it can win…" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={!f.title.trim()}>Post idea</button></div>
        </>}
      </form>
      {ideas.length === 0 && <Empty icon="bulb" title="No ideas yet">Everyone can pitch and vote. Promote the winner to a project.</Empty>}
      {ideas.map((i) => {
        const voted = i.votes?.includes(me.id);
        return (
          <div key={i.id} className={`card p-3.5 flex gap-3 ${i.status === 'parked' ? 'opacity-60' : ''}`}>
            <button onClick={() => api('POST', `ideas/${i.id}/vote`, { up: !voted })} aria-pressed={voted}
              className={`flex flex-col items-center justify-center w-11 h-12 rounded-[10px] border shrink-0 ${voted ? 'border-accent text-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-line text-muted hover:border-line-strong'}`}>
              <Icon name="up" size={14} /><span className="mono text-[13px] font-bold">{i.votes?.length || 0}</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i.title} {i.status === 'picked' && <span className="badge badge-green ml-1">Picked</span>}{i.status === 'parked' && <span className="badge ml-1">Parked</span>}</p>
              {i.body && <RichText text={i.body} className="text-[13px] text-muted mt-0.5" />}
              <p className="text-[12px] text-faint mt-1.5 flex items-center gap-1.5">
                <Avatar member={memberById[i.createdBy]} size={16} />{memberById[i.createdBy]?.name}
                {showHackathon && i.hackathonId && hackById[i.hackathonId] && <> · for {hackById[i.hackathonId].name}</>}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {i.status !== 'picked' && <button className="btn btn-sm" onClick={async () => {
                try { const p = await api('POST', `ideas/${i.id}/promote`, {}); toast('Project created'); router.push(`/w/${wsId}/projects/${p.id}`); } catch { /* toast */ }
              }}>Build it</button>}
              {i.status === 'open' && <button className="btn btn-ghost btn-sm" onClick={() => api('PATCH', `ideas/${i.id}`, { status: 'parked' })}>Park</button>}
              {i.status === 'parked' && <button className="btn btn-ghost btn-sm" onClick={() => api('PATCH', `ideas/${i.id}`, { status: 'open' })}>Reopen</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
