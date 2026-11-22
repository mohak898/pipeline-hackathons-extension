/**
 * Network Rules — platform response parsers (passive-only, v1.0)
 * ---------------------------------------------------------------
 * Turns JSON that a platform's own frontend downloaded into a hackathon
 * draft. The extension never calls these APIs itself.
 *
 * Why the rewrite: v0.5 returned the FIRST object with a name + date. On a
 * detail page that is often a "related/recommended hackathons" response, so
 * the wrong event got saved under the page URL. Now every candidate object
 * is scored against the page's canonical id / slug and we only accept a
 * confident match.
 */

import { canonicalKey, detectPlatform as detectAny, nameTokens, slugHint, toIso } from '../utils/shared/canonical.js';

const FIELDS = {
  devfolio: {
    name: ['name', 'title', 'hackathon_name'],
    slug: ['slug', 'subdomain'],
    start: ['starts_at', 'start_date', 'startDate', 'start_time'],
    end: ['ends_at', 'end_date', 'endDate', 'end_time'],
    regEnd: ['reg_ends_at', 'application_deadline', 'applications_close_at', 'registration_deadline'],
    subEnd: ['submission_deadline', 'submissions_close_at', 'project_submission_deadline'],
    nested: ['hackathon_setting', 'settings', 'hackathon_settings'],
  },
  devpost: {
    name: ['title', 'name'],
    slug: ['url', 'slug', 'subdomain'],
    start: ['start_date', 'startDate', 'start_at', 'open_date', 'submission_period_start'],
    end: ['end_date', 'endDate', 'end_at', 'close_date', 'submission_period_end'],
    regEnd: ['registration_deadline'],
    subEnd: ['submission_deadline', 'submission_end_date', 'deadline'],
    nested: [],
  },
  unstop: {
    name: ['title', 'name', 'opportunity_title', 'competition_title', 'event_name', 'hackathon_name', 'heading'],
    slug: ['public_url', 'seo_url', 'slug', 'url', 'id'],
    start: ['start_date', 'startDate', 'start_time', 'festival_start_date', 'competition_start_date', 'event_start_date'],
    end: ['end_date', 'endDate', 'end_time', 'festival_end_date', 'competition_end_date', 'event_end_date'],
    regEnd: ['end_regn_dt', 'regn_end_date', 'registration_end_time', 'registrationEndTime', 'last_date_of_registration'],
    subEnd: ['submission_deadline', 'deadline'],
    nested: ['regnRequirements', 'regn_requirements', 'dates', 'timeline'],
  },
};

export function detectPlatform(url) {
  const p = detectAny(url);
  return FIELDS[p] ? p : null;
}

function first(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '' && typeof v !== 'object') return v;
  }
  return null;
}

function firstWithNested(obj, keys, nested) {
  const direct = first(obj, keys);
  if (direct != null) return direct;
  for (const n of nested) {
    const v = first(obj?.[n], keys);
    if (v != null) return v;
  }
  return null;
}

/** Collect every plain object (depth ≤ 6, max 800) that has a name-like key. */
function gatherCandidates(json, nameKeys) {
  const out = [];
  const seen = new Set();
  (function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 6 || out.length > 800 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (typeof first(node, nameKeys) === 'string') out.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, depth + 1);
  })(json, 0);
  return out;
}

/** "Oct 03 - Nov 25, 2025" / "Oct 03 - 25, 2025" → { start, end } (Devpost). */
export function parseDevpostRange(s) {
  if (typeof s !== 'string') return {};
  const m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?\s*[-–]\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2}),\s*(\d{4})/);
  if (!m) return {};
  const [, m1, d1, y1, m2, d2, y2] = m;
  const start = new Date(`${m1} ${d1}, ${y1 || y2} 00:00`);
  const end = new Date(`${m2 || m1} ${d2}, ${y2} 23:59`);
  return {
    start: Number.isNaN(start.getTime()) ? null : start.toISOString(),
    end: Number.isNaN(end.getTime()) ? null : end.toISOString(),
  };
}

