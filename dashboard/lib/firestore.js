/**
 * Firestore REST API Client (Dashboard)
 * Mirrors the extension's firebase.js but runs in a browser context.
 */

const PROJECT_ID = 'hackathon-pipeline-tracker';
const API_KEY = 'AIzaSyB1NHPyRV0Lla3T4jy6FYwVF7h6msRKyEo';
const BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** GET a single Firestore document. */
export async function getDoc(collection, docId) {
  const res = await fetch(
    `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`,
  );
  if (!res.ok) return null;
  const doc = await res.json();
  return fromFirestore(doc);
}

/** Deterministic URL → document-ID hash (must match the extension). */
export function urlToDocId(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'evt_' + (h >>> 0).toString(36);
}

/** Resolve a share token → { urls, events } */
export async function resolveShareLink(token) {
  const shareDoc = await getDoc('shareLinks', token);
  if (!shareDoc || !shareDoc.urls) return null;

  if (shareDoc.expiresAt) {
    const expiry = new Date(shareDoc.expiresAt).getTime();
    if (Date.now() > expiry) return null;
  }

  const events = [];
  for (const url of shareDoc.urls) {
    const docId = urlToDocId(url);
    const event = await getDoc('events', docId);
    if (event) events.push(event);
  }

  return { urls: shareDoc.urls, events };
}

/* ── Firestore typed-value converters ────────────────────────────── */

function fromFirestore(doc) {
  if (!doc?.fields) return null;
  const obj = {};
  for (const [key, typed] of Object.entries(doc.fields)) {
    obj[key] = fromValue(typed);
  }
  return obj;
}

function fromValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(fromValue);
  if (v.mapValue) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = fromValue(val);
    return o;
  }
  return null;
}
