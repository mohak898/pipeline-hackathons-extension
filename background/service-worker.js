/**
 * Background Service Worker — v0.5 (Dedup-safe)
 * -------------------------------------------------
 * Passive-only + write-serialised. No fetch() to hackathon platforms.
 *
 * Deduplication:
 *   - In-memory Set tracks which page URLs have been processed this session
 *   - storage.js uses a write queue to serialise concurrent saves
 *   - Firestore uses deterministic doc IDs (URL hash) for natural upsert
 */

import { detectPlatform, parseApiResponse } from './network-rules.js';
import { scheduleDeadlineAlarm, handleAlarmFired } from '../utils/alarm-manager.js';
import { saveEvent, getEvents, clearEvents } from '../utils/storage.js';
import { checkCache, pushToCache, createShareLink } from '../utils/api-client.js';

/** In-memory set of page URLs already processed this session. */
const processed = new Set();

/* ================================================================== */
/*  MESSAGE ROUTER                                                    */
/* ================================================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PAGE_LOADED':
      handlePageLoaded(message.payload, sender.tab);
      sendResponse({ status: 'ok' });
      break;

    case 'API_RESPONSE':
      handleApiResponse(message.payload, sender.tab);
      sendResponse({ status: 'ok' });
      break;

    case 'EVENT_EXTRACTED':
      handleJsonLdEvent(message.payload, sender.tab);
      sendResponse({ status: 'ok' });
      break;

    case 'GET_EVENTS':
      getEvents().then((events) => sendResponse({ events }));
      return true;

    case 'CREATE_SHARE':
      handleCreateShare(message.payload).then((r) => sendResponse(r));
      return true;

    case 'CLEAR_ALL':
      clearEvents().then(() => {
        processed.clear();
        sendResponse({ status: 'cleared' });
      });
      return true;

    default:
      break;
  }
});

/* ================================================================== */
/*  PAGE LOADED — cache-first                                         */
/* ================================================================== */

async function handlePageLoaded(payload, senderTab) {
  const pageUrl = payload?.url || senderTab?.url || '';
  const platform = payload?.platform || detectPlatform(pageUrl) || 'unknown';
  console.debug(`[HPT] 📄 Page loaded (${platform}): ${pageUrl}`);

  // Check local storage first
  const localEvents = await getEvents();
  const localHit = localEvents.find((e) => e.url === pageUrl);
  if (localHit && localHit.source === 'network') {
    processed.add(normalizePageUrl(pageUrl));
    return;
  }

  // Check Firestore
  try {
    const cached = await checkCache(pageUrl);
    if (cached) {
      processed.add(normalizePageUrl(pageUrl));
      await saveEvent(cached);
      await scheduleDeadlineAlarm(cached);
      console.log(`[HPT] 🗄️ Cache hit: "${cached.name}"`);
    }
  } catch {
    // Offline — continue, hook will capture data
  }
}

/* ================================================================== */
/*  LAYER 0 — API_RESPONSE                                            */
/* ================================================================== */

async function handleApiResponse(payload, senderTab) {
  const { json, apiUrl, pageUrl, platformKey } = payload || {};
  if (!json) return;

  const resolvedPageUrl = pageUrl || senderTab?.url || '';
  const normPage = normalizePageUrl(resolvedPageUrl);

  // Skip if this page was already processed this session
  if (processed.has(normPage)) {
    console.debug('[HPT] Already processed this page — skipping.');
    return;
  }

  const platform = platformKey || detectPlatform(apiUrl) || detectPlatform(resolvedPageUrl);
  if (!platform) return;

  const event = parseApiResponse(platform, json, resolvedPageUrl);
  if (event) {
    processed.add(normPage);   // mark BEFORE async write
    await processEvent(event);
  }
}

/* ================================================================== */
/*  LAYER 3 — JSON-LD                                                 */
/* ================================================================== */

async function handleJsonLdEvent(payload, senderTab) {
  const pageUrl = payload?.url || senderTab?.url || '';
  const normPage = normalizePageUrl(pageUrl);

  if (processed.has(normPage)) return;

  const existing = await getEvents();
  const betterExists = existing.some(
    (e) => normalizePageUrl(e.url) === normPage && e.source !== 'jsonld',
  );
  if (betterExists) {
    processed.add(normPage);
    return;
  }

  processed.add(normPage);
  await processEvent({
    ...payload,
    url: pageUrl,
    platform: payload.platform || detectPlatform(pageUrl) || 'unknown',
  });
}

/* ================================================================== */
/*  SHARE                                                             */
/* ================================================================== */

async function handleCreateShare(payload) {
  const urls = payload?.urls || [];
  if (urls.length === 0) return { success: false, error: 'No events to share.' };
  try {
    const result = await createShareLink(urls);
    if (result) {
      console.log(`[HPT] 🔗 Share link: ${result.shareUrl}`);
      return { success: true, ...result };
    }
    return { success: false, error: 'Firestore write failed.' };
  } catch {
    return { success: false, error: 'Firestore unreachable.' };
  }
}

/* ================================================================== */
/*  PROCESS + PERSIST                                                 */
/* ================================================================== */

async function processEvent(event) {
  const normalized = {
    url: event.url || '',
    name: event.name || 'Unknown Hackathon',
    startTime: event.startTime || null,
    endTime: event.endTime || null,
    source: event.source || 'unknown',
    platform: event.platform || 'unknown',
    extractedAt: new Date().toISOString(),
  };

  if (!normalized.url || !normalized.endTime) return;

  await saveEvent(normalized);
  await scheduleDeadlineAlarm(normalized);

  pushToCache(normalized).then((ok) => {
    if (ok) console.debug(`[HPT] ☁️ Pushed: "${normalized.name}"`);
  }).catch(() => {});

  console.log(
    `[HPT] ✅ Saved: "${normalized.name}"  [${normalized.source} · ${normalized.platform}]`,
  );
}

/* ================================================================== */
/*  HELPERS                                                           */
/* ================================================================== */

function normalizePageUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return (url || '').replace(/\/+$/, '').toLowerCase();
  }
}

/* ================================================================== */
/*  ALARMS + INSTALL                                                  */
/* ================================================================== */

chrome.alarms.onAlarm.addListener(handleAlarmFired);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') console.log('[HPT] Installed — v0.5.0');
});
