/**
 * API Client — Firebase Cache & Share Operations
 * ------------------------------------------------
 * High-level operations built on top of utils/firebase.js.
 *
 * Global Cache:
 *   - checkCache(url) → returns cached event or null
 *   - pushToCache(event) → saves event to Firestore
 *
 * Share Links:
 *   - createShareLink(urls) → returns { token, shareUrl }
 *   - resolveShareLink(token) → returns array of events
 */

import {
  getDoc,
  setDoc,
  queryDocs,
  urlToDocId,
  generateToken,
  computeExpiresAt,
} from './firebase.js';

/* ================================================================== */
/*  CONSTANTS                                                         */
/* ================================================================== */

const EVENTS_COLLECTION = 'events';
const SHARES_COLLECTION = 'shareLinks';

// Dashboard URL — will be finalized in Phase 4
const DASHBOARD_BASE = 'https://hackathon-pipeline-tracker.web.app/share';

/* ================================================================== */
/*  GLOBAL CACHE                                                      */
/* ================================================================== */

/**
 * Check if an event for this URL exists in the global Firestore cache.
 * @param {string} url — hackathon page URL
 * @returns {Promise<Object|null>} — cached event data, or null
 */
export async function checkCache(url) {
  const docId = urlToDocId(url);
  const cached = await getDoc(EVENTS_COLLECTION, docId);

  if (!cached) return null;

  // Check if the cache entry has expired
  if (cached.expiresAt) {
    const expiry = new Date(cached.expiresAt).getTime();
    if (Date.now() > expiry) {
      console.debug('[HPT] Cache entry expired for:', url);
      return null;
    }
  }

  console.log(`[HPT] 🗄️ Cache HIT for: ${cached.name}`);
  return {
    url: cached.url,
    name: cached.name,
    startTime: cached.startTime,
    endTime: cached.endTime,
    source: 'cache',
    platform: cached.platform,
    extractedAt: cached.extractedAt,
  };
}

/**
 * Push an extracted event to the global Firestore cache.
 * Skips if the event came FROM the cache (avoids re-push loops).
 * @param {Object} event — normalized event
 * @returns {Promise<boolean>}
 */
export async function pushToCache(event) {
  // Don't re-push cached data
  if (event.source === 'cache') return true;

  const docId = urlToDocId(event.url);
  const expiresAt = computeExpiresAt(event.endTime);

  return setDoc(EVENTS_COLLECTION, docId, {
    url: event.url,
    name: event.name,
    startTime: event.startTime,
    endTime: event.endTime,
    source: event.source,
    platform: event.platform,
    extractedAt: event.extractedAt || new Date().toISOString(),
    expiresAt,
  });
}

/* ================================================================== */
/*  SHARE LINKS                                                       */
/* ================================================================== */

/**
 * Create a share link containing the given event URLs.
 * Generates a unique token and saves it + the URLs to Firestore.
 * @param {string[]} urls — array of hackathon URLs to share
 * @returns {Promise<{token: string, shareUrl: string}|null>}
 */
export async function createShareLink(urls) {
  if (!urls || urls.length === 0) return null;

  const token = generateToken();

  // Compute expiresAt from the latest endTime across all events
  let latestEnd = 0;
  for (const url of urls) {
    const docId = urlToDocId(url);
    const event = await getDoc(EVENTS_COLLECTION, docId);
    if (event?.endTime) {
      const t = new Date(event.endTime).getTime();
      if (t > latestEnd) latestEnd = t;
    }
  }
  // Default: 7 days from now if no end times found
  const expiresAt = latestEnd > 0
    ? new Date(latestEnd + 48 * 3600_000).toISOString()
    : new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

  const success = await setDoc(SHARES_COLLECTION, token, {
    token,
    urls,
    createdAt: new Date().toISOString(),
    expiresAt,
  });

  if (!success) return null;

  return {
    token,
    shareUrl: `${DASHBOARD_BASE}/${token}`,
  };
}

/**
 * Resolve a share link: fetch the token document then fetch each event.
 * @param {string} token
 * @returns {Promise<{urls: string[], events: Object[]}|null>}
 */
export async function resolveShareLink(token) {
  const shareDoc = await getDoc(SHARES_COLLECTION, token);
  if (!shareDoc || !shareDoc.urls) return null;

  // Check expiry
  if (shareDoc.expiresAt) {
    const expiry = new Date(shareDoc.expiresAt).getTime();
    if (Date.now() > expiry) return null;
  }

  // Fetch each event from cache
  const events = [];
  for (const url of shareDoc.urls) {
    const docId = urlToDocId(url);
    const event = await getDoc(EVENTS_COLLECTION, docId);
    if (event) events.push(event);
  }

  return { urls: shareDoc.urls, events };
}
