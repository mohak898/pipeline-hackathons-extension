/**
 * Network Rules — Platform Response Parsers (Passive-Only)
 * ---------------------------------------------------------
 * Contains ONLY parsers and detection logic. No API URL patterns or
 * proactive fetch constructors — the extension never calls fetch()
 * to any hackathon platform.
 *
 * Parsers are *greedy*: they try many possible field names because
 * these internal APIs are undocumented and may change.
 */

/* ================================================================== */
/*  DEVFOLIO                                                          */
/* ================================================================== */
const devfolio = {
  name: 'Devfolio',

  parseResponse(json, pageUrl) {
    const candidates = gatherCandidates(json);

    for (const h of candidates) {
      const name = first(h, 'name', 'title', 'hackathon_name');
      const startTime = first(h, 'starts_at', 'start_date', 'startDate', 'start_time');
      const endTime = first(
        h,
        'ends_at', 'end_date', 'endDate', 'end_time',
        'submission_deadline', 'deadline',
      );
      if (name && startTime && endTime) {
        return mkEvent(name, startTime, endTime, pageUrl, 'devfolio');
      }
    }
    return null;
  },
};

/* ================================================================== */
/*  DEVPOST                                                           */
/* ================================================================== */
const devpost = {
  name: 'Devpost',

  parseResponse(json, pageUrl) {
    const candidates = gatherCandidates(json);

    for (const h of candidates) {
      const name = first(h, 'title', 'name');
      const spd = h.submission_period_dates ?? {};
      const startTime = first(h, 'start_date', 'startDate', 'start_at', 'open_date') || spd.start;
      const endTime = first(
        h, 'end_date', 'endDate', 'end_at', 'submission_end_date', 'close_date',
      ) || spd.end;

      if (name && startTime && endTime) {
        return mkEvent(name, startTime, endTime, pageUrl, 'devpost');
      }
    }
    return null;
  },
};

/* ================================================================== */
/*  UNSTOP  (ultra-greedy — their API shapes vary a lot)              */
/* ================================================================== */
const unstop = {
  name: 'Unstop',

  parseResponse(json, pageUrl) {
    const candidates = gatherCandidates(json);

    for (const o of candidates) {
      const name = first(
        o,
        'title', 'name', 'opportunity_title', 'competition_title',
        'event_name', 'hackathon_name', 'heading',
      );

      const startTime = firstDate(o,
        'start_date', 'start', 'startDate', 'start_time',
        'registrationStartTime', 'registration_start_time',
        'regn_start_date', 'start_regn_dt',
        'festival_start_date', 'competition_start_date',
        'event_start', 'event_start_date',
      ) || deepDate(o, 'regnRequirements', 'start_regn_dt')
        || deepDate(o, 'regn_requirements', 'start_regn_dt')
        || deepDate(o, 'dates', 'start')
        || deepDate(o, 'timeline', 'start');

      const endTime = firstDate(o,
        'end_date', 'end', 'endDate', 'end_time',
        'registrationEndTime', 'registration_end_time',
        'regn_end_date', 'end_regn_dt',
        'festival_end_date', 'competition_end_date',
        'event_end', 'event_end_date',
        'deadline', 'submission_deadline',
        'last_date_of_registration',
      ) || deepDate(o, 'regnRequirements', 'end_regn_dt')
        || deepDate(o, 'regn_requirements', 'end_regn_dt')
        || deepDate(o, 'dates', 'end')
        || deepDate(o, 'timeline', 'end');

      if (name && (startTime || endTime)) {
        return mkEvent(name, startTime, endTime || startTime, pageUrl, 'unstop');
      }
    }

    // Last resort: deep-scan for any sub-object with name + date
    const deep = deepScan(json);
    if (deep) {
      return { ...deep, url: pageUrl, source: 'network', platform: 'unstop' };
    }

    return null;
  },
};

/* ================================================================== */
/*  REGISTRY & EXPORTS                                                */
/* ================================================================== */
export const PLATFORMS = { devfolio, devpost, unstop };

export function detectPlatform(url) {
  if (!url) return null;
  if (url.includes('devfolio.co')) return 'devfolio';
  if (url.includes('devpost.com')) return 'devpost';
  if (url.includes('unstop.com') || url.includes('dare2compete.com'))
    return 'unstop';
  return null;
}

export function parseApiResponse(platformKey, json, pageUrl) {
  const platform = PLATFORMS[platformKey];
  if (!platform) return null;
  try {
    return platform.parseResponse(json, pageUrl);
  } catch (err) {
    console.debug(`[HPT] Parse error (${platformKey}):`, err);
    return null;
  }
}

/* ================================================================== */
/*  SHARED HELPERS                                                    */
/* ================================================================== */

function first(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return null;
}

function firstDate(obj, ...keys) {
  const raw = first(obj, ...keys);
  return raw ? normalizeTimestamp(raw) : null;
}

function deepDate(obj, wrapper, key) {
  const w = obj?.[wrapper];
  if (w && typeof w === 'object' && w[key] != null) {
    return normalizeTimestamp(w[key]);
  }
  return null;
}

function mkEvent(name, startTime, endTime, pageUrl, platform) {
  return {
    name: String(name),
    startTime: normalizeTimestamp(startTime),
    endTime: normalizeTimestamp(endTime),
    url: pageUrl,
    source: 'network',
    platform,
  };
}

function gatherCandidates(json) {
  const seen = new Set();
  const result = [];

  function add(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    result.push(obj);
  }

  add(json);
  add(json?.data);
  add(json?.data?.data);
  add(json?.result);
  add(json?.result?.data);
  add(json?.opportunity);
  add(json?.data?.opportunity);
  add(json?.hackathon);
  add(json?.data?.hackathon);

  if (Array.isArray(json?.data?.data)) {
    json.data.data.forEach((item) => add(item));
  }
  if (Array.isArray(json?.data)) {
    json.data.forEach((item) => add(item));
  }

  return result;
}

function deepScan(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = deepScan(item, depth + 1);
      if (r) return r;
    }
    return null;
  }

  const nameKeys = ['title', 'name', 'opportunity_title', 'heading'];
  const endKeys = [
    'end_date', 'endDate', 'deadline', 'end_regn_dt',
    'submission_deadline', 'last_date_of_registration',
  ];

  const name = first(obj, ...nameKeys);
  const end = first(obj, ...endKeys);

  if (name && end && typeof name === 'string' && name.length > 3) {
    const startKeys = ['start_date', 'startDate', 'start_regn_dt', 'start'];
    const start = first(obj, ...startKeys);
    return {
      name: String(name),
      startTime: start ? normalizeTimestamp(start) : normalizeTimestamp(end),
      endTime: normalizeTimestamp(end),
    };
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object') {
      const r = deepScan(obj[key], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return String(value);
}
