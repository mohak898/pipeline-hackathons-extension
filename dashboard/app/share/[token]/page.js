'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Countdown, PlatformBadge, Spinner, StageBadge } from '@/components/ui';
import { fmtDate, nextDeadline } from '@/lib/client/format';

export default function SharePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => fetch(`/api/public/${token}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); }).catch((e) => setErr(e.message));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [token]);

  const list = (data?.hackathons || []).filter((h) => h.stage !== 'done')
    .sort((a, b) => (new Date(nextDeadline(a)?.at || 8.64e15)) - (new Date(nextDeadline(b)?.at || 8.64e15)));

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 sm:py-16">
      {!data && !err && <Spinner label="Loading timeline…" />}
      {err && <div className="card p-8 text-center"><p className="font-semibold text-lg">Link unavailable</p><p className="text-muted mt-1">{err}</p><Link href="/" className="btn mt-5">Home</Link></div>}
      {data && (
        <>
          <p className="section-title">Shared timeline</p>
          <h1 className="text-3xl font-bold tracking-tight mt-1 mb-8">{data.name}</h1>
          <div className="flex flex-col gap-3">
            {list.length === 0 && <p className="text-muted">Nothing on the board right now.</p>}
            {list.map((h) => {
              const nd = nextDeadline(h);
              return (
                <a key={h.id} href={h.url || undefined} target="_blank" rel="noopener noreferrer" className="card card-hover p-4 flex items-center gap-3">
                  <PlatformBadge platform={h.platform} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{h.name}</p>
                    <p className="text-[12.5px] text-muted">{nd ? `${nd.label} · ${fmtDate(nd.at)}` : 'No upcoming dates'}</p>
                  </div>
                  <StageBadge stage={h.stage} />
                  {nd && <Countdown at={nd.at} className="hidden sm:inline text-[13px]" />}
                </a>
              );
            })}
          </div>
          <p className="text-[12px] text-faint mt-10">Read-only view · Pipeline</p>
        </>
      )}
    </main>
  );
}
