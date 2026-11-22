'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNow } from '@/lib/client/hooks';
import { useWorkspace } from '@/lib/client/workspace';
import { AvatarStack, Countdown, Empty, Icon, PlatformBadge, Segmented, StageBadge } from '@/components/ui';
import HackathonForm from '@/components/HackathonForm';
import { STAGES, upcomingDeadlines } from '@/lib/shared/model';
import { fmtDate, fmtDay, nextDeadline, hackStatus, PLATFORM_META } from '@/lib/client/format';

export default function HackathonsPage() {
  const { snap } = useWorkspace();
  const params = useSearchParams();
  const [view, setView] = useState(() => params.get('view') || (params.get('stage') ? 'list' : 'board'));
  const [stage, setStage] = useState(() => params.get('stage') || 'all');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(() => params.has('add'));

  const list = useMemo(() => snap.hackathons
    .filter((h) => (archived ? h.archived : !h.archived))
    .filter((h) => stage === 'all' || h.stage === stage)
    .filter((h) => !q || `${h.name} ${h.platform} ${(h.tags || []).join(' ')} ${h.location || ''}`.toLowerCase().includes(q.toLowerCase())),
  [snap.hackathons, archived, stage, q]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hackathons</h1>
          <p className="text-muted text-[13px]">Captured by the extension or added by anyone on the team.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Add hackathon</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: 'board', label: 'Board', icon: 'board' }, { value: 'list', label: 'List', icon: 'list' }, { value: 'timeline', label: 'Timeline', icon: 'calendar' },
        ]} />
        <input className="input max-w-[220px] h-[32px]" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        {view === 'list' && (
          <select className="input w-auto h-[32px]" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">All stages</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted ml-auto"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archived</label>
      </div>

      {snap.hackathons.length === 0 ? (
        <Empty icon="trophy" title="No hackathons yet" action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Add the first one</button>}>
          Browse Devfolio, Devpost or Unstop with the extension connected, or paste any hackathon link here.
        </Empty>
      ) : view === 'board' ? <Board list={list} /> : view === 'list' ? <ListView list={list} /> : <Timeline list={list} />}

      {adding && <HackathonForm open onClose={() => setAdding(false)} />}
    </div>
  );
}

