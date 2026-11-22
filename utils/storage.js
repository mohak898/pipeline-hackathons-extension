/**
 * Local store (v1.0) — chrome.storage.local, keyed by canonical key.
 * ------------------------------------------------------------------
 *  hpt_hackathons   { [key]: record }        local captures (works offline / unpaired)
 *  hpt_outbox       [ draft ]                captures waiting to sync to the workspace
 *  hpt_connection   { apiBase, token, workspace, member, dashboardUrl }
 *  hpt_remote       { fetchedAt, hackathons } last workspace list (for popup + alarms)
 *
 * All writes go through one promise queue so concurrent captures can't
 * read-modify-write over each other (the original duplicate bug #1).
 */
import { canonicalKey, isSameHackathon, mergeHackathon, normalizeUrl } from './shared/canonical.js';

const K_HACKS = 'hpt_hackathons';
const K_OUTBOX = 'hpt_outbox';
const K_CONN = 'hpt_connection';
const K_REMOTE = 'hpt_remote';

let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function read(key, fallback) {
  const r = await chrome.storage.local.get(key);
  return r[key] ?? fallback;
}

/**
 * Save/merge a capture. Returns { record, created }.
 * Dedup: same canonical key, same normalised URL/altUrl, or isSameHackathon.
 */
export function saveHackathon(draft) {
  return enqueue(async () => {
    const all = await read(K_HACKS, {});
    const key = draft.key || canonicalKey(draft.url) || `url:${normalizeUrl(draft.url)}`;
    const nu = normalizeUrl(draft.url);
    let existingKey = all[key] ? key : null;
    if (!existingKey) {
      existingKey = Object.keys(all).find((k) => {
        const h = all[k];
        return normalizeUrl(h.url) === nu || (h.altUrls || []).includes(nu) || isSameHackathon(h, { ...draft, key });
      }) || null;
    }
    let record; let created = false;
    if (existingKey) {
      record = mergeHackathon(all[existingKey], { ...draft, key: undefined });
      if (draft.registered) record.registered = true;
      record.updatedAt = new Date().toISOString();
      all[existingKey] = record;
    } else {
      created = true;
      record = {
        ...draft, key, url: nu, stage: draft.stage || 'discovered', registered: !!draft.registered,
        capturedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      all[key] = record;
    }
    await chrome.storage.local.set({ [K_HACKS]: all });
    return { record, created };
  });
}

export async function getHackathons() {
  return Object.values(await read(K_HACKS, {}));
}

export function removeHackathon(key) {
  return enqueue(async () => {
    const all = await read(K_HACKS, {});
    delete all[key];
    await chrome.storage.local.set({ [K_HACKS]: all });
  });
}

export function clearHackathons() {
  return enqueue(() => chrome.storage.local.remove([K_HACKS, K_OUTBOX]));
}

/* ── outbox ─────────────────────────────────────────────────────── */
export function pushOutbox(item) {
  return enqueue(async () => {
    const box = await read(K_OUTBOX, []);
    const key = item.key || canonicalKey(item.url);
    const i = box.findIndex((b) => (b.key || canonicalKey(b.url)) === key && key);
    if (i !== -1) box[i] = { ...box[i], ...item, registerSelf: box[i].registerSelf || item.registerSelf };
    else box.push(item);
    await chrome.storage.local.set({ [K_OUTBOX]: box.slice(-200) });
  });
}

export async function getOutbox() { return read(K_OUTBOX, []); }

export function setOutbox(items) {
  return enqueue(() => chrome.storage.local.set({ [K_OUTBOX]: items }));
}

/* ── connection / remote cache ─────────────────────────────────── */
export async function getConnection() { return read(K_CONN, null); }
export async function setConnection(conn) {
  if (conn) await chrome.storage.local.set({ [K_CONN]: conn });
  else await chrome.storage.local.remove([K_CONN, K_REMOTE]);
}
export async function getRemote() { return read(K_REMOTE, null); }
export async function setRemote(hackathons) {
  await chrome.storage.local.set({ [K_REMOTE]: { fetchedAt: new Date().toISOString(), hackathons } });
}

/* ── per-session "already handled" marks (survive SW restarts) ─── */
const K_SEEN = 'hpt_seen';
export async function wasSeen(key, sig) {
  const r = await chrome.storage.session.get(K_SEEN);
  return (r[K_SEEN] || {})[key] === sig;
}
export async function markSeen(key, sig) {
  const r = await chrome.storage.session.get(K_SEEN);
  const seen = r[K_SEEN] || {};
  seen[key] = sig;
  await chrome.storage.session.set({ [K_SEEN]: seen });
}
export async function clearSeen() { await chrome.storage.session.remove(K_SEEN); }
