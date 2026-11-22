'use client';

import { useState } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import Ideas from '@/components/Ideas';

export default function IdeasPage() {
  const { snap } = useWorkspace();
  const [hid, setHid] = useState('all');
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
          <p className="text-muted text-[13px]">Pitch, vote, then hit “Build it” to turn the winner into a project.</p>
        </div>
        <select className="input w-auto" value={hid} onChange={(e) => setHid(e.target.value)} aria-label="Filter by hackathon">
          <option value="all">All hackathons</option>
          <option value="">General (no hackathon)</option>
          {snap.hackathons.filter((h) => !h.archived).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>
      <Ideas key={hid} hackathonId={hid === 'all' ? undefined : hid || null} showHackathon={hid === 'all'} />
    </div>
  );
}