function Board({ list }) {
  const { api } = useWorkspace();
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  return (
    <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-max lg:min-w-0">
        {STAGES.map((s) => {
          const items = list.filter((h) => h.stage === s.id).sort(byNextDeadline);
          return (
            <div key={s.id}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={async (e) => { e.preventDefault(); setOver(null); if (drag && drag.stage !== s.id) await api('PATCH', `hackathons/${drag.id}`, { stage: s.id }).catch(() => {}); setDrag(null); }}
              className={`rounded-[14px] p-2 bg-surface-2/60 border ${over === s.id ? 'border-accent' : 'border-transparent'} min-h-[200px]`}>
              <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                <p className="font-semibold text-[13px]" title={s.hint}>{s.label}</p>
                <span className="text-[12px] text-faint mono">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((h) => <BoardCard key={h.id} h={h} onDragStart={() => setDrag(h)} />)}
                {items.length === 0 && <p className="text-[12px] text-faint px-1.5 py-3">{s.hint}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function byNextDeadline(a, b) {
  const x = nextDeadline(a)?.at; const y = nextDeadline(b)?.at;
  return (x ? new Date(x) : Infinity) - (y ? new Date(y) : Infinity);
}

function BoardCard({ h, onDragStart }) {
  const { snap, wsId, api } = useWorkspace();
  const nd = nextDeadline(h);
  const regs = snap.members.filter((m) => h.registrations?.[m.id]);
  const idx = STAGES.findIndex((s) => s.id === h.stage);
  return (
    <div draggable onDragStart={onDragStart} className="card card-hover p-3 cursor-grab active:cursor-grabbing">
      <Link href={`/w/${wsId}/hackathons/${h.id}`} className="flex items-start gap-2.5">
        <PlatformBadge platform={h.platform} size={28} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[13.5px] leading-snug line-clamp-2">{h.name}</p>
          <p className="text-[11.5px] text-faint">{PLATFORM_META[h.platform]?.label || 'Website'}{h.mode && h.mode !== 'unknown' ? ` · ${h.mode}` : ''}</p>
        </div>
      </Link>
      {nd && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[12px]">
          <span className="text-muted truncate">{nd.label}</span>
          <Countdown at={nd.at} className="text-[12px]" />
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        {regs.length > 0 ? <AvatarStack members={regs} size={20} /> : <span className="text-[11.5px] text-faint">No one registered</span>}
        <div className="flex gap-1">
          {idx > 0 && <button className="btn btn-ghost btn-sm btn-icon" title={`Move to ${STAGES[idx - 1].label}`} onClick={() => api('PATCH', `hackathons/${h.id}`, { stage: STAGES[idx - 1].id })}><Icon name="up" size={13} className="-rotate-90" /></button>}
          {idx < STAGES.length - 1 && <button className="btn btn-ghost btn-sm btn-icon" title={`Move to ${STAGES[idx + 1].label}`} onClick={() => api('PATCH', `hackathons/${h.id}`, { stage: STAGES[idx + 1].id })}><Icon name="up" size={13} className="rotate-90" /></button>}
        </div>
      </div>
    </div>
  );
}

function ListView({ list }) {
  const { snap, wsId } = useWorkspace();
  if (!list.length) return <Empty icon="trophy" title="Nothing matches" />;
  return (
    <div className="card divide-y divide-[var(--border)]">
      {list.slice().sort(byNextDeadline).map((h) => {
        const nd = nextDeadline(h);
        const status = hackStatus(h);
        const regs = snap.members.filter((m) => h.registrations?.[m.id]);
        return (
          <Link key={h.id} href={`/w/${wsId}/hackathons/${h.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 first:rounded-t-[14px] last:rounded-b-[14px]">
            <PlatformBadge platform={h.platform} size={32} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate flex items-center gap-2">{h.name}{status === 'live' && <span className="live-dot" title="Live now" />}</p>
              <p className="text-[12.5px] text-muted truncate">{nd ? `${nd.label} · ${fmtDate(nd.at)}` : h.endTime ? `Ended ${fmtDay(h.endTime)}` : 'No dates yet'}</p>
            </div>
            <div className="hidden sm:block"><AvatarStack members={regs} size={22} /></div>
            <StageBadge stage={h.stage} />
            {nd && <Countdown at={nd.at} className="hidden md:inline text-[12.5px] w-[104px] text-right" />}
          </Link>
        );
      })}
    </div>
  );
}

function Timeline({ list }) {
  const { wsId } = useWorkspace();
  const now = useNow();
  const items = upcomingDeadlines(list, now, 365);
  if (!items.length) return <Empty icon="calendar" title="No upcoming dates">Add registration and submission deadlines to hackathons to build the timeline.</Empty>;
  const groups = [];
  for (const d of items) {
    const day = new Date(d.at).toDateString();
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(d); else groups.push({ day, at: d.at, items: [d] });
  }
  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />
      {groups.map((g) => (
        <div key={g.day} className="relative mb-5">
          <span className="absolute -left-6 top-1 w-[15px] h-[15px] rounded-full bg-surface border-2 border-accent" />
          <p className="font-semibold text-[13px] mb-2">{fmtDay(g.at)}</p>
          <div className="flex flex-col gap-2">
            {g.items.map((d) => (
              <Link key={d.id} href={`/w/${wsId}/hackathons/${d.hackathonId}`} className="card card-hover px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{d.name}</p>
                  <p className="text-[12.5px] text-muted">{d.label} · {new Date(d.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
                </div>
                <StageBadge stage={d.stage} />
                <Countdown at={d.at} className="text-[12.5px]" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
