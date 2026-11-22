/**
 * Content Script — ISOLATED world (v1.0)
 * --------------------------------------
 *  1. Relays API responses captured by network-hook.js to the background.
 *  2. Collects page primitives (title, meta, JSON-LD, text) and sends them
 *     to the background, which runs the shared generic extractor.
 *  3. Re-runs on SPA navigations (URL polling — content scripts can't see
 *     the page's history.pushState calls directly).
 *
 * Never calls fetch() to the hackathon platform.
 */
(function () {
  'use strict';

  const HOOK_MSG_TYPE = '__HPT_NETWORK_INTERCEPT__';
  let currentUrl = location.href;
  let pageTimer = null;

  function safeSend(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch { /* extension reloaded → context invalidated */ }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== HOOK_MSG_TYPE) return;
    const { url: apiUrl, json, pageUrl } = event.data.payload || {};
    if (!apiUrl || !json) return;
    safeSend({ type: 'API_RESPONSE', payload: { json, apiUrl, pageUrl: pageUrl || location.href } });
  });

  function collectPage() {
    const metas = {};
    document.querySelectorAll('meta[content]').forEach((m) => {
      const k = (m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop') || '').toLowerCase();
      if (k && !(k in metas)) metas[k] = m.getAttribute('content');
    });
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent || '');
    const text = (document.body?.innerText || '').slice(0, 60000);
    return { url: location.href, title: document.title, metas, jsonLd, text };
  }

  function schedulePageScan() {
    clearTimeout(pageTimer);
    // SPAs render after load — give them a moment
    pageTimer = setTimeout(() => safeSend({ type: 'PAGE_PRIMITIVES', payload: collectPage() }), 2500);
  }

  setInterval(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      schedulePageScan();
    }
  }, 1000);
  window.addEventListener('popstate', schedulePageScan);

  schedulePageScan();
})();
