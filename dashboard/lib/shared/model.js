/**
 * Domain constants + pure reminder/CTA engine. Used by the server (Discord /
 * Slack reminders, calendar feed) and by the dashboard (Action Center,
 * browser notifications). No I/O in here.
 */

export const STAGES = [
  { id: 'discovered', label: 'Inbox', hint: 'Captured by the extension or a teammate — not decided yet' },
  { id: 'shortlisted', label: 'Shortlisted', hint: 'We want to do this one — get everyone registered' },
  { id: 'registered', label: 'Registered', hint: 'Team is in — pick the idea' },
  { id: 'building', label: 'Building', hint: 'Hacking in progress' },
  { id: 'submitted', label: 'Submitted', hint: 'Waiting for results' },
  { id: 'done', label: 'Done', hint: 'Results are in / archived' },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const ACTIVE_STAGES = ['shortlisted', 'registered', 'building'];

export const PROJECT_STATUSES = ['ideating', 'building', 'submitted', 'shipped', 'paused'];
export const TASK_STATUSES = ['todo', 'doing', 'done'];
export const IDEA_STATUSES = ['open', 'picked', 'parked'];
export const ROLES = ['leader', 'admin', 'member'];

export const DEADLINE_FIELDS = [
  ['registrationDeadline', 'Registration closes'],
  ['startTime', 'Hacking starts'],
  ['submissionDeadline', 'Submission due'],
  ['endTime', 'Event ends'],
];

export const isLead = (m) => m && (m.role === 'leader' || m.role === 'admin');

const H = 3600000;

/** Every dated moment of a hackathon, sorted. */
export function hackathonDeadlines(h) {
  const out = [];
  for (const [field, label] of DEADLINE_FIELDS) {
    if (h[field]) out.push({ id: `${h.id}:${field}`, hackathonId: h.id, field, label, at: h[field] });
  }
  for (const ms of h.milestones || []) {
    if (ms?.at) out.push({ id: `${h.id}:ms:${ms.id}`, hackathonId: h.id, field: 'milestone', label: ms.label || 'Milestone', at: ms.at });
  }
  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/** Upcoming deadlines for the whole workspace (non-archived, not done). */
export function upcomingDeadlines(hackathons, now = Date.now(), horizonDays = 60) {
  const res = [];
  for (const h of hackathons || []) {
    if (h.archived || h.stage === 'done') continue;
    for (const d of hackathonDeadlines(h)) {
      const t = new Date(d.at).getTime();
      if (t >= now && t - now <= horizonDays * 24 * H) res.push({ ...d, name: h.name, stage: h.stage, url: h.url });
    }
  }
  return res.sort((a, b) => new Date(a.at) - new Date(b.at));
}

export function urgencyFor(at, now = Date.now()) {
  const left = new Date(at).getTime() - now;
  if (left < 0) return 'overdue';
  if (left <= 24 * H) return 'critical';
  if (left <= 72 * H) return 'soon';
  return 'info';
}

export function timeLeft(at, now = Date.now()) {
  const diff = new Date(at).getTime() - now;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / (24 * H));
  const h = Math.floor((abs % (24 * H)) / H);
  const m = Math.floor((abs % H) / 60000);
  const s = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return diff < 0 ? `${s} ago` : `in ${s}`;
}

/**
 * Personal Action Center: what THIS member should do next, most urgent first.
 * Each item: { id, kind, urgency, title, detail, at, href, action }
 *   action (optional): { type: 'register'|'ack'|'task-done', id }
 */
export function computeActions(snap, meId, now = Date.now()) {
  const me = (snap.members || []).find((m) => m.id === meId);
  if (!me) return [];
  const ws = snap.workspace?.id;
  const items = [];
  const hacks = (snap.hackathons || []).filter((h) => !h.archived);

  for (const h of hacks) {
    const href = `/w/${ws}/hackathons/${h.id}`;
    const regs = h.registrations || {};
    const active = ACTIVE_STAGES.includes(h.stage);

    if (active && !regs[meId]) {
      const at = h.registrationDeadline || h.startTime || null;
      if (!at || new Date(at).getTime() > now) {
        items.push({
          id: `reg:${h.id}`, kind: 'register', urgency: at ? urgencyFor(at, now) : 'soon',
          title: `Register for ${h.name}`,
          detail: at ? `Registration closes ${timeLeft(at, now)}` : 'Each teammate has to register on the platform',
          at, href, external: h.url, action: { type: 'register', id: h.id },
        });
      }
    }
    if ((h.stage === 'registered' || h.stage === 'building') && h.submissionDeadline) {
      const t = new Date(h.submissionDeadline).getTime();
      if (t > now && t - now <= 7 * 24 * H) {
        items.push({
          id: `sub:${h.id}`, kind: 'submit', urgency: urgencyFor(h.submissionDeadline, now),
          title: `Submission for ${h.name}`, detail: `Due ${timeLeft(h.submissionDeadline, now)}`,
          at: h.submissionDeadline, href,
        });
      }
    }
    if (h.stage === 'registered' && !(snap.projects || []).some((p) => p.hackathonId === h.id)) {
      items.push({
        id: `idea:${h.id}`, kind: 'ideate', urgency: 'info',
        title: `Pick an idea for ${h.name}`, detail: 'No project yet — drop ideas and vote',
        at: h.startTime || null, href,
      });
    }
    for (const ms of h.milestones || []) {
      if (!ms?.at) continue;
      const t = new Date(ms.at).getTime();
      if (active && t > now && t - now <= 72 * H) {
        items.push({
          id: `ms:${h.id}:${ms.id}`, kind: 'milestone', urgency: urgencyFor(ms.at, now),
          title: `${ms.label} — ${h.name}`, detail: timeLeft(ms.at, now), at: ms.at, href,
        });
      }
    }
  }

  for (const t of snap.tasks || []) {
    if (t.assigneeId !== meId || t.status === 'done') continue;
    const href = t.projectId ? `/w/${ws}/projects/${t.projectId}` : `/w/${ws}/hackathons/${t.hackathonId || ''}`;
    items.push({
      id: `task:${t.id}`, kind: 'task', urgency: t.dueAt ? urgencyFor(t.dueAt, now) : 'info',
      title: t.title, detail: t.dueAt ? `Task due ${timeLeft(t.dueAt, now)}` : `Task · ${t.status === 'doing' ? 'in progress' : 'to do'}`,
      at: t.dueAt || null, href, action: { type: 'task-done', id: t.id },
    });
  }

  for (const a of snap.announcements || []) {
    if (!a.requireAck || a.archived) continue;
    const forMe = a.audience === 'all' || (Array.isArray(a.audience) && a.audience.includes(meId));
    if (!forMe || a.createdBy === meId || (a.acks || {})[meId]) continue;
    items.push({
      id: `ann:${a.id}`, kind: 'announcement', urgency: a.dueAt ? urgencyFor(a.dueAt, now) : 'soon',
      title: a.title, detail: a.dueAt ? `From the lead · due ${timeLeft(a.dueAt, now)}` : 'From the lead · needs your acknowledgement',
      at: a.dueAt || null, href: `/w/${ws}`, action: { type: 'ack', id: a.id },
    });
  }

  if (isLead(me)) {
    const inbox = hacks.filter((h) => h.stage === 'discovered');
    if (inbox.length) {
      items.push({
        id: 'triage', kind: 'triage', urgency: 'info',
        title: `Triage ${inbox.length} new hackathon${inbox.length > 1 ? 's' : ''}`,
        detail: 'Shortlist or drop what the team captured', at: null, href: `/w/${ws}/hackathons?stage=discovered`,
      });
    }
  }

  const rank = { overdue: 0, critical: 1, soon: 2, info: 3 };
  return items.sort((a, b) => (rank[a.urgency] - rank[b.urgency])
    || ((a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity)));
}

/** Which reminder offsets (hours before) the push channels fire at. */
export const REMINDER_OFFSETS_H = [72, 24, 3];

/**
 * Reminders due right now for push channels (Discord/Slack). `sent` is a Set
 * of ids already delivered. Returns [{ id, text, at, hackathonId }].
 */
export function dueReminders(snap, sent, now = Date.now(), offsets = REMINDER_OFFSETS_H) {
  const out = [];
  for (const h of snap.hackathons || []) {
    if (h.archived || !ACTIVE_STAGES.includes(h.stage)) continue;
    for (const d of hackathonDeadlines(h)) {
      const t = new Date(d.at).getTime();
      if (t <= now) continue;
      // Fire only the tightest window we're inside (avoids a burst of 72h+24h+3h at once)
      const within = offsets.filter((o) => t - now <= o * H).sort((a, b) => a - b)[0];
      if (within == null) continue;
      const id = `${d.id}:${within}h`;
      if (sent.has(id)) continue;
      const missing = d.field === 'registrationDeadline'
        ? (snap.members || []).filter((m) => !(h.registrations || {})[m.id]).map((m) => m.name)
        : [];
      out.push({
        id, at: d.at, hackathonId: h.id,
        text: `⏰ **${h.name}** — ${d.label} ${timeLeft(d.at, now)}`
          + (missing.length ? `\n   Not registered yet: ${missing.join(', ')}` : '')
          + (h.url ? `\n   ${h.url}` : ''),
      });
    }
  }
  return out;
}
