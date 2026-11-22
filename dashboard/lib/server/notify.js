/**
 * Push channels: Discord/Slack webhook reminders + iCalendar feed.
 * The cron endpoint (/api/cron/reminders) calls runReminders() — schedule it
 * every 15–60 min (vercel.json, GitHub Actions, or any cron hitting the URL).
 */
import { getDb } from './db.js';
import { dueReminders, hackathonDeadlines, REMINDER_OFFSETS_H } from '../shared/model.js';

export async function sendWebhook(webhookUrl, text) {
  const isSlack = webhookUrl.includes('hooks.slack.com');
  const body = isSlack ? { text: text.replace(/\*\*/g, '*') } : { content: text, username: 'Pipeline Tracker' };
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok;
}

export async function runReminders(nowMs = Date.now()) {
  const db = getDb();
  const workspaces = await db.find('workspaces', {});
  const report = [];
  for (const ws of workspaces) {
    const hook = ws.settings?.webhookUrl;
    if (!hook) continue;
    const [hackathons, members, sentDocs] = await Promise.all([
      db.find('hackathons', { workspaceId: ws.id }),
      db.find('members', { workspaceId: ws.id }),
      db.find('sentReminders', { workspaceId: ws.id }),
    ]);
    const sent = new Set(sentDocs.map((d) => d.reminderId));
    const due = dueReminders({ hackathons, members: members.filter((m) => !m.removed) }, sent, nowMs, ws.settings?.reminderOffsets?.length ? ws.settings.reminderOffsets : REMINDER_OFFSETS_H);
    if (!due.length) continue;
    const text = due.map((r) => r.text).join('\n\n');
    let ok = false;
    try { ok = await sendWebhook(hook, text.slice(0, 1900)); } catch { ok = false; }
    if (ok) {
      for (const r of due) {
        await db.put('sentReminders', { id: `${ws.id}:${r.id}`.replace(/[/]/g, '_'), workspaceId: ws.id, reminderId: r.id, sentAt: new Date(nowMs).toISOString() });
      }
    }
    report.push({ workspace: ws.id, sent: ok ? due.length : 0, failed: ok ? 0 : due.length });
  }
  return report;
}

/* ------------------------------------------------------------------ */
/*  iCalendar                                                          */
/* ------------------------------------------------------------------ */
const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const fold = (line) => line.match(/.{1,73}/g).join('\r\n ');

export function buildIcs(ws, hackathons, baseUrl) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hackathon Pipeline Tracker//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(`${ws.name} — Hackathons`)}`, 'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = icsDate(new Date().toISOString());
  for (const h of hackathons) {
    if (h.archived || h.stage === 'discovered') continue;
    for (const d of hackathonDeadlines(h)) {
      const start = icsDate(d.at);
      const end = icsDate(new Date(new Date(d.at).getTime() + 30 * 60000).toISOString());
      lines.push(
        'BEGIN:VEVENT',
        `UID:${d.id.replace(/[^a-zA-Z0-9:._-]/g, '')}@hpt`,
        `DTSTAMP:${stamp}`, `DTSTART:${start}`, `DTEND:${end}`,
        fold(`SUMMARY:${esc(`${d.label}: ${h.name}`)}`),
        fold(`DESCRIPTION:${esc(`${h.url || ''}\nWorkspace: ${baseUrl}/w/${ws.id}/hackathons/${h.id}`)}`),
        ...(h.url ? [fold(`URL:${h.url}`)] : []),
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(d.label)}`, 'TRIGGER:-PT24H', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(d.label)}`, 'TRIGGER:-PT2H', 'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
