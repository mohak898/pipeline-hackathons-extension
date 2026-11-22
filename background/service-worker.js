/**
 * Background Service Worker — v1.0
 * --------------------------------
 * Capture pipeline:  content scripts / popup / context menu
 *        → draft → local store (dedup by canonical key)
 *        → outbox → workspace API (/api/ext/hackathons, server dedups too)
 *        → remote list → deadline alarms
 *
 * MV3 service workers are killed after ~30s idle, so NOTHING important is
 * kept in module variables — dedup marks live in chrome.storage.session and
 * everything else in chrome.storage.local.
 */
import { parseApiResponse, detectPlatform } from './network-rules.js';
import { canonicalKey, detectPlatform as detectAnyPlatform } from '../utils/shared/canonical.js';
import { extractHackathon } from '../utils/shared/extract.js';
import { collectPagePrimitives } from '../utils/page-collect.js';
import {
  saveHackathon, getHackathons, removeHackathon, clearHackathons, pushOutbox, getOutbox, setOutbox,
  getConnection, setConnection, getRemote, setRemote, wasSeen, markSeen, clearSeen,
} from '../utils/storage.js';
import { parsePairing, connect, fetchWorkspaceHackathons, pushHackathons } from '../utils/api.js';
import { rescheduleAll, handleAlarm, handleNotificationClick, notify, REMINDER_STAGES } from '../utils/alarm-manager.js';

const SYNC_ALARM = 'hpt_sync';
const AUTO_PAGE_PLATFORMS = ['devfolio', 'devpost', 'unstop', 'dorahacks', 'ethglobal', 'hack2skill', 'hackerearth', 'luma'];
const ITEM_FIELDS = ['name', 'url', 'platform', 'startTime', 'endTime', 'registrationDeadline', 'submissionDeadline', 'mode', 'location', 'description', 'image'];

/* ================================================================== */
/*  capture                                                           */
/* ================================================================== */

function toItem(draft, extra = {}) {
  const item = {};
  for (const k of ITEM_FIELDS) if (draft[k] != null && draft[k] !== '') item[k] = draft[k];
  return { ...item, key: draft.key || canonicalKey(draft.url), ...extra };
}

/**
 * @param {object} draft
 * @param {{source: 'extension'|'manual', registerSelf?: boolean, stage?: string, quiet?: boolean}} opts
 */
async function capture(draft, opts) {
  if (!draft?.name || !draft.url) return { ok: false, error: 'Name and URL are required' };
  draft = { ...draft, platform: draft.platform || detectAnyPlatform(draft.url) };
  const { registered: _ignored, ...clean } = draft;
  const { record, created } = await saveHackathon(opts.registerSelf ? { ...clean, registered: true } : clean);
  const conn = await getConnection();
  let synced = null;
  if (conn) {
    await pushOutbox(toItem(draft, { source: opts.source, registerSelf: !!opts.registerSelf, ...(opts.stage ? { stage: opts.stage } : {}) }));
    synced = await flushOutbox();
  } else {
    await rescheduleFromBestSource();
  }
  if (created && !opts.quiet) {
    notify(
      opts.source === 'manual' ? '✅ Added to pipeline' : '🎯 Hackathon captured',
      `${record.name}${conn ? ` → ${conn.workspace?.name || 'workspace'}` : ' (saved locally)'}`,
      conn?.dashboardUrl || record.url,
    );
  }
  return { ok: true, created, record, synced };
}

async function flushOutbox() {
  const box = await getOutbox();
  if (!box.length) return { sent: 0 };
  try {
    const results = await pushHackathons(box.map(({ key, ...rest }) => rest));
    if (results == null) return { sent: 0, error: 'not connected' };
    // Validation failures are dropped (they'd never succeed); everything else was accepted.
    await setOutbox([]);
    await refreshRemote();
    return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
  } catch (e) {
    if (e.status === 401) {
      // token revoked — keep captures, surface in popup
      const conn = await getConnection();
      if (conn) await setConnection({ ...conn, error: e.message });
    }
    return { sent: 0, error: e.message, queued: box.length };
  }
}

async function refreshRemote() {
  try {
    const list = await fetchWorkspaceHackathons();
    if (list) {
      await setRemote(list);
      const conn = await getConnection();
      if (conn?.error) await setConnection({ ...conn, error: null });
    }
  } catch { /* offline — keep last cache */ }
  await rescheduleFromBestSource();
}

async function rescheduleFromBestSource() {
  const conn = await getConnection();
  const remote = conn ? await getRemote() : null;
  if (conn && remote?.hackathons) {
    const base = conn.dashboardUrl || '';
    await rescheduleAll(
      remote.hackathons.filter((h) => REMINDER_STAGES.includes(h.stage)),
      (h) => (base ? `${base}/hackathons/${h.id}` : h.url),
    );
  } else {
    await rescheduleAll(await getHackathons());
  }
}

