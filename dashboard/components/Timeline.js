'use client';

import EventCard from './EventCard';

export default function Timeline({ events }) {
  const ord = { live: 0, upcoming: 1, ended: 2 };
  const sorted = [...events].sort((a, b) => {
    const sa = ord[st(a)] ?? 9;
    const sb = ord[st(b)] ?? 9;
    if (sa !== sb) return sa - sb;
    return new Date(a.endTime) - new Date(b.endTime);
  });

  const live = sorted.filter((e) => st(e) === 'live').length;
  const upcoming = sorted.filter((e) => st(e) === 'upcoming').length;

  return (
    <div>
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        {live > 0 && <span className="status-badge status-live"><span className="live-dot" />{live} Live</span>}
        {upcoming > 0 && <span className="status-badge status-upcoming">{upcoming} Upcoming</span>}
        <span className="text-[11px] text-[#222] ml-auto">{events.length} total</span>
      </div>

      {/* Cards with gap-8 */}
      <div className="flex flex-col gap-8">
        {sorted.map((event, i) => (
          <EventCard key={event.url || i} event={event} />
        ))}
      </div>
    </div>
  );
}

function st(e) {
  const now = Date.now();
  if (now < new Date(e.startTime).getTime()) return 'upcoming';
  if (now <= new Date(e.endTime).getTime()) return 'live';
  return 'ended';
}
