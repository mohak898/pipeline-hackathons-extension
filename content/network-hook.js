/**
 * Network Hook — MAIN World Script (v2 — dedup)
 * ------------------------------------------------
 * Patches fetch/XHR and sends ONE response per unique API URL per page load.
 */

(function () {
  'use strict';

  const MSG_TYPE = '__HPT_NETWORK_INTERCEPT__';
  const posted = new Set();   // ← NEW: track API URLs already posted

  function isInterestingUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      const u = new URL(url, window.location.origin);
      const host = u.hostname;
      const path = u.pathname;

      if (host.includes('unstop.com') || host.includes('dare2compete.com'))
        return path.includes('/api/');
      if (host.includes('devfolio.co'))
        return path.includes('/api/') || path.includes('/graphql');
      if (host.includes('devpost.com'))
        return path.includes('/api/') || path.includes('/details/');
      return false;
    } catch {
      return false;
    }
  }

  function postOnce(url, json) {
    // Strip query params for dedup key — same path = same data
    const key = url.split('?')[0];
    if (posted.has(key)) return;
    posted.add(key);

    try {
      window.postMessage({ type: MSG_TYPE, payload: { url, json } }, '*');
    } catch { /* serialization error */ }
  }

  /* ── fetch patch ─────────────────────────────────────────────── */
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);

    let url = '';
    if (typeof args[0] === 'string') url = args[0];
    else if (args[0] instanceof Request) url = args[0].url;
    else if (args[0]?.url) url = args[0].url;

    if (isInterestingUrl(url)) {
      try {
        const clone = response.clone();
        const ct = clone.headers.get('content-type') || '';
        if (ct.includes('json')) {
          clone.json().then((json) => postOnce(url, json)).catch(() => {});
        }
      } catch { /* never break page */ }
    }
    return response;
  };

  /* ── XHR patch ───────────────────────────────────────────────── */
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__hpt = typeof url === 'string' ? url : String(url);
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isInterestingUrl(this.__hpt)) {
      this.addEventListener('load', function () {
        try {
          const ct = this.getResponseHeader('content-type') || '';
          if (ct.includes('json') && this.responseText) {
            postOnce(this.__hpt, JSON.parse(this.responseText));
          }
        } catch { /* never break page */ }
      });
    }
    return origSend.apply(this, args);
  };

  console.debug('[HPT] Network hook active');
})();
