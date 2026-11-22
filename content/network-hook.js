/**
 * Network Hook — MAIN-world script (v3)
 * --------------------------------------
 * Wraps fetch/XHR so we can read the JSON the platform's own frontend is
 * already downloading (purely passive — we never make requests ourselves).
 *
 * Each interesting API response is posted ONCE per (page URL, API path), and
 * the dedupe set resets whenever the SPA navigates to a new page.
 */
(function () {
  'use strict';
  if (window.__HPT_HOOKED__) return;
  window.__HPT_HOOKED__ = true;

  const MSG_TYPE = '__HPT_NETWORK_INTERCEPT__';
  let pageKey = location.origin + location.pathname;
  let posted = new Set();

  function isInterestingUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      const u = new URL(url, window.location.origin);
      const host = u.hostname;
      const path = u.pathname;
      if (host.includes('unstop.com') || host.includes('dare2compete.com')) return path.includes('/api/');
      if (host.includes('devfolio.co')) return path.includes('/api/') || path.includes('/graphql');
      if (host.includes('devpost.com')) return path.includes('/api/') || path.includes('/details/');
      return false;
    } catch {
      return false;
    }
  }

  function postOnce(url, json) {
    const here = location.origin + location.pathname;
    if (here !== pageKey) { pageKey = here; posted = new Set(); }
    const key = String(url).split('?')[0];
    if (posted.has(key)) return;
    posted.add(key);
    try {
      window.postMessage({ type: MSG_TYPE, payload: { url: String(url), pageUrl: location.href, json } }, location.origin);
    } catch { /* non-cloneable payload */ }
  }

  /* ── fetch ─────────────────────────────────────────────────────── */
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      let url = '';
      if (typeof args[0] === 'string') url = args[0];
      else if (args[0] instanceof Request) url = args[0].url;
      else if (args[0] && args[0].url) url = args[0].url;
      else if (args[0] instanceof URL) url = args[0].href;
      if (isInterestingUrl(url)) {
        const clone = response.clone();
        const ct = clone.headers.get('content-type') || '';
        if (ct.includes('json')) clone.json().then((json) => postOnce(url, json)).catch(() => {});
      }
    } catch { /* never break the page */ }
    return response;
  };

  /* ── XHR ───────────────────────────────────────────────────────── */
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
          if (!ct.includes('json')) return;
          const json = this.responseType === 'json' ? this.response
            : (this.responseType === '' || this.responseType === 'text') && this.responseText ? JSON.parse(this.responseText) : null;
          if (json) postOnce(this.__hpt, json);
        } catch { /* never break the page */ }
      });
    }
    return origSend.apply(this, args);
  };
})();
