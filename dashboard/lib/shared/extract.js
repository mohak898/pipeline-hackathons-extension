/**
 * Generic hackathon extractor — SHARED between server (link unfurl) and the
 * Chrome extension ("Track this page" on ANY website).
 *
 * SOURCE OF TRUTH: dashboard/lib/shared/extract.js
 * (copied to the extension's utils/shared/ by `npm run sync-shared`).
 *
 * Input is a bag of primitives that can be collected either from a live DOM
 * (extension) or from raw HTML (server):
 *   { url, title, metas: {name|property: content}, jsonLd: [string], text }
 *
 * Output is a best-effort hackathon draft. Every field may be null — the UI
 * always lets a human confirm/edit before saving.
 */

import { canonicalKey, detectPlatform, normalizeUrl, toIso } from './canonical.js';

const EVENT_TYPES = ['Event', 'Hackathon', 'SocialEvent', 'BusinessEvent', 'EducationEvent', 'CourseInstance'];

export function extractHackathon(input) {
  const { url = '', title = '', metas = {}, jsonLd = [], text = '' } = input || {};
  const draft = {
    url: normalizeUrl(url),
    key: canonicalKey(url),
    platform: detectPlatform(url),
    name: null,
    description: null,
    image: null,
    startTime: null,
    endTime: null,
    registrationDeadline: null,
    submissionDeadline: null,
    mode: null,
    location: null,
    confidence: {},
  };

  // 1. JSON-LD (most reliable when present)
  for (const raw of jsonLd) {
    let data;
    try { data = JSON.parse(raw); } catch { continue; }
    const ev = findEvent(data);
    if (ev) {
      draft.name = clean(ev.name || ev.headline);
      draft.description = clean(ev.description)?.slice(0, 500) || null;
      draft.startTime = toIso(ev.startDate);
      draft.endTime = toIso(ev.endDate);
      draft.image = pickImage(ev.image);
      const mode = String(ev.eventAttendanceMode || '');
      if (/Online/i.test(mode)) draft.mode = 'online';
      else if (/Offline/i.test(mode)) draft.mode = 'offline';
      else if (/Mixed/i.test(mode)) draft.mode = 'hybrid';
      const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
      if (loc && typeof loc === 'object') {
        const addr = loc.address;
        draft.location = clean(loc.name || (typeof addr === 'string' ? addr : addr?.addressLocality)) || null;
      }
      draft.confidence.jsonld = true;
      break;
    }
  }

  // 2. Meta tags / title
  const m = lowerKeys(metas);
  draft.name = draft.name || clean(m['og:title'] || m['twitter:title']) || cleanTitle(title);
  draft.description = draft.description || clean(m['og:description'] || m.description)?.slice(0, 500) || null;
  draft.image = draft.image || m['og:image'] || m['twitter:image'] || null;
  draft.startTime = draft.startTime || toIso(m['event:start_time'] || m['startdate']);
  draft.endTime = draft.endTime || toIso(m['event:end_time'] || m['enddate']);

  // 3. Keyword-anchored dates in visible text
  const found = findKeywordDates(text);
  draft.registrationDeadline = found.registration || null;
  draft.submissionDeadline = found.submission || null;
  draft.startTime = draft.startTime || found.start || null;
  draft.endTime = draft.endTime || found.end || null;
  if (!draft.mode) {
    if (/\b(hybrid)\b/i.test(text)) draft.mode = 'hybrid';
    else if (/\b(in[- ]person|offline|on[- ]site)\b/i.test(text)) draft.mode = 'offline';
    else if (/\b(online|virtual|remote)\b/i.test(text)) draft.mode = 'online';
  }
  draft.confidence.textDates = Object.keys(found).length;

  draft.looksLikeHackathon = /hack(athon|fest|days?)?\b|buildathon|ideathon|datathon|codefest|devfest/i.test(`${draft.name} ${title} ${draft.description || ''} ${text.slice(0, 3000)}`);
  return draft;
}

function findEvent(data, depth = 0) {
  if (!data || depth > 5) return null;
  if (Array.isArray(data)) {
    for (const d of data) { const r = findEvent(d, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof data !== 'object') return null;
  if (data['@graph']) return findEvent(data['@graph'], depth + 1);
  const t = data['@type'];
  const types = Array.isArray(t) ? t : [t];
  if (types.some((x) => EVENT_TYPES.includes(x)) && (data.name || data.headline) && (data.startDate || data.endDate)) {
    return data;
  }
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object') { const r = findEvent(v, depth + 1); if (r) return r; }
  }
  return null;
}

function pickImage(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return pickImage(img[0]);
  return img.url || null;
}

function lowerKeys(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) out[String(k).toLowerCase()] = v;
  return out;
}

function clean(s) {
  if (s == null) return null;
  const v = String(s).replace(/\s+/g, ' ').trim();
  return v || null;
}

function cleanTitle(t) {
  const v = clean(t);
  if (!v) return null;
  // "ETHIndia 2026 | Devfolio" → "ETHIndia 2026"
  return v.split(/\s+[|·–—-]\s+/)[0].trim() || v;
}

/* ------------------------------------------------------------------ */
/*  Date finding                                                       */
/* ------------------------------------------------------------------ */

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const TIME = '(?:[,\\s]+(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|AM|PM)?)?';

