/**
 * Workspace API client — talks to the dashboard's /api/ext/* endpoints with
 * the device token created in Dashboard → Settings → Extension.
 */
import { getConnection, setConnection } from './storage.js';

/**
 * Accepts "<apiBase>#<token>" (what the dashboard shows) or base + token.
 * @returns {{apiBase: string, token: string}}
 */
export function parsePairing(input, tokenField = '') {
  const raw = String(input || '').trim();
  let apiBase = raw; let token = String(tokenField || '').trim();
  if (raw.includes('#')) {
    const i = raw.indexOf('#');
    apiBase = raw.slice(0, i);
    token = token || raw.slice(i + 1);
  } else if (/^hpt_/.test(raw)) {
    apiBase = ''; token = raw;
  }
  apiBase = apiBase.trim().replace(/\/+$/, '').replace(/\/(w\/.*|api.*)$/, '');
  if (apiBase && !/^https?:\/\//i.test(apiBase)) apiBase = `https://${apiBase}`;
  if (!apiBase) throw new Error('Paste the full pairing string from the dashboard (it starts with your dashboard URL).');
  if (!/^hpt_[A-Za-z0-9]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('That token does not look right — copy it again from Settings → Extension.');
  return { apiBase, token };
}

async function call(conn, method, path, body) {
  const res = await fetch(`${conn.apiBase}/api/ext/${path}`, {
    method,
    headers: { Authorization: `Bearer ${conn.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Server responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function connect(apiBase, token) {
  const conn = { apiBase, token };
  const info = await call(conn, 'GET', 'ping');
  const full = { ...conn, workspace: info.workspace, member: info.member, dashboardUrl: info.dashboardUrl, connectedAt: new Date().toISOString() };
  await setConnection(full);
  return full;
}

export async function ping() {
  const conn = await getConnection();
  if (!conn) return null;
  return call(conn, 'GET', 'ping');
}

export async function fetchWorkspaceHackathons() {
  const conn = await getConnection();
  if (!conn) return null;
  return (await call(conn, 'GET', 'hackathons')).hackathons || [];
}

export async function pushHackathons(items) {
  const conn = await getConnection();
  if (!conn) return null;
  return (await call(conn, 'POST', 'hackathons', { items })).results || [];
}
