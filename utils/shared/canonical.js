/**
 * Canonical identity for hackathons — SHARED between the dashboard server
 * and the Chrome extension.
 *
 * SOURCE OF TRUTH: dashboard/lib/shared/canonical.js
 * The extension keeps a byte-identical copy at utils/shared/canonical.js
 * (run `npm run sync-shared` inside dashboard/ after editing; the test
 * suite fails if the copies drift).
 *
 * Why this exists: the old tracker keyed records by a hash of the raw page
 * URL, so `?ref=x`, trailing slashes, sub-pages (/prizes, /schedule) and the
 * two URL styles Devfolio uses all produced separate records. Here every
 * hackathon gets:
 *   - `key`          a stable canonical id derived from the URL
 *                    (e.g. `devfolio:ethindia`, `unstop:1234567`)
 *   - `fingerprint`  a name+date signature used to merge the SAME hackathon
 *                    seen on different URLs/platforms.
 */

const SUBPAGE_SUFFIXES = [
  'overview', 'about', 'details', 'prizes', 'prize', 'rules', 'schedule',
  'timeline', 'faq', 'faqs', 'judges', 'sponsors', 'partners', 'tracks',
  'register', 'registration', 'apply', 'application', 'resources', 'updates',
  'discussions', 'participants', 'project-gallery', 'submissions', 'submit',
  'dashboard', 'teams', 'team', 'leaderboard', 'results', 'winners', 'info',
];

const DEVFOLIO_RESERVED = new Set(['www', 'api', 'org', 'blog', 'docs', 'assets', 'static', 'cdn', 'guide']);
const DEVPOST_RESERVED = new Set(['www', 'api', 'secure', 'help', 'info', 'post', 'blog', 'challengepost']);

/** Lower-case host without `www.`. */
function cleanHost(u) {
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

function pathParts(u) {
  return u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponentSafe(p).toLowerCase());
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function detectPlatform(url) {
  const u = toUrl(url);
  if (!u) return 'web';
  const host = cleanHost(u);
  if (host === 'devfolio.co' || host.endsWith('.devfolio.co')) return 'devfolio';
  if (host === 'devpost.com' || host.endsWith('.devpost.com')) return 'devpost';
  if (host === 'unstop.com' || host.endsWith('.unstop.com') || host.endsWith('dare2compete.com')) return 'unstop';
  if (host === 'mlh.io' || host.endsWith('.mlh.io')) return 'mlh';
  if (host.endsWith('hackerearth.com')) return 'hackerearth';
  if (host.endsWith('hack2skill.com')) return 'hack2skill';
  if (host === 'lu.ma' || host === 'luma.com') return 'luma';
  if (host.endsWith('dorahacks.io')) return 'dorahacks';
  if (host.endsWith('ethglobal.com')) return 'ethglobal';
  return 'web';
}

function toUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const withScheme = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/**
 * Normalise a URL for display / storage: https, no `www.`, no query, no hash,
 * no trailing slash.
 */
export function normalizeUrl(url) {
  const u = toUrl(url);
  if (!u) return (url || '').trim();
  const path = u.pathname.replace(/\/+$/, '');
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  const scheme = local ? u.protocol.replace(':', '') : 'https';
  const port = u.port && local ? `:${u.port}` : '';
  return `${scheme}://${cleanHost(u)}${port}${path}`;
}

/**
 * Canonical key for a hackathon URL, or `null` when the URL is clearly NOT a
 * single hackathon (search/listing pages, project pages, home pages).
 *
 * @param {string} url
 * @returns {string|null}
 */
export function canonicalKey(url) {
  const u = toUrl(url);
  if (!u) return null;
  const host = cleanHost(u);
  const parts = pathParts(u);
  const platform = detectPlatform(url);

  if (platform === 'devfolio') {
    // https://<slug>.devfolio.co/...  → devfolio:<slug>
    const sub = host.replace(/\.devfolio\.co$/, '');
    if (sub !== host && sub && !DEVFOLIO_RESERVED.has(sub) && !sub.includes('.')) {
      return `devfolio:${sub}`;
    }
    // https://devfolio.co/hackathons/<slug>  (but not /hackathons alone)
    if (parts[0] === 'hackathons' && parts[1] && !['open', 'upcoming', 'past', 'ongoing', 'applied'].includes(parts[1])) {
      return `devfolio:${parts[1]}`;
    }
    return null;
  }

  if (platform === 'devpost') {
    const sub = host.replace(/\.devpost\.com$/, '');
    if (sub !== host && sub && !DEVPOST_RESERVED.has(sub) && !sub.includes('.')) {
      return `devpost:${sub}`;
    }
    return null; // devpost.com/hackathons, /software/... (projects), profiles
  }

  if (platform === 'unstop') {
    // /hackathons/<slug>-<id>, /competitions/<slug>-<id>, /o/<slug>-<id>,
    // /p/<slug>-<id>, /<type>/<slug>-<id>/register …
    for (const p of parts) {
      const m = p.match(/-(\d{5,})$/) || p.match(/^(\d{5,})$/);
      if (m) return `unstop:${m[1]}`;
    }
    return null;
  }

  if (platform === 'mlh') {
    return null; // mlh.io lists events that live on their own sites
  }

  if (platform === 'luma') {
    if (parts.length === 1 && !['discover', 'home', 'calendar', 'signin', 'create'].includes(parts[0])) {
      return `luma:${parts[0]}`;
    }
    return null;
  }

  if (platform === 'dorahacks') {
    const i = parts.indexOf('hackathon');
    if (i !== -1 && parts[i + 1]) return `dorahacks:${parts[i + 1]}`;
    return null;
  }

  if (platform === 'ethglobal') {
    if (parts[0] === 'events' && parts[1]) return `ethglobal:${parts[1]}`;
    return null;
  }

  if (platform === 'hack2skill' || platform === 'hackerearth') {
    // keep first two meaningful segments, drop sub-pages
    const trimmed = stripSubpages(parts);
    if (trimmed.length === 0) return null;
    return `${platform}:${trimmed.slice(0, 3).join('/')}`;
  }

  // Generic website (hackathon with its own domain): host + path minus
  // known sub-pages, so example.com/hack and example.com/hack/prizes merge.
  const trimmed = stripSubpages(parts);
  return `web:${host}${trimmed.length ? '/' + trimmed.join('/') : ''}`;
}

function stripSubpages(parts) {
  const out = [...parts];
  while (out.length && (SUBPAGE_SUFFIXES.includes(out[out.length - 1]) || /^(index|home)(\.html?)?$/.test(out[out.length - 1]))) {
    out.pop();
  }
  return out;
}

/**
 * Slug hint from the URL — used by parsers to pick the right object out of
 * an API response that contains several hackathons.
 */
export function slugHint(url) {
  const key = canonicalKey(url);
  if (!key) return null;
  const v = key.split(':')[1] || '';
  return v.replace(/-\d{5,}$/, '').split('/').pop() || null;
}

const NAME_STOPWORDS = new Set([
  'hackathon', 'hack', 'hacks', 'the', 'edition', 'season', 'online', 'offline',
  'virtual', 'presents', 'by', 'and', 'of', 'a', 'an', 'in', 'on', 'for', 'at',
  '2023', '2024', '2025', '2026', '2027', '2028', '24h', '36h', '48h',
]);

/** Normalised name tokens: lowercase, ascii-folded, no punctuation/stopwords. */
export function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !NAME_STOPWORDS.has(t));
}

