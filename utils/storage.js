/**
 * Storage Helpers (v2 — deduplication-safe)
 * ------------------------------------------
 * All writes go through a sequential queue to prevent the race condition
 * where multiple near-simultaneous saveEvent() calls read the same stale
 * array and each append a "new" entry.
 *
 * Events are keyed by normalised URL.
 */

const STORAGE_KEY = 'hpt_events';

/* ── Write queue ─────────────────────────────────────────────── */
let _queue = Promise.resolve();

function enqueue(fn) {
  _queue = _queue.then(fn, fn);   // run fn after the previous write settles
  return _queue;
}

/* ── Public API ──────────────────────────────────────────────── */

/**
 * Save or update an event. Deduplicates by normalised URL.
 * Writes are serialised — safe against concurrent calls.
 */
export function saveEvent(event) {
  return enqueue(async () => {
    const events = await _read();
    const normUrl = normalizeUrl(event.url);
    const idx = events.findIndex((e) => normalizeUrl(e.url) === normUrl);

    if (idx !== -1) {
      // Existing entry — upsert (network > cache > jsonld)
      const old = events[idx];
      const sourcePriority = { network: 3, cache: 2, jsonld: 1 };
      const oldPri = sourcePriority[old.source] ?? 0;
      const newPri = sourcePriority[event.source] ?? 0;
      if (newPri >= oldPri) {
        events[idx] = { ...old, ...event, url: old.url }; // keep original URL casing
      }
    } else {
      events.push(event);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: events });
  });
}

/**
 * Get all tracked events (deduplicated read).
 */
export async function getEvents() {
  const raw = await _read();
  // Belt-and-suspenders: deduplicate on read in case old data has dupes
  const seen = new Map();
  for (const evt of raw) {
    const key = normalizeUrl(evt.url);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, evt);
    } else {
      // Keep the higher-priority source
      const pri = { network: 3, cache: 2, jsonld: 1 };
      if ((pri[evt.source] ?? 0) > (pri[existing.source] ?? 0)) {
        seen.set(key, evt);
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Remove an event by URL.
 */
export function removeEvent(url) {
  return enqueue(async () => {
    const events = await _read();
    const normUrl = normalizeUrl(url);
    const filtered = events.filter((e) => normalizeUrl(e.url) !== normUrl);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
}

/**
 * Wipe all tracked events (one-time cleanup).
 */
export function clearEvents() {
  return enqueue(async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
  });
}

/* ── Helpers ─────────────────────────────────────────────────── */

async function _read() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

/**
 * Normalise a URL for comparison: strip trailing slashes, query params,
 * fragments, and force lowercase hostname.
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Keep hostname lowercase, preserve pathname, strip query + hash
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return (url || '').replace(/\/+$/, '').toLowerCase();
  }
}
