/**
 * Firebase / Firestore REST API Client
 * --------------------------------------
 * MV3-compatible — uses raw fetch() against the Firestore REST API.
 * No Firebase SDK, no bundler, no IndexedDB dependency.
 *
 * Collections:
 *   events      — cached hackathon data (keyed by URL hash)
 *   shareLinks  — read-only share tokens (keyed by random token)
 */

/* ================================================================== */
/*  CONFIG                                                            */
/* ================================================================== */

const PROJECT_ID = 'hackathon-pipeline-tracker';
const API_KEY = 'AIzaSyB1NHPyRV0Lla3T4jy6FYwVF7h6msRKyEo';

const BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* ================================================================== */
/*  DOCUMENT I/O                                                      */
/* ================================================================== */

/**
 * GET a single document.
 * @param {string} collection
 * @param {string} docId
 * @returns {Promise<Object|null>} — parsed JS object, or null if not found
 */
export async function getDoc(collection, docId) {
  try {
    const res = await fetch(
      `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`,
    );
    if (!res.ok) return null;
    const doc = await res.json();
    return fromFirestore(doc);
  } catch {
    return null;
  }
}

/**
 * SET (upsert) a document.
 * @param {string} collection
 * @param {string} docId
 * @param {Object} data — plain JS object
 * @returns {Promise<boolean>}
 */
export async function setDoc(collection, docId, data) {
  try {
    const res = await fetch(
      `${BASE_URL}/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestore(data)),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * CREATE a document with an auto-generated ID.
 * @param {string} collection
 * @param {Object} data
 * @returns {Promise<string|null>} — the generated document ID, or null
 */
export async function addDoc(collection, data) {
  try {
    const res = await fetch(
      `${BASE_URL}/${collection}?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestore(data)),
      },
    );
    if (!res.ok) return null;
    const doc = await res.json();
    // doc.name = "projects/.../documents/collection/docId"
    const parts = doc.name.split('/');
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

/**
 * Run a structured query against a collection.
 * @param {string} collection
 * @param {string} field — field to filter on
 * @param {string} op — e.g. 'EQUAL'
 * @param {*} value — the value to compare
 * @returns {Promise<Object[]>}
 */
export async function queryDocs(collection, field, op, value) {
  try {
    const res = await fetch(
      `${BASE_URL}:runQuery?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            where: {
              fieldFilter: {
                field: { fieldPath: field },
                op,
                value: toFirestoreValue(value),
              },
            },
            limit: 10,
          },
        }),
      },
    );
    if (!res.ok) return [];
    const results = await res.json();
    return results
      .filter((r) => r.document)
      .map((r) => fromFirestore(r.document));
  } catch {
    return [];
  }
}

/* ================================================================== */
/*  ID GENERATION                                                     */
/* ================================================================== */

/**
 * Deterministic document ID from a URL (FNV-1a hash).
 * Same URL → same ID → enables cache lookups.
 */
export function urlToDocId(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'evt_' + (h >>> 0).toString(36);
}

/**
 * Generate a cryptographically random share token (12 chars, URL-safe).
 */
export function generateToken() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

/**
 * Compute the TTL expiry timestamp: endTime + 48 hours.
 */
export function computeExpiresAt(endTimeIso) {
  const end = new Date(endTimeIso);
  if (isNaN(end.getTime())) return new Date(Date.now() + 48 * 3600_000).toISOString();
  return new Date(end.getTime() + 48 * 3600_000).toISOString();
}

/* ================================================================== */
/*  FIRESTORE ↔ JS CONVERSION                                        */
/* ================================================================== */

/** Convert a plain JS object → Firestore REST document. */
function toFirestore(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return { fields };
}

/** Convert a single JS value → Firestore typed value. */
function toFirestoreValue(value) {
  if (typeof value === 'string') {
    // Treat ISO timestamp fields as timestampValue
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !isNaN(new Date(value).getTime())) {
      return { timestampValue: value };
    }
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => toFirestoreValue(v)),
      },
    };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

/** Convert a Firestore REST document → plain JS object. */
function fromFirestore(doc) {
  if (!doc?.fields) return null;
  const obj = {};
  for (const [key, typed] of Object.entries(doc.fields)) {
    obj[key] = fromFirestoreValue(typed);
  }
  // Attach the document ID
  if (doc.name) {
    const parts = doc.name.split('/');
    obj._docId = parts[parts.length - 1];
  }
  return obj;
}

/** Convert a Firestore typed value → JS value. */
function fromFirestoreValue(typed) {
  if (typed.stringValue !== undefined) return typed.stringValue;
  if (typed.integerValue !== undefined) return Number(typed.integerValue);
  if (typed.doubleValue !== undefined) return typed.doubleValue;
  if (typed.booleanValue !== undefined) return typed.booleanValue;
  if (typed.timestampValue !== undefined) return typed.timestampValue;
  if (typed.nullValue !== undefined) return null;
  if (typed.arrayValue) {
    return (typed.arrayValue.values || []).map(fromFirestoreValue);
  }
  if (typed.mapValue) {
    const obj = {};
    for (const [k, v] of Object.entries(typed.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}
