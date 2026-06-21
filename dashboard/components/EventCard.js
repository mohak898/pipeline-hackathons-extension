'use client';

import CountdownTimer from './CountdownTimer';

const PLATFORM_INITIALS = {
  unstop: 'U',
  devfolio: 'D',
  devpost: 'P',
};

export default function EventCard({ event }) {
  const status = getStatus(event.startTime, event.endTime);
  const platform = (event.platform || 'unknown').toLowerCase();
  
  // Resolve image source. Fallback to generic if not one of the main 3.
  const validPlatforms = ['unstop', 'devfolio', 'devpost'];
  const imgSrc = validPlatforms.includes(platform) 
    ? `/platforms/${platform}.png` 
    : '/platforms/generic.png';

  return (
    <div className="tl-node">
      {/* Timeline dot */}
      <div className={`tl-dot tl-dot-${status}`}>
        {status === 'live' && <span className="live-dot" />}
        {status === 'upcoming' && <span className="w-[6px] h-[6px] rounded-full bg-[#3b82f6]" />}
        {status === 'ended' && <span className="w-[5px] h-[5px] rounded-full bg-[#222]" />}
      </div>

      {/* Card */}
      <a
        href={event.url}
        target="_blank"
        rel="noopener noreferrer"
        className="glass-card block p-8 no-underline cursor-pointer"
      >
        {/* Row 1: Platform pill + logo ← → Status badge */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <img 
              src={imgSrc} 
              alt={`${platform} logo`} 
              className="w-12 h-12 rounded-xl object-contain border border-white/[0.04] bg-white/[0.03]"
            />
            <div>
              <span className="platform-pill">{platform}</span>
            </div>
          </div>
          <span className={`status-badge status-${status}`}>
            {status === 'live' && <span className="live-dot" />}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>

        {/* Row 2: Hackathon name */}
        <h3 className="text-xl font-bold tracking-tight leading-snug text-[#f0f0f0] mb-6">
          {event.name}
        </h3>

        {/* Row 3: Hero countdown */}
        <div className="mb-8">
          {status === 'live' && (
            <div className="rounded-xl p-6 bg-[rgba(34,197,94,0.03)] border border-[rgba(34,197,94,0.06)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#22c55e]/50 mb-4">Ends in</p>
              <CountdownTimer targetDate={event.endTime} variant="live" />
            </div>
          )}
          {status === 'upcoming' && (
            <div className="rounded-xl p-6 bg-[rgba(59,130,246,0.03)] border border-[rgba(59,130,246,0.06)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#3b82f6]/50 mb-4">Starts in</p>
              <CountdownTimer targetDate={event.startTime} variant="upcoming" />
            </div>
          )}
          {status === 'ended' && (
            <p className="text-sm text-[#333] italic">This event has concluded</p>
          )}
        </div>

        {/* Row 4: Dates (secondary) */}
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[11px] text-[#333]">
          <div>
            <span className="text-[#222]">Start</span>
            <p className="text-[#555] mt-0.5">{fmtDate(event.startTime)}</p>
          </div>
          <div>
            <span className="text-[#222]">End</span>
            <p className="text-[#555] mt-0.5">{fmtDate(event.endTime)}</p>
          </div>
        </div>
      </a>
    </div>
  );
}

function getStatus(s, e) {
  const now = Date.now();
  if (now < new Date(s).getTime()) return 'upcoming';
  if (now <= new Date(e).getTime()) return 'live';
  return 'ended';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
