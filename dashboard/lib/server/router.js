/**
 * API router — every endpoint under /api/* is dispatched from here.
 * See README "API reference" for the full table.
 */
import * as svc from './service.js';
import { HttpError } from './service.js';
import { getDb } from './db.js';
import { runReminders, buildIcs, sendWebhook } from './notify.js';
import { unfurl } from './unfurl.js';

const COOKIE_PREFIX = 'hpt_';
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function sessionCookie(req, wsId, value) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_PREFIX}${wsId}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? 31536000 : 0}${secure}`;
}

function readCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const u = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') || u.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || u.host;
  return `${proto}://${host}`;
}

const authed = (result, req, status = 200) => json(
  { workspaceId: result.workspace.id, workspaceName: result.workspace.name, member: { id: result.member.id, name: result.member.name, role: result.member.role } },
  status,
  { 'Set-Cookie': sessionCookie(req, result.workspace.id, result.session) },
);

export async function handle(req, segments) {
  try {
    return await route(req, segments);
  } catch (e) {
    const isExt = segments[0] === 'ext';
    if (e instanceof HttpError) return json({ error: e.message }, e.status, isExt ? CORS : {});
    console.error('[api]', e);
    return json({ error: 'Something went wrong on the server' }, 500, isExt ? CORS : {});
  }
}