export function normalizeName(name) {
  return nameTokens(name).join(' ');
}

/** Jaccard similarity of name tokens (0..1). */
export function nameSimilarity(a, b) {
  const A = new Set(nameTokens(a));
  const B = new Set(nameTokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** The most meaningful deadline of a hackathon record (ISO string or null). */
export function primaryDeadline(h) {
  return h?.submissionDeadline || h?.endTime || h?.registrationDeadline || h?.startTime || null;
}

function dayDiff(a, b) {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (Number.isNaN(x) || Number.isNaN(y)) return Infinity;
  return Math.abs(x - y) / 86400000;
}

/**
 * Decide whether two hackathon records describe the same event.
 * Order of evidence: identical canonical key → near-identical name with
 * compatible dates → very similar name with matching deadline day.
 */
export function isSameHackathon(a, b) {
  if (!a || !b) return false;
  const ka = a.key || canonicalKey(a.url);
  const kb = b.key || canonicalKey(b.url);
  if (ka && kb && ka === kb) return true;
  if (ka && kb && ka.split(':')[0] === kb.split(':')[0] && ka.split(':')[0] !== 'web') {
    // Same platform, different canonical ids → different events
    return false;
  }

  const sim = nameSimilarity(a.name, b.name);
  if (sim === 0) return false;

  const da = primaryDeadline(a);
  const db = primaryDeadline(b);
  const datesKnown = da && db;
  const close = datesKnown ? dayDiff(da, db) <= 3 : true;

  if (sim === 1 && close) return true;
  if (sim >= 0.75 && datesKnown && dayDiff(da, db) <= 1) return true;
  return false;
}

/**
 * Merge an incoming capture into an existing record without clobbering
 * anything a human edited (`existing.userEdited` lists such fields) and
 * without replacing known values with empty ones.
 */
export function mergeHackathon(existing, incoming) {
  const locked = new Set(existing.userEdited || []);
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === '') continue;
    if (locked.has(k)) continue;
    if (['id', 'workspaceId', 'createdAt', 'createdBy', 'stage', 'registrations', 'userEdited', 'url', 'key'].includes(k)) continue;
    out[k] = v;
  }
  // Keep the alternate URLs so the record can be found from any of them
  const urls = new Set([...(existing.altUrls || []), existing.url, incoming.url].filter(Boolean).map(normalizeUrl));
  urls.delete(normalizeUrl(out.url));
  out.altUrls = [...urls].slice(0, 10);
  return out;
}

/**
 * Coerce whatever a platform/API gives us into an ISO string, or null.
 * Accepts ISO strings, `YYYY-MM-DD HH:mm:ss`, unix seconds/ms.
 */
export function toIso(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) {
    const n = Number(value);
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    let s = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) return d.toISOString();
  }
  return null;
}
