/**
 * Deadline reminders (v1.0)
 * -------------------------
 * Rebuilds all reminder alarms from the current hackathon list: one alarm
 * 24h and one 3h before every registration / submission / end deadline.
 * Only future trigger times are scheduled, so a rebuild never re-fires an
 * old reminder (the v0.5 code fired "24h left!" on every page visit).
 */
const PREFIX = 'hpt_dl_';
const META_KEY = 'hpt_alarm_meta';
const NOTIF_KEY = 'hpt_notif_targets';
const OFFSETS_H = [24, 3];
const FIELDS = [
  ['registrationDeadline', 'Registration closes'],
  ['submissionDeadline', 'Submission due'],
  ['endTime', 'Event ends'],
];
export const REMINDER_STAGES = ['shortlisted', 'registered', 'building'];

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/**
 * @param {Array} hackathons  records with name, url, deadlines
 * @param {(h) => string} openUrlFor  where a notification click should go
 */
export async function rescheduleAll(hackathons, openUrlFor = (h) => h.url) {
  const existing = await chrome.alarms.getAll();
  await Promise.all(existing.filter((a) => a.name.startsWith(PREFIX)).map((a) => chrome.alarms.clear(a.name)));
  const meta = {};
  const now = Date.now();
  for (const h of hackathons) {
    for (const [field, label] of FIELDS) {
      if (!h[field]) continue;
      const at = new Date(h[field]).getTime();
      if (Number.isNaN(at) || at <= now) continue;
      for (const off of OFFSETS_H) {
        const when = at - off * 3600000;
        if (when <= now) continue;
        const name = `${PREFIX}${hash(`${h.key || h.id || h.url}|${field}|${off}`)}`;
        meta[name] = { name: h.name, label, at: h[field], offset: off, openUrl: openUrlFor(h) || h.url };
        await chrome.alarms.create(name, { when });
      }
    }
  }
  await chrome.storage.local.set({ [META_KEY]: meta });
  return Object.keys(meta).length;
}

export async function handleAlarm(alarm) {
  if (!alarm.name.startsWith(PREFIX)) return false;
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY] || {};
  const m = meta[alarm.name];
  if (!m) return true;
  const id = `hpt_n_${Date.now()}`;
  const targets = (await chrome.storage.local.get(NOTIF_KEY))[NOTIF_KEY] || {};
  targets[id] = m.openUrl;
  // keep the map small
  const keys = Object.keys(targets);
  if (keys.length > 50) keys.slice(0, keys.length - 50).forEach((k) => delete targets[k]);
  await chrome.storage.local.set({ [NOTIF_KEY]: targets });
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: `⏰ ${m.label} in ${m.offset}h`,
    message: `${m.name} — ${new Date(m.at).toLocaleString()}`,
    priority: 2,
  });
  return true;
}

export async function handleNotificationClick(notificationId) {
  const targets = (await chrome.storage.local.get(NOTIF_KEY))[NOTIF_KEY] || {};
  const url = targets[notificationId];
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
}

export function notify(title, message, openUrl) {
  const id = `hpt_n_${Date.now()}`;
  chrome.storage.local.get(NOTIF_KEY).then((r) => {
    const t = r[NOTIF_KEY] || {};
    if (openUrl) t[id] = openUrl;
    chrome.storage.local.set({ [NOTIF_KEY]: t });
  });
  chrome.notifications.create(id, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title, message, priority: 1,
  });
}
