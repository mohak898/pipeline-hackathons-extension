'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Spinner } from '@/components/ui';
import { rememberWorkspace } from '@/lib/client/workspace';

export default function JoinClient({ wsId, code }) {
  const router = useRouter();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Already a member on this browser? go straight in.
    fetch(`/api/w/${wsId}/snapshot`).then((r) => { if (r.ok) router.replace(`/w/${wsId}`); });
    fetch(`/api/join/${wsId}?code=${encodeURIComponent(code)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setInfo(d); })
      .catch((e) => setErr(e.message || 'Invalid invite'));
  }, [wsId, code, router]);

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/join/${wsId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name }) });
    const d = await res.json();
    if (!res.ok) { setErr(d.error); setBusy(false); return; }
    rememberWorkspace(d.workspaceId, d.workspaceName);
    router.push(`/w/${d.workspaceId}?welcome=1`);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        {!info && !err && <Spinner label="Checking invite…" />}
        {err && (
          <div className="text-center py-6">
            <p className="font-semibold text-lg">Invite not valid</p>
            <p className="text-muted mt-1">{err}</p>
            <Link href="/" className="btn mt-5">Go home</Link>
          </div>
        )}
        {info && !err && (
          <form onSubmit={join} className="flex flex-col gap-4">
            <div>
              <p className="section-title">You’re invited to</p>
              <h1 className="text-2xl font-bold mt-1">{info.name}</h1>
              {info.members.length > 0 && <p className="text-muted text-[13px] mt-1">with {info.members.join(', ')}</p>}
            </div>
            <Field label="Your name" hint="This is how teammates will see you.">
              <input className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi" />
            </Field>
            <button className="btn btn-primary h-10" disabled={busy}>{busy ? 'Joining…' : 'Join the team'}</button>
            <p className="text-xs text-faint">No account or extension needed. Your access is saved in this browser — grab a sign-in link from the Team page to use another device.</p>
          </form>
        )}
      </div>
    </main>
  );
}
