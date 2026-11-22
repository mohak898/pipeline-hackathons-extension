'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOrigin } from '@/lib/client/hooks';
import { useWorkspace, forgetWorkspace } from '@/lib/client/workspace';
import { Avatar, CopyButton, Icon, TimeAgo } from '@/components/ui';

const ROLE_LABEL = { leader: 'Team lead', admin: 'Co-lead', member: 'Member' };

export default function TeamPage() {
  const { snap, me, isLead, api, wsId, toast } = useWorkspace();
  const router = useRouter();
  const [link, setLink] = useState(null);
  const origin = useOrigin();
  const invite = snap.workspace.inviteCode ? `${origin}/join/${wsId}?code=${snap.workspace.inviteCode}` : null;
  const active = snap.hackathons.filter((h) => ['shortlisted', 'registered', 'building'].includes(h.stage) && !h.archived);

  async function signInLink(memberId) {
    try { setLink({ memberId, ...(await api('POST', 'login-link', { memberId })) }); } catch { /* toast */ }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-muted text-[13px]">The lead runs the show; everyone can add hackathons, ideas, projects and tasks.</p>
      </div>

      {isLead && invite && (
        <section className="card p-4 sm:p-5">
          <p className="font-semibold">Invite teammates</p>
          <p className="text-muted text-[13px] mb-3">Anyone with this link can join. They don’t need the extension.</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly className="input flex-1 min-w-[220px] mono text-[12px]" value={invite} onFocus={(e) => e.target.select()} />
            <CopyButton text={invite} label="Copy link" className="btn" />
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`Join our hackathon workspace “${snap.workspace.name}”: ${invite}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <button className="btn btn-ghost" onClick={async () => { if (confirm('Reset the invite link? The old link stops working.')) { await api('PATCH', 'workspace', { regenerateInvite: true }); toast('New invite link created'); } }}>Reset</button>
          </div>
        </section>
      )}

      <section className="card divide-y divide-[var(--border)]">
        {snap.members.map((m) => {
          const regs = active.filter((h) => h.registrations?.[m.id]).length;
          const openTasks = snap.tasks.filter((t) => t.assigneeId === m.id && t.status !== 'done').length;
          return (
            <div key={m.id} className="px-4 py-3.5 flex flex-wrap items-center gap-3">
              <Avatar member={m} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}{m.id === me.id && <span className="text-faint font-normal"> (you)</span>}</p>
                <p className="text-[12.5px] text-muted">
                  {ROLE_LABEL[m.role]} · registered {regs}/{active.length} active · {openTasks} open task{openTasks === 1 ? '' : 's'} · seen <TimeAgo at={m.lastSeenAt} />
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isLead && m.id !== me.id && m.role !== 'leader' && (
                  <select className="input w-auto h-8" value={m.role} aria-label="Role"
                    onChange={(e) => api('PATCH', `members/${m.id}`, { role: e.target.value })}>
                    <option value="member">Member</option><option value="admin">Co-lead</option>
                    {me.role === 'leader' && <option value="leader">Make team lead</option>}
                  </select>
                )}
                {(m.id === me.id || isLead) && <button className="btn btn-sm" onClick={() => signInLink(m.id)}>{m.id === me.id ? 'Sign in on another device' : 'Sign-in link'}</button>}
                {isLead && m.id !== me.id && m.role !== 'leader' && (
                  <button className="btn btn-sm btn-danger" onClick={() => confirm(`Remove ${m.name} from the team?`) && api('DELETE', `members/${m.id}`)}>Remove</button>
                )}
              </div>
              {link?.memberId === m.id && (
                <div className="w-full rounded-[10px] bg-surface-2 p-3 flex flex-wrap gap-2 items-center">
                  <p className="text-[12.5px] text-muted w-full">One-time link, valid 7 days. {m.id === me.id ? 'Open it on your other device.' : `Send it privately to ${m.name}.`}</p>
                  <input readOnly className="input flex-1 min-w-[200px] mono text-[11.5px]" value={link.url} onFocus={(e) => e.target.select()} />
                  <CopyButton text={link.url} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="font-semibold">Your profile</p>
          <p className="text-[12.5px] text-muted">Rename yourself or leave the workspace.</p>
        </div>
        <button className="btn btn-sm" onClick={async () => { const n = prompt('Your name', me.name); if (n) await api('PATCH', `members/${me.id}`, { name: n }); }}><Icon name="edit" size={13} />Rename</button>
        {me.role !== 'leader' && <button className="btn btn-sm btn-danger" onClick={async () => {
          if (!confirm('Leave this workspace?')) return;
          await api('DELETE', `members/${me.id}`).catch(() => {}); forgetWorkspace(wsId); router.push('/');
        }}>Leave</button>}
      </section>
    </div>
  );
}
