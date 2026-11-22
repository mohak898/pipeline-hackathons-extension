'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Icon } from '@/components/ui';
import { rememberWorkspace, rememberedWorkspaces } from '@/lib/client/workspace';

const EXTENSION_LINK = process.env.NEXT_PUBLIC_EXTENSION_LINK || 'https://github.com/mohak898/pipeline-hackathons-extension#6-install-the-chrome-extension';

const FEATURES = [
  ['trophy', 'One pipeline, zero duplicates', 'Every hackathon from Devfolio, Devpost, Unstop or any custom website lands in one board — merged by canonical URL and name + date.'],
  ['puzzle', 'Extension on one laptop is enough', 'The lead’s extension captures pages passively. Everyone else just opens the dashboard — add, edit and plan from any device.'],
  ['bell', 'Reminders that reach everyone', 'Personal action center, Discord/Slack pings, a calendar feed for phones, and "who hasn’t registered yet" nudges.'],
  ['bulb', 'Ideate → build → submit', 'Idea board with votes, projects with task boards, threads on every hackathon and a team chat.'],
];

export default function Home() {
  const router = useRouter();
  const [mine, setMine] = useState([]);
  const [form, setForm] = useState({ name: '', leaderName: '' });
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setMine(rememberedWorkspaces()); }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      rememberWorkspace(data.workspaceId, data.workspaceName);
      router.push(`/w/${data.workspaceId}?welcome=1`);
    } catch (e2) {
      setErr(e2.message || 'Could not create the workspace');
      setBusy(false);
    }
  }

  function openInvite(e) {
    e.preventDefault();
    const v = invite.trim();
    try {
      const u = new URL(v);
      router.push(u.pathname + u.search);
    } catch {
      setErr('Paste the full invite link your team lead shared (it starts with https://)');
    }
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <nav className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-48.png" alt="" width={26} height={26} className="rounded-md" />
            Pipeline
          </Link>
          <a href={EXTENSION_LINK} className="btn btn-sm" target="_blank" rel="noopener noreferrer"><Icon name="puzzle" size={14} />Get the extension</a>
        </div>
      </nav>

      <section className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-20 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-start">
        <div>
          <span className="badge badge-green mb-5"><span className="live-dot" />Team workspace for hackathon squads</span>
          <h1 className="text-[34px] sm:text-5xl font-bold tracking-tight leading-[1.08]">
            Every hackathon, every deadline,<br className="hidden sm:block" /> <span className="text-accent">the whole team</span> in sync.
          </h1>
          <p className="text-muted text-base sm:text-lg mt-5 max-w-xl">
            The lead’s browser extension quietly captures hackathons as you browse. Your team plans, ideates and builds in one shared workspace — no extension needed for them.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-10">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="card p-4">
                <span className="w-8 h-8 rounded-lg bg-surface-3 text-accent inline-flex items-center justify-center mb-3"><Icon name={icon} /></span>
                <p className="font-semibold text-[14px]">{title}</p>
                <p className="text-muted text-[13px] mt-1">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          {mine.length > 0 && (
            <div className="card p-5">
              <p className="section-title mb-3">Your workspaces</p>
              <div className="flex flex-col gap-1.5">
                {mine.map((w) => (
                  <Link key={w.id} href={`/w/${w.id}`} className="card-hover flex items-center justify-between rounded-[10px] border border-line px-3 py-2.5">
                    <span className="font-medium">{w.name}</span><Icon name="up" className="rotate-90 text-faint" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={create} className="card p-5 flex flex-col gap-3.5">
            <div>
              <p className="font-semibold text-[15px]">Start a team workspace</p>
              <p className="text-muted text-[13px]">You’ll be the team lead. Invite teammates with a link.</p>
            </div>
            <Field label="Team / workspace name">
              <input className="input" required maxLength={80} placeholder="e.g. Hikity Hackers" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Your name">
              <input className="input" required maxLength={60} placeholder="e.g. Asha" value={form.leaderName} onChange={(e) => setForm({ ...form, leaderName: e.target.value })} />
            </Field>
            <button className="btn btn-primary h-10" disabled={busy}>{busy ? 'Creating…' : 'Create workspace'}</button>
          </form>

          <form onSubmit={openInvite} className="card p-5 flex flex-col gap-3">
            <p className="font-semibold text-[15px]">Got an invite link?</p>
            <div className="flex gap-2">
              <input className="input" placeholder="https://…/join/…" value={invite} onChange={(e) => setInvite(e.target.value)} />
              <button className="btn">Join</button>
            </div>
          </form>
          {err && <p className="text-danger text-[13px]" role="alert">{err}</p>}
        </div>
      </section>

      <footer className="mt-auto border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap gap-3 items-center justify-between text-xs text-faint">
          <span>Hackathon Pipeline Tracker · built for teams that ship</span>
          <span>No accounts — access is by invite link, scoped per workspace.</span>
        </div>
      </footer>
    </main>
  );
}