/* ================================================================== */
/*  automatic capture from content scripts                            */
/* ================================================================== */

async function onApiResponse({ json, pageUrl }, tab) {
  const url = pageUrl || tab?.url || '';
  const platform = detectPlatform(url);
  const key = canonicalKey(url);
  if (!platform || !key) return;
  if (await wasSeen(key, 'network')) return;
  const draft = parseApiResponse(platform, json, url);
  if (!draft) return;
  await markSeen(key, 'network');
  await capture({ ...draft, key }, { source: 'extension' });
}

async function onPagePrimitives(primitives, tab) {
  const url = primitives?.url || tab?.url || '';
  const key = canonicalKey(url);
  const draft = extractHackathon(primitives);
  if (!key || !AUTO_PAGE_PLATFORMS.includes(draft.platform)) return;
  if ((await wasSeen(key, 'network')) || (await wasSeen(key, 'page'))) return;
  const hasDate = draft.startTime || draft.endTime || draft.registrationDeadline || draft.submissionDeadline;
  if (!draft.name || !hasDate || !draft.looksLikeHackathon) return;
  await markSeen(key, 'page');
  await capture({ ...draft, source: 'page' }, { source: 'extension' });
}

/* ================================================================== */
/*  message router                                                    */
/* ================================================================== */

const handlers = {
  async API_RESPONSE(p, sender) { await onApiResponse(p || {}, sender.tab); return { ok: true }; },
  async PAGE_PRIMITIVES(p, sender) { await onPagePrimitives(p, sender.tab); return { ok: true }; },

  async GET_STATE() {
    const [connection, local, remote, outbox] = await Promise.all([getConnection(), getHackathons(), getRemote(), getOutbox()]);
    const safeConn = connection ? { ...connection, token: undefined, tokenHint: `${connection.token.slice(0, 10)}…` } : null;
    return { connection: safeConn, local, remote, outboxCount: outbox.length };
  },

  async CAPTURE_MANUAL(p) {
    return capture(p.draft, { source: 'manual', registerSelf: !!p.registered, stage: p.stage, quiet: true });
  },

  async CONNECT(p) {
    try {
      const { apiBase, token } = parsePairing(p.input, p.token);
      const conn = await connect(apiBase, token);
      // Ship everything captured while unpaired
      const local = await getHackathons();
      for (const h of local) await pushOutbox(toItem(h, { source: 'extension', registerSelf: !!h.registered }));
      await flushOutbox();
      await refreshRemote();
      return { ok: true, workspace: conn.workspace, member: conn.member };
    } catch (e) {
      return { ok: false, error: e.status === 401 ? 'Token rejected — create a new one in the dashboard.' : e.message || 'Could not reach the dashboard' };
    }
  },

  async DISCONNECT() { await setConnection(null); await rescheduleFromBestSource(); return { ok: true }; },
  async REFRESH() { const r = await flushOutbox(); await refreshRemote(); return { ok: true, ...r }; },
  async REMOVE_LOCAL(p) { await removeHackathon(p.key); await rescheduleFromBestSource(); return { ok: true }; },
  async CLEAR_LOCAL() { await clearHackathons(); await clearSeen(); await rescheduleFromBestSource(); return { ok: true }; },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const h = handlers[message?.type];
  if (!h) return false;
  h(message.payload, sender).then(sendResponse, (e) => {
    console.warn('[HPT]', message.type, e);
    sendResponse({ ok: false, error: e?.message || 'Unexpected error' });
  });
  return true; // async response
});

/* ================================================================== */
/*  context menu: add any page                                         */
/* ================================================================== */

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'hpt-add-page' || !tab?.id) return;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPagePrimitives });
    const draft = extractHackathon(result);
    draft.name = draft.name || tab.title || 'Untitled hackathon';
    const r = await capture(draft, { source: 'manual', quiet: true });
    const missing = !draft.registrationDeadline && !draft.endTime && !draft.submissionDeadline;
    notify(
      r.created ? '✅ Added to pipeline' : 'Already in your pipeline — updated',
      `${draft.name}${missing ? ' · no dates found, add them in the popup or dashboard' : ''}`,
      (await getConnection())?.dashboardUrl || draft.url,
    );
  } catch (e) {
    notify('Could not read this page', String(e?.message || e).slice(0, 120));
  }
});

/* ================================================================== */
/*  lifecycle                                                         */
/* ================================================================== */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) { await flushOutbox(); await refreshRemote(); return; }
  await handleAlarm(alarm);
});
chrome.notifications.onClicked.addListener(handleNotificationClick);

function setup() {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 15 });
  chrome.contextMenus?.removeAll(() => {
    chrome.contextMenus.create({ id: 'hpt-add-page', title: 'Add this page to hackathon pipeline', contexts: ['page'] });
  });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
