/**
 * Content Script — Data Extractor (v0.3 — Passive-Only)
 * -------------------------------------------------------
 * Runs at document_idle in the ISOLATED world on Devfolio, Devpost, Unstop.
 *
 * Responsibilities:
 *   1. Listen for intercepted API responses from the MAIN-world
 *      network-hook.js (via window.postMessage) → forward to background.
 *   2. Parse <script type="application/ld+json"> for Schema.org Event
 *      data (Layer 3 fallback) → forward to background.
 *
 * This script NEVER calls fetch() to any hackathon platform.
 */

(function () {
  'use strict';

  const PAGE_URL = window.location.href;
  const PLATFORM = detectPlatform(window.location.hostname);
  const HOOK_MSG_TYPE = '__HPT_NETWORK_INTERCEPT__';

  /* ================================================================ */
  /*  MAIN                                                            */
  /* ================================================================ */
  function main() {
    console.log(`[HPT] Content script loaded (${PLATFORM}): ${PAGE_URL}`);

    // Listen for network-hook postMessage data
    window.addEventListener('message', handleWindowMessage);

    // Notify background
    safeSend({ type: 'PAGE_LOADED', payload: { url: PAGE_URL, platform: PLATFORM } });

    // JSON-LD fallback — delay for SPAs
    setTimeout(extractAndSendJsonLd, 2000);
  }

  /* ================================================================ */
  /*  LAYER 0 — NETWORK HOOK RECEIVER                                */
  /* ================================================================ */
  function handleWindowMessage(event) {
    if (event.source !== window) return;
    if (event.data?.type !== HOOK_MSG_TYPE) return;

    const { url: apiUrl, json } = event.data.payload || {};
    if (!apiUrl || !json) return;

    console.log(`[HPT] 🎣 Hook intercepted: ${apiUrl}`);

    safeSend({
      type: 'API_RESPONSE',
      payload: {
        json,
        apiUrl,
        pageUrl: PAGE_URL,
        platformKey: PLATFORM,
      },
    });
  }

  /* ================================================================ */
  /*  LAYER 3 — JSON-LD FALLBACK                                     */
  /* ================================================================ */
  function extractAndSendJsonLd() {
    const event = extractJsonLd();
    if (event) {
      safeSend({
        type: 'EVENT_EXTRACTED',
        payload: { ...event, url: PAGE_URL, platform: PLATFORM, source: 'jsonld' },
      });
      console.log('[HPT] JSON-LD event sent:', event.name);
    }
  }

  function extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const event = findEventInJsonLd(data);
        if (event) return event;
      } catch {
        // malformed JSON-LD, skip
      }
    }
    return null;
  }

  function findEventInJsonLd(data) {
    if (Array.isArray(data)) {
      for (const item of data) {
        const r = findEventInJsonLd(item);
        if (r) return r;
      }
      return null;
    }
    if (!data || typeof data !== 'object') return null;
    if (data['@graph']) return findEventInJsonLd(data['@graph']);

    const type = data['@type'];
    const eventTypes = ['Event', 'Hackathon', 'SocialEvent', 'BusinessEvent', 'EducationEvent'];
    const isEvent =
      eventTypes.includes(type) ||
      (Array.isArray(type) && type.some((t) => eventTypes.includes(t)));

    if (isEvent) {
      const name = data.name || data.headline || null;
      const startTime = data.startDate || null;
      const endTime = data.endDate || null;
      if (name && (startTime || endTime)) return { name, startTime, endTime };
    }
    return null;
  }

  /* ================================================================ */
  /*  HELPERS                                                         */
  /* ================================================================ */

  /** Safely send a message — swallow errors if context is invalidated. */
  function safeSend(msg) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch {
      // Extension context invalidated (e.g. after update/reload)
    }
  }

  function detectPlatform(hostname) {
    if (hostname.includes('devfolio.co')) return 'devfolio';
    if (hostname.includes('devpost.com')) return 'devpost';
    if (hostname.includes('unstop.com')) return 'unstop';
    return 'unknown';
  }

  main();
})();
