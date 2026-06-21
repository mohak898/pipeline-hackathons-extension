/**
 * Alarm Manager
 * -------------
 * Schedules chrome.alarms 24 hours before hackathon deadlines
 * and fires native desktop notifications when alarms trigger.
 */

const ALARM_PREFIX = 'hpt_deadline_';

/**
 * Schedule a notification alarm 24 hours before the event's end time.
 * If the 24-hr mark has already passed but the event hasn't ended,
 * fire immediately.
 * @param {Object} event — normalized event with url, name, endTime
 */
export async function scheduleDeadlineAlarm(event) {
  if (!event.endTime) return;

  const alarmName = ALARM_PREFIX + hashUrl(event.url);
  const endMs = new Date(event.endTime).getTime();
  const triggerMs = endMs - 24 * 60 * 60 * 1000; // 24 hours before
  const now = Date.now();

  // Event already ended — no alarm needed
  if (now >= endMs) return;

  if (now >= triggerMs) {
    // 24-hr window already open — notify immediately
    fireNotification(event);
    return;
  }

  // Schedule for the future
  await chrome.alarms.create(alarmName, {
    when: triggerMs,
  });

  // Store alarm→event mapping so we can look it up on fire
  await chrome.storage.local.set({
    [`alarm_${alarmName}`]: {
      url: event.url,
      name: event.name,
      endTime: event.endTime,
    },
  });

  console.log(`[HPT] Alarm scheduled: ${event.name} at ${new Date(triggerMs).toISOString()}`);
}

/**
 * Handle a fired alarm — look up event metadata and fire notification.
 * @param {chrome.alarms.Alarm} alarm
 */
export async function handleAlarmFired(alarm) {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const key = `alarm_${alarm.name}`;
  const result = await chrome.storage.local.get(key);
  const meta = result[key];

  if (meta) {
    fireNotification(meta);
    await chrome.storage.local.remove(key); // cleanup
  }
}

/**
 * Fire a native desktop notification.
 */
function fireNotification(event) {
  chrome.notifications.create(`hpt_notif_${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: '⏰ Hackathon Deadline in 24h!',
    message: `"${event.name}" ends at ${new Date(event.endTime).toLocaleString()}`,
    priority: 2,
  });
}

/**
 * Simple hash for URL → alarm name.
 */
function hashUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32-bit int
  }
  return Math.abs(hash).toString(36);
}
