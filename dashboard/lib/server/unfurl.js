/**
 * Server-side "paste a link → prefilled hackathon". Lets teammates WITHOUT
 * the extension add hackathons from any website. Guarded against SSRF.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { collectFromHtml, extractHackathon } from '../shared/extract.js';

function isPrivate(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function unfurl(rawUrl) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`); } catch { return { error: 'Invalid URL' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Only http(s) links' };
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return { error: 'That host is not allowed' };
  } catch {
    return { error: 'Could not resolve that host', draft: extractHackathon({ url: u.href }) };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(u.href, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HackathonPipelineTracker/1.0; link preview)', Accept: 'text/html' },
    });
    clearTimeout(timer);
    const reader = res.body?.getReader();
    let html = ''; let size = 0;
    const dec = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length; html += dec.decode(value, { stream: true });
      if (size > 1_500_000) { await reader.cancel(); break; }
    }
    const draft = extractHackathon(collectFromHtml(html, u.href));
    return { draft, status: res.status };
  } catch {
    // Many SPA sites block bots — still return what the URL itself tells us
    return { error: 'Could not read the page — fill the details manually', draft: extractHackathon({ url: u.href }) };
  }
}
