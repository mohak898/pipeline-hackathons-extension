'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNotificationPermission } from '@/lib/client/hooks';
import { useWorkspace } from '@/lib/client/workspace';
import { Avatar, Countdown, Empty, Field, Icon, Modal, RichText, StageBadge, TimeAgo, UrgencyBadge } from '@/components/ui';
import { STAGES, upcomingDeadlines } from '@/lib/shared/model';
import { fmtDate, fromLocalInput } from '@/lib/client/format';

export default function HomePage() {
  const { snap, me, isLead } = useWorkspace();
  const welcome = useSearchParams().has('welcome');
  const deadlines = upcomingDeadlines(snap.hackathons.filter((h) => h.stage !== 'discovered')).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted text-[13px]">{greeting()}, {me.name.split(' ')[0]}</p>
          <h1 className="text-2xl font-bold tracking-tight">What needs doing</h1>
        </div>
        <NotifyToggle />
      </div>

      {(welcome || snap.members.length < 2 || snap.hackathons.length === 0) && <Onboarding />}

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <ActionCenter />
          <Announcements />
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title">Upcoming deadlines</h2>
              <Link href={`/w/${snap.workspace.id}/hackathons?view=timeline`} className="text-[12.5px] text-muted hover:text-ink">Timeline →</Link>
            </div>
            {deadlines.length === 0 ? <Empty icon="calendar" title="No dates yet">Add hackathons and their deadlines to see them here.</Empty> : (
              <div className="card divide-y divide-[var(--border)]">
                {deadlines.map((d) => (
                  <Link key={d.id} href={`/w/${snap.workspace.id}/hackathons/${d.hackathonId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 first:rounded-t-[14px] last:rounded-b-[14px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{d.name}</p>
                      <p className="text-[12.5px] text-muted">{d.label} · {fmtDate(d.at)}</p>
                    </div>
                    <Countdown at={d.at} className="text-[13px]" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <section>
            <h2 className="section-title mb-3">Pipeline</h2>
            <div className="grid grid-cols-3 gap-2">
              {STAGES.map((s) => {
                const n = snap.hackathons.filter((h) => h.stage === s.id && !h.archived).length;
                return (
                  <Link key={s.id} href={`/w/${snap.workspace.id}/hackathons?stage=${s.id}`} className="card card-hover p-3">
                    <p className="mono text-xl font-bold">{n}</p>
                    <p className="text-[12px] text-muted">{s.label}</p>
                  </Link>
                );
              })}
            </div>
          </section>
          {isLead && <TeamRegistrationMatrix />}
          <section>
            <h2 className="section-title mb-3">Activity</h2>
            <div className="card p-2 max-h-[420px] overflow-y-auto">
              {snap.activity.length === 0 && <p className="text-muted text-[13px] p-3">Nothing yet.</p>}
              {snap.activity.slice(0, 40).map((a) => <ActivityRow key={a.id} a={a} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function ActivityRow({ a }) {
  const { memberById } = useWorkspace();
  const who = memberById[a.actorId];
  return (
    <div className="flex items-start gap-2.5 px-2 py-2">
      <Avatar member={who} size={22} />
      <p className="text-[13px] leading-snug min-w-0">
        <span className="font-medium">{who?.name || 'Someone'}</span> <span className="text-muted">{a.summary}</span>
        <span className="block text-[11.5px] text-faint"><TimeAgo at={a.createdAt} /></span>
      </p>
    </div>
  );
}

function ActionCenter() {
  const { actions, api, toast } = useWorkspace();
  const [busy, setBusy] = useState(null);
  async function run(a) {
    setBusy(a.id);
    try {
      if (a.action.type === 'register') {
        await api('POST', `hackathons/${a.action.id}/registration`, { registered: true });
        toast('Marked as registered');
      } else if (a.action.type === 'ack') {
        await api('POST', `announcements/${a.action.id}/ack`, {});
      } else if (a.action.type === 'task-done') {
        await api('PATCH', `tasks/${a.action.id}`, { status: 'done' });
        toast('Task done');
      }
    } catch { /* toast shown */ }
    setBusy(null);
  }
  const label = { register: 'I’ve registered', ack: 'Got it', 'task-done': 'Mark done' };
  return (
    <section>
      <h2 className="section-title mb-3">Your action items</h2>
      {actions.length === 0 ? <Empty icon="check" title="You’re all caught up">New deadlines, tasks and calls-to-action from your lead will show up here.</Empty> : (
        <div className="flex flex-col gap-2">
          {actions.slice(0, 12).map((a) => (
            <div key={a.id} className={`card urgency-${a.urgency} px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5"><UrgencyBadge urgency={a.urgency} /><span className="text-[11.5px] text-faint capitalize">{a.kind}</span></div>
                <Link href={a.href} className="font-semibold hover:underline underline-offset-2">{a.title}</Link>
                <p className="text-[12.5px] text-muted">{a.detail}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {a.external && <a href={a.external} target="_blank" rel="noopener noreferrer" className="btn btn-sm"><Icon name="external" size={13} />Open</a>}
                {a.action && <button className="btn btn-sm btn-primary" disabled={busy === a.id} onClick={() => run(a)}>{label[a.action.type]}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Announcements() {
  const { snap, isLead, memberById, api, me } = useWorkspace();
  const [open, setOpen] = useState(false);
  const list = snap.announcements.filter((a) => !a.archived).slice().reverse().slice(0, 5);
  if (!isLead && list.length === 0) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">Calls to action</h2>
        {isLead && <button className="btn btn-sm" onClick={() => setOpen(true)}><Icon name="megaphone" size={14} />New</button>}
      </div>
      {list.length === 0 && <Empty icon="megaphone" title="Rally the team">Post a call-to-action (e.g. “Everyone register on Devfolio by 9pm”). Each teammate gets it in their action items and you see who acknowledged.</Empty>}
      <div className="flex flex-col gap-2">
        {list.map((a) => {
          const audience = (a.audience === 'all' ? snap.members : snap.members.filter((m) => a.audience.includes(m.id))).filter((m) => m.id !== a.createdBy);
          const acked = audience.filter((m) => a.acks?.[m.id]);
          return (
            <div key={a.id} className="card p-4">
              <div className="flex items-start gap-3">
                <Avatar member={memberById[a.createdBy]} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.title}</p>
                  {a.body && <RichText text={a.body} className="text-[13px] text-muted mt-0.5" />}
                  <p className="text-[12px] text-faint mt-1.5">
                    {memberById[a.createdBy]?.name} · <TimeAgo at={a.createdAt} />{a.dueAt && <> · due {fmtDate(a.dueAt)}</>}
                  </p>
                  {a.requireAck && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[12px] text-muted mr-1">{acked.length}/{audience.length} acknowledged</span>
                      {audience.map((m) => (
                        <span key={m.id} className={`badge ${a.acks?.[m.id] ? 'badge-green' : ''}`}>{a.acks?.[m.id] ? '✓' : '…'} {m.name}</span>
                      ))}
                    </div>
                  )}
                </div>
                {isLead && <button className="btn btn-ghost btn-sm btn-icon" title="Archive" onClick={() => api('PATCH', `announcements/${a.id}`, { archived: true })}><Icon name="archive" size={14} /></button>}
                {a.createdBy !== me.id && a.requireAck && !a.acks?.[me.id] && audience.some((m) => m.id === me.id) && <button className="btn btn-sm btn-primary" onClick={() => api('POST', `announcements/${a.id}/ack`, {})}>Got it</button>}
              </div>
            </div>
          );
        })}
      </div>
      {open && <AnnouncementModal onClose={() => setOpen(false)} />}
    </section>
  );
}

function AnnouncementModal({ onClose }) {
  const { snap, api, toast } = useWorkspace();
  const [f, setF] = useState({ title: '', body: '', dueAt: '', audience: 'all', requireAck: true });
  const [picked, setPicked] = useState([]);
  async function send(e) {
    e.preventDefault();
    try {
      await api('POST', 'announcements', { ...f, dueAt: fromLocalInput(f.dueAt), audience: f.audience === 'all' ? 'all' : picked });
      toast('Sent to the team');
      onClose();
    } catch { /* toast */ }
  }
  return (
    <Modal open onClose={onClose} title="New call to action" footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" form="ann-form"><Icon name="send" size={14} />Send</button></>}>
      <form id="ann-form" onSubmit={send} className="flex flex-col gap-3.5">
        <Field label="What should people do?"><input className="input" required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Register on Unstop for SIH before 9 PM" /></Field>
        <Field label="Details (optional)"><textarea className="input" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-2 gap-3.5">
          <Field label="Due (optional)"><input type="datetime-local" className="input" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
          <Field label="Who">
            <select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              <option value="all">Whole team</option><option value="some">Specific people</option>
            </select>
          </Field>
        </div>
        {f.audience === 'some' && (
          <div className="flex flex-wrap gap-2">
            {snap.members.map((m) => (
              <label key={m.id} className={`badge cursor-pointer ${picked.includes(m.id) ? 'badge-green' : ''}`}>
                <input type="checkbox" className="sr-only" checked={picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />
                {m.name}
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.requireAck} onChange={(e) => setF({ ...f, requireAck: e.target.checked })} />Ask everyone to acknowledge</label>
      </form>
    </Modal>
  );
}

function TeamRegistrationMatrix() {
  const { snap } = useWorkspace();
  const active = snap.hackathons.filter((h) => ['shortlisted', 'registered', 'building'].includes(h.stage) && !h.archived);
  if (!active.length) return null;
  return (
    <section>
      <h2 className="section-title mb-3">Who’s registered</h2>
      <div className="card p-3 scroll-x">
        <table className="w-full text-[12.5px]">
          <thead><tr><th className="text-left font-medium text-muted pb-2 pr-2">Hackathon</th>{snap.members.map((m) => <th key={m.id} className="pb-2 px-1 font-medium text-muted" title={m.name}>{m.name.split(' ')[0]}</th>)}</tr></thead>
          <tbody>
            {active.map((h) => (
              <tr key={h.id} className="border-t border-line">
                <td className="py-2 pr-2"><Link href={`/w/${snap.workspace.id}/hackathons/${h.id}`} className="hover:underline">{h.name}</Link> <StageBadge stage={h.stage} /></td>
                {snap.members.map((m) => <td key={m.id} className="text-center px-1">{h.registrations?.[m.id] ? <span className="text-accent">✓</span> : <span className="text-faint">·</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Onboarding() {
  const { snap, isLead } = useWorkspace();
  const base = `/w/${snap.workspace.id}`;
  const steps = [
    { done: snap.members.length > 1, title: 'Invite your teammates', body: 'They join with a link — no extension needed.', href: `${base}/team`, show: true },
    { done: snap.devices.length > 0, title: 'Connect the Chrome extension', body: 'Hackathons you open get captured automatically.', href: `${base}/settings#extension`, show: true },
    { done: snap.hackathons.length > 0, title: 'Add your first hackathon', body: 'Paste any link — we read the dates for you.', href: `${base}/hackathons?add=1`, show: true },
    { done: !!(snap.workspace.settings?.webhookUrl || snap.workspace.settings?.webhookConfigured), title: 'Send reminders to Discord/Slack', body: 'Deadline pings for the whole team.', href: `${base}/settings#reminders`, show: isLead },
  ].filter((s) => s.show);
  if (steps.every((s) => s.done)) return null;
  return (
    <section className="card p-4 sm:p-5">
      <p className="font-semibold">Set up your workspace</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
        {steps.map((s) => (
          <Link key={s.title} href={s.href} className={`card-hover rounded-[12px] border border-line p-3 ${s.done ? 'opacity-60' : ''}`}>
            <p className="font-medium text-[13.5px] flex items-center gap-1.5">{s.done ? <Icon name="check" size={14} className="text-accent" /> : <span className="w-3.5 h-3.5 rounded-full border border-line-strong inline-block" />}{s.title}</p>
            <p className="text-[12.5px] text-muted mt-1">{s.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function NotifyToggle() {
  const [perm, request] = useNotificationPermission();
  if (perm === 'granted' || perm === 'unsupported') return null;
  return (
    <button className="btn btn-sm" onClick={request} disabled={perm === 'denied'}>
      <Icon name="bell" size={14} />{perm === 'denied' ? 'Notifications blocked' : 'Enable desktop alerts'}
    </button>
  );
}
