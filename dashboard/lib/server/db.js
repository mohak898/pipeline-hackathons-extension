/**
 * Storage adapter — a tiny document store with two backends.
 *
 *   STORAGE=file       (default) JSON file at $DATA_DIR/db.json. Zero setup;
 *                      perfect for local dev, a VPS, Docker or Railway with a
 *                      volume. NOT for Vercel (ephemeral filesystem).
 *   STORAGE=firestore  Firestore through firebase-admin (server-side only).
 *                      Needs FIREBASE_SERVICE_ACCOUNT (JSON string) or
 *                      GOOGLE_APPLICATION_CREDENTIALS. Lock the database down
 *                      with `firestore.rules` (deny all client access).
 *
 * Interface (all async):
 *   get(coll, id)              → doc | null
 *   put(coll, doc)             → doc        (doc.id required, full upsert)
 *   patch(coll, id, partial)   → doc | null (shallow merge)
 *   del(coll, id)
 *   find(coll, where = {})     → doc[]      (equality filters only)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

let instance = null;

export function getDb() {
  if (!instance) {
    const kind = (process.env.STORAGE || 'file').toLowerCase();
    instance = kind === 'firestore' ? firestoreAdapter() : kind === 'memory' ? memoryAdapter() : fileAdapter();
  }
  return instance;
}

function matches(doc, where) {
  for (const [k, v] of Object.entries(where || {})) {
    if (doc[k] !== v) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
function memoryAdapter(initial = {}) {
  const data = initial;
  const coll = (c) => (data[c] ||= {});
  return {
    _data: data,
    async get(c, id) { const d = coll(c)[id]; return d ? structuredClone(d) : null; },
    async put(c, doc) { coll(c)[doc.id] = structuredClone(doc); return doc; },
    async patch(c, id, partial) {
      const cur = coll(c)[id];
      if (!cur) return null;
      const next = { ...cur, ...partial };
      coll(c)[id] = structuredClone(next);
      return next;
    },
    async del(c, id) { delete coll(c)[id]; },
    async find(c, where) { return Object.values(coll(c)).filter((d) => matches(d, where)).map((d) => structuredClone(d)); },
  };
}

/* ------------------------------------------------------------------ */
function fileAdapter() {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
  const file = path.join(dir, 'db.json');
  let mem = null;
  let writing = Promise.resolve();
  let dirty = false;

  async function load() {
    if (mem) return mem;
    try {
      mem = memoryAdapter(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch {
      mem = memoryAdapter({});
    }
    return mem;
  }

  function persist() {
    dirty = true;
    writing = writing.then(async () => {
      if (!dirty) return;
      dirty = false;
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(mem._data));
      await fs.rename(tmp, file);
    }).catch((e) => console.error('[db] persist failed', e));
    return writing;
  }

  return {
    async get(c, id) { return (await load()).get(c, id); },
    async put(c, doc) { const r = await (await load()).put(c, doc); await persist(); return r; },
    async patch(c, id, p) { const r = await (await load()).patch(c, id, p); await persist(); return r; },
    async del(c, id) { await (await load()).del(c, id); await persist(); },
    async find(c, w) { return (await load()).find(c, w); },
  };
}

/* ------------------------------------------------------------------ */
function firestoreAdapter() {
  let fsPromise = null;
  async function db() {
    if (!fsPromise) {
      fsPromise = (async () => {
        const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
        const { getFirestore } = await import('firebase-admin/firestore');
        if (!getApps().length) {
          const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
          initializeApp({ credential: sa ? cert(JSON.parse(sa)) : applicationDefault() });
        }
        const f = getFirestore();
        f.settings({ ignoreUndefinedProperties: true });
        return f;
      })();
    }
    return fsPromise;
  }
  const strip = (doc) => JSON.parse(JSON.stringify(doc)); // drop undefined
  return {
    async get(c, id) { const s = await (await db()).collection(c).doc(id).get(); return s.exists ? s.data() : null; },
    async put(c, doc) { await (await db()).collection(c).doc(doc.id).set(strip(doc)); return doc; },
    async patch(c, id, partial) {
      const ref = (await db()).collection(c).doc(id);
      const s = await ref.get();
      if (!s.exists) return null;
      await ref.update(strip(partial)); // top-level fields replaced wholesale (same as file adapter)
      return { ...s.data(), ...partial };
    },
    async del(c, id) { await (await db()).collection(c).doc(id).delete(); },
    async find(c, where) {
      let q = (await db()).collection(c);
      for (const [k, v] of Object.entries(where || {})) q = q.where(k, '==', v);
      const snap = await q.get();
      return snap.docs.map((d) => d.data());
    },
  };
}

/** Testing hook. */
export function _setDbForTests(adapter) { instance = adapter; }
export function _memoryAdapter() { return memoryAdapter({}); }