function score(obj, f, pageKey, hint) {
  let s = 0;
  const keyId = pageKey ? pageKey.split(':')[1] : null;
  const slugVals = f.slug.map((k) => obj[k]).filter((v) => v != null && typeof v !== 'object').map((v) => String(v).toLowerCase());
  if (keyId && slugVals.some((v) => v === keyId || v.endsWith(`-${keyId}`) || v.includes(`/${keyId}`) || v.includes(`${keyId}.`) || v.includes(`-${keyId}/`))) s += 10;
  if (hint) {
    const hintTokens = new Set(hint.split(/[^a-z0-9]+/).filter(Boolean));
    const compactHint = hint.replace(/[^a-z0-9]/g, '');
    const name = String(first(obj, f.name) || '');
    const compactName = nameTokens(name).join('');
    if (compactName && (compactHint === compactName || compactHint.startsWith(compactName) || compactName.startsWith(compactHint))) s += 6;
    const overlap = nameTokens(name).filter((t) => hintTokens.has(t)).length;
    s += Math.min(overlap, 4);
  }
  return s;
}

function toDraft(obj, f, platform, pageUrl) {
  let start = toIso(firstWithNested(obj, f.start, f.nested));
  let end = toIso(firstWithNested(obj, f.end, f.nested));
  let sub = toIso(firstWithNested(obj, f.subEnd, f.nested));
  const reg = toIso(firstWithNested(obj, f.regEnd, f.nested));
  if (platform === 'devpost' && obj.submission_period_dates) {
    const r = parseDevpostRange(obj.submission_period_dates);
    start = start || r.start;
    sub = sub || r.end;
    end = end || r.end;
  }
  const loc = obj.displayed_location?.location || obj.location || obj.city || obj.address_with_country_logo?.city || null;
  let mode = null;
  if (obj.is_online === true || /online/i.test(String(obj.region || obj.mode || ''))) mode = 'online';
  else if (obj.is_online === false || /offline/i.test(String(obj.region || obj.mode || ''))) mode = 'offline';
  return {
    name: String(first(obj, f.name)).trim(),
    url: pageUrl,
    platform,
    source: 'network',
    startTime: start,
    endTime: end || sub,
    registrationDeadline: reg,
    submissionDeadline: sub,
    mode,
    location: typeof loc === 'string' ? loc.slice(0, 120) : null,
    description: typeof (obj.tagline || obj.short_description) === 'string' ? (obj.tagline || obj.short_description).slice(0, 500) : null,
    image: typeof (obj.cover_img || obj.thumbnail_url || obj.banner_mobile?.image_url) === 'string'
      ? (obj.cover_img || obj.thumbnail_url || obj.banner_mobile?.image_url) : null,
  };
}

/**
 * @returns {object|null} hackathon draft, or null when the response is not
 *   confidently about THIS page's hackathon.
 */
export function parseApiResponse(platformKey, json, pageUrl) {
  const f = FIELDS[platformKey];
  if (!f || !json || typeof json !== 'object') return null;
  const pageKey = canonicalKey(pageUrl);
  if (!pageKey) return null; // listing/search/profile page — never save
  const hint = slugHint(pageUrl);
  try {
    const cands = gatherCandidates(json, f.name)
      .map((o) => ({ o, d: toDraft(o, f, platformKey, pageUrl) }))
      .filter(({ d }) => d.name && (d.startTime || d.endTime || d.registrationDeadline));
    if (!cands.length) return null;
    const ranked = cands.map((c) => ({ ...c, s: score(c.o, f, pageKey, hint) })).sort((a, b) => b.s - a.s);
    const best = ranked[0];
    if (best.s <= 0) return null; // nothing matches this page's slug/id
    if (ranked[1] && ranked[1].s === best.s && ranked[1].d.name !== best.d.name) return null; // ambiguous
    return best.d;
  } catch (err) {
    console.debug(`[HPT] parse error (${platformKey})`, err);
    return null;
  }
}
