/**
 * Self-contained function injected with chrome.scripting.executeScript.
 * It must not reference anything outside its own body.
 */
export function collectPagePrimitives() {
  const metas = {};
  document.querySelectorAll('meta[content]').forEach((m) => {
    const k = (m.getAttribute('property') || m.getAttribute('name') || m.getAttribute('itemprop') || '').toLowerCase();
    if (k && !(k in metas)) metas[k] = m.getAttribute('content');
  });
  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent || '');
  const text = (document.body ? document.body.innerText : '').slice(0, 60000);
  return { url: location.href, title: document.title, metas, jsonLd, text };
}