const DATE_PATTERNS = [
  // March 5, 2026 [, 11:59 PM]   |  Mar 5th 2026
  { re: new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})${TIME}`, 'gi'), order: 'mdy' },
  // 5 March 2026 | 5th Mar, 2026
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?,?\\s+(\\d{4})${TIME}`, 'gi'), order: 'dmy' },
  // 2026-03-05[T| ]11:59
  { re: /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/g, order: 'iso' },
  // March 5 (no year) — assume next occurrence
  { re: new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!,?\\s*\\d{4})${TIME}`, 'gi'), order: 'md' },
];

const KEYWORDS = {
  registration: /(registrations?|register|sign[- ]?ups?|applications?|apply)\b[^.\n]{0,40}?\b(close|closes|closing|ends?|deadline|due|last date|till|until|by|before)|\b(last date|deadline)\b[^.\n]{0,25}(registration|register|apply|application)/i,
  submission: /(submissions?|submit|project|final round|prototype|ppt)\b[^.\n]{0,40}?\b(close|closes|closing|ends?|deadline|due|by|till|until)|\bsubmission deadline\b/i,
  start: /\b(starts?|begins?|kick[- ]?off|opens?|hacking starts|event starts|commences?|start date)\b/i,
  end: /\b(ends?|closing ceremony|hacking ends|event ends|end date|concludes?)\b/i,
};

export function findDates(text, now = new Date()) {
  const out = [];
  const src = String(text || '');
  for (const { re, order } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const d = buildDate(m, order, now);
      if (d) out.push({ index: m.index, length: m[0].length, iso: d.toISOString() });
    }
  }
  // De-overlap: keep the longest match at any position
  out.sort((a, b) => a.index - b.index || b.length - a.length);
  const res = [];
  let end = -1;
  for (const d of out) {
    if (d.index >= end) { res.push(d); end = d.index + d.length; }
  }
  return res;
}

function buildDate(m, order, now) {
  let y; let mo; let d; let h = null; let mi = 0; let ap = null;
  if (order === 'mdy') { mo = MONTHS[m[1].toLowerCase().replace('.', '')]; d = +m[2]; y = +m[3]; h = m[4]; mi = m[5]; ap = m[6]; }
  else if (order === 'dmy') { d = +m[1]; mo = MONTHS[m[2].toLowerCase().replace('.', '')]; y = +m[3]; h = m[4]; mi = m[5]; ap = m[6]; }
  else if (order === 'iso') { y = +m[1]; mo = +m[2] - 1; d = +m[3]; h = m[4]; mi = m[5]; }
  else if (order === 'md') {
    mo = MONTHS[m[1].toLowerCase().replace('.', '')]; d = +m[2]; h = m[3]; mi = m[4]; ap = m[5];
    y = now.getFullYear();
    const tentative = new Date(y, mo, d);
    if (tentative.getTime() < now.getTime() - 60 * 86400000) y += 1;
  }
  if (mo == null || Number.isNaN(mo) || !d || d > 31 || !y || y < 2000 || y > 2100) return null;
  let hour = h != null && h !== undefined && h !== '' ? +h : 23;
  let minute = mi != null && mi !== undefined && mi !== '' ? +mi : (h != null && h !== '' ? 0 : 59);
  if (ap) {
    const p = ap.toLowerCase();
    if (p === 'pm' && hour < 12) hour += 12;
    if (p === 'am' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) { hour = 23; minute = 59; }
  const date = new Date(y, mo, d, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Look at the ~90 characters before each date for a keyword that tells us
 * what the date means. First match per category wins.
 */
export function findKeywordDates(text, now = new Date()) {
  const src = String(text || '').slice(0, 60000);
  const dates = findDates(src, now);
  const result = {};
  for (const d of dates) {
    const ctx = src.slice(Math.max(0, d.index - 90), d.index);
    // Prefer the keyword closest to the date: test the last line/sentence first
    const near = ctx.split(/[\n.]/).slice(-2).join(' ');
    for (const cat of ['registration', 'submission', 'start', 'end']) {
      if (result[cat]) continue;
      if (KEYWORDS[cat].test(near)) { result[cat] = d.iso; break; }
    }
  }
  // Date ranges like "March 5 - March 7, 2026" without keywords
  if (!result.start && !result.end && dates.length >= 2) {
    const a = dates[0]; const b = dates[1];
    const between = src.slice(a.index + a.length, b.index);
    if (/^\s*(-|–|—|to|till|until)\s*$/i.test(between)) {
      result.start = a.iso;
      result.end = b.iso;
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Raw-HTML collector (server side, no DOM available)                 */
/* ------------------------------------------------------------------ */

export function collectFromHtml(html, url) {
  const src = String(html || '');
  const title = decodeEntities((src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const metas = {};
  const metaRe = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(src)) !== null) {
    const tag = m[0];
    const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && content != null && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = decodeEntities(content);
  }
  const jsonLd = [];
  const ldRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(src)) !== null) jsonLd.push(m[1]);
  const text = decodeEntities(
    src
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n'),
  ).slice(0, 60000);
  return { url, title, metas, jsonLd, text };
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
