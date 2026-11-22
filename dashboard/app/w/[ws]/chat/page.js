'use client';

import Link from 'next/link';
import { useWorkspace } from '@/lib/client/workspace';
import Thread from '@/components/Thread';
import { TimeAgo } from '@/components/ui';

export default function ChatPage() {
  const { snap, wsId, hackById, projectById } = useWorkspace();
  // Most recent message per non-general thread
  const threads = new Map();
  for (const m of snap.messages) if (m.threadType !== 'general') threads.set(`${m.threadType}:${m.threadId}`, m);
  const recent = [...threads.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const title = (m) => (m.threadType === 'hackathon' ? hackById[m.threadId]?.name : m.threadType === 'project' ? projectById[m.threadId]?.name : null);
  const href = (m) => `/w/${wsId}/${m.threadType === 'hackathon' ? 'hackathons' : 'projects'}/${m.threadId}`;
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Team chat</h1>
        <p className="text-muted text-[13px] mb-4">General channel. Hackathons and projects have their own threads.</p>
        <Thread tall placeholder="Message the team… (Enter to send, Shift+Enter for a new line)" />
      </div>
      <aside>
        <p className="section-title mb-2 lg:mt-[68px]">Active threads</p>
        {recent.length === 0 && <p className="text-[13px] text-muted">No thread activity yet.</p>}
        <div className="flex flex-col gap-2">
          {recent.filter(title).map((m) => (
            <Link key={m.id} href={href(m)} className="card card-hover p-3">
              <p className="font-medium text-[13px] truncate">{title(m)}</p>
              <p className="text-[12px] text-muted truncate">{m.body}</p>
              <p className="text-[11px] text-faint"><TimeAgo at={m.createdAt} /></p>
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