async function route(req, seg) {
  const m = req.method;
  const url = new URL(req.url);
  const [a, b, c, d] = seg;

  /* ---------- public ---------- */
  if (a === 'health') return json({ ok: true, storage: process.env.STORAGE || 'file' });
  if (a === 'workspaces' && m === 'POST') return authed(await svc.createWorkspace(await body(req)), req, 201);
  if (a === 'join' && b && m === 'GET') return json(await svc.joinInfo(b, url.searchParams.get('code')));
  if (a === 'join' && b && m === 'POST') return authed(await svc.joinWorkspace(b, await body(req)), req, 201);
  if (a === 'login' && m === 'POST') return authed(await svc.redeemLoginLink((await body(req)).code), req);
  if (a === 'public' && b && m === 'GET') return json(await svc.publicTimeline(b));
  if (a === 'cal' && b && c && m === 'GET') {
    const ws = await svc.getWorkspace(b);
    const key = c.replace(/\.ics$/, '');
    if (!svc.safeEqual(ws.calendarKey, key)) return json({ error: 'Invalid calendar link' }, 403);
    const hacks = await getDb().find('hackathons', { workspaceId: ws.id });
    return new Response(buildIcs(ws, hacks, baseUrl(req)), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="${ws.id}.ics"` },
    });
  }
  if (a === 'cron' && b === 'reminders') {
    const secret = process.env.CRON_SECRET;
    const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key');
    if (!secret || !given || !svc.safeEqual(secret, given)) return json({ error: 'Unauthorized' }, 401);
    return json({ report: await runReminders() });
  }

  /* ---------- extension (Bearer device token, CORS) ---------- */
  if (a === 'ext') {
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const auth = await svc.memberFromDeviceToken(req.headers.get('authorization'));
    if (!auth) return json({ error: 'Extension is not connected (token invalid or revoked)' }, 401, CORS);
    const { workspace: ws, member: me } = auth;
    if (b === 'ping') {
      return json({ workspace: { id: ws.id, name: ws.name }, member: { id: me.id, name: me.name, role: me.role }, dashboardUrl: `${baseUrl(req)}/w/${ws.id}` }, 200, CORS);
    }
    if (b === 'hackathons' && m === 'GET') {
      const hacks = await getDb().find('hackathons', { workspaceId: ws.id });
      return json({ hackathons: hacks.filter((h) => !h.archived) }, 200, CORS);
    }
    if (b === 'hackathons' && m === 'POST') {
      const p = await body(req);
      const items = Array.isArray(p.items) ? p.items.slice(0, 50) : [p];
      const results = [];
      for (const it of items) {
        try {
          const r = await svc.upsertHackathon(ws, me, it, { source: it.source === 'manual' ? 'manual' : 'extension', registerSelf: !!it.registerSelf });
          results.push({ ok: true, id: r.hackathon.id, created: r.created, name: r.hackathon.name, stage: r.hackathon.stage });
        } catch (e) {
          results.push({ ok: false, error: e.message });
        }
      }
      return json({ results }, 200, CORS);
    }
    return json({ error: 'Unknown endpoint' }, 404, CORS);
  }

  /* ---------- workspace (session cookie) ---------- */
  if (a === 'w' && b) {
    const ws = await svc.getWorkspace(b);
    const me = await svc.memberFromSession(ws.id, readCookie(req, `${COOKIE_PREFIX}${ws.id}`));
    if (!me) return json({ error: 'You are not signed in to this workspace' }, 401);
    const id = d;
    const p = m === 'GET' || m === 'DELETE' ? {} : await body(req);

    switch (c) {
      case 'snapshot': return json(await svc.snapshot(ws, me, url.searchParams.get('since')));
      case 'workspace':
        if (m === 'PATCH') { await svc.updateWorkspace(ws, me, p); return json(await svc.snapshot(await svc.getWorkspace(ws.id), me)); }
        if (m === 'DELETE') {
          await svc.deleteWorkspace(ws, me);
          return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, ws.id, '') });
        }
        break;
      case 'logout': return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, ws.id, '') });
      case 'unfurl': return json(await unfurl(url.searchParams.get('url') || ''));
      case 'login-link': {
        const r = await svc.createLoginLink(ws, me, p.memberId);
        return json({ url: `${baseUrl(req)}/login?code=${encodeURIComponent(r.code)}`, expiresAt: r.expiresAt });
      }
      case 'test-webhook': {
        const hook = ws.settings?.webhookUrl;
        if (!hook) return json({ error: 'No webhook configured' }, 400);
        const ok = await sendWebhook(hook, `✅ **${ws.name}** is connected — deadline reminders will appear here.`).catch(() => false);
        return json({ ok }, ok ? 200 : 502);
      }
      case 'devices':
        if (m === 'POST' && !id) return json({ ...(await svc.createDevice(ws, me, p.label)), apiBase: baseUrl(req) }, 201);
        if (m === 'DELETE' && id) { await svc.revokeDevice(ws, me, id); return json({ ok: true }); }
        break;
      case 'members':
        if (m === 'PATCH' && id) return json(await svc.updateMember(ws, me, id, p));
        if (m === 'DELETE' && id) {
          await svc.removeMember(ws, me, id);
          return json({ ok: true }, 200, id === me.id ? { 'Set-Cookie': sessionCookie(req, ws.id, '') } : {});
        }
        break;
      case 'hackathons':
        if (m === 'POST' && !id) {
          const r = await svc.upsertHackathon(ws, me, p, { source: 'manual', registerSelf: !!p.registerSelf });
          return json(r, r.created ? 201 : 200);
        }
        if (m === 'POST' && id && seg[4] === 'registration') return json(await svc.setRegistration(ws, me, id, p));
        if (m === 'PATCH' && id) return json(await svc.updateHackathon(ws, me, id, p));
        if (m === 'DELETE' && id) { await svc.deleteHackathon(ws, me, id); return json({ ok: true }); }
        break;
      case 'messages':
        if (m === 'POST' && !id) return json(await svc.postMessage(ws, me, p), 201);
        if (m === 'DELETE' && id) { await svc.deleteEntity(ws, me, 'messages', id); return json({ ok: true }); }
        break;
      case 'ideas':
        if (m === 'POST' && id && seg[4] === 'vote') return json(await svc.voteIdea(ws, me, id, p.up !== false));
        if (m === 'POST' && id && seg[4] === 'promote') return json(await svc.promoteIdea(ws, me, id), 201);
      // falls through
      case 'announcements':
        if (c === 'announcements' && m === 'POST' && id && seg[4] === 'ack') return json(await svc.ackAnnouncement(ws, me, id));
      // falls through
      case 'projects':
      case 'tasks':
        if (m === 'POST' && !id) return json(await svc.createEntity(ws, me, c, p), 201);
        if (m === 'PATCH' && id) return json(await svc.updateEntity(ws, me, c, id, p));
        if (m === 'DELETE' && id) { await svc.deleteEntity(ws, me, c, id); return json({ ok: true }); }
        break;
      default: break;
    }
  }
  return json({ error: 'Unknown endpoint' }, 404);
}
