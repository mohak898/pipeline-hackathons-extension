/** Formatting helpers for the dashboard (client-side, local timezone). */

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: opts.weekday === false ? undefined : 'short', month: 'short', day: 'numeric',
    ...(opts.year || d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    ...(opts.time === false ? {} : { hour: 'numeric', minute: '2-digit' }),
  });
}

export function fmtDay(iso) {
  return fmtDate(iso, { time: false });
}

export function relTime(iso, now = Date.now()) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units = [[86400000, 'd'], [3600000, 'h'], [60000, 'm']];
  for (const [ms, u] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      return diff < 0 ? `${n}${u} ago` : `in ${n}${u}`;
    }
  }
  return diff < 0 ? 'just now' : 'now';
}

/** ISO → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO (or null). */
export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function hackStatus(h, now = Date.now()) {
  const s = h.startTime ? new Date(h.startTime).getTime() : null;
  const e = h.endTime ? new Date(h.endTime).getTime() : (h.submissionDeadline ? new Date(h.submissionDeadline).getTime() : null);
  if (e && now > e) return 'ended';
  if (s && now >= s) return 'live';
  return 'upcoming';
}

/** Next relevant deadline of a hackathon from now. */
export function nextDeadline(h, now = Date.now()) {
  const list = [
    ['Registration closes', h.registrationDeadline],
    ['Starts', h.startTime],
    ['Submission due', h.submissionDeadline],
    ['Ends', h.endTime],
    ...((h.milestones || []).map((m) => [m.label, m.at])),
  ].filter(([, at]) => at && new Date(at).getTime() > now)
    .sort((a, b) => new Date(a[1]) - new Date(b[1]));
  return list[0] ? { label: list[0][0], at: list[0][1] } : null;
}

export const PLATFORM_META = {
  devfolio: { label: 'Devfolio', color: '#3770ff', img: '/platforms/devfolio.png' },
  devpost: { label: 'Devpost', color: '#003e54', img: '/platforms/devpost.png' },
  unstop: { label: 'Unstop', color: '#1c4980', img: '/platforms/unstop.png' },
  mlh: { label: 'MLH', color: '#e73427' },
  hackerearth: { label: 'HackerEarth', color: '#323754' },
  hack2skill: { label: 'Hack2skill', color: '#6c2bd9' },
  luma: { label: 'Luma', color: '#111' },
  dorahacks: { label: 'DoraHacks', color: '#ff7a00' },
  ethglobal: { label: 'ETHGlobal', color: '#6b7bff' },
  web: { label: 'Website', color: '#475569' },
};

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}
