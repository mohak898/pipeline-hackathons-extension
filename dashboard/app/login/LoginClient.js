'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Spinner } from '@/components/ui';
import { rememberWorkspace } from '@/lib/client/workspace';

export default function LoginClient({ code }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        rememberWorkspace(d.workspaceId, d.workspaceName);
        router.replace(`/w/${d.workspaceId}`);
      })
      .catch((e) => setErr(e.message));
  }, [code, router]);
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 text-center">
        {!err ? <Spinner label="Signing you in…" /> : (
          <>
            <p className="font-semibold text-lg">Couldn’t sign in</p>
            <p className="text-muted mt-1">{err}</p>
            <p className="text-muted text-[13px] mt-3">Ask a teammate who is signed in to create a new sign-in link from the Team page.</p>
            <Link href="/" className="btn mt-5">Go home</Link>
          </>
        )}
      </div>
    </main>
  );
}
