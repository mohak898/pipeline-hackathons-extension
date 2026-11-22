/**
 * Workspace service — all business rules live here (permissions, dedup,
 * activity log). Route handlers in app/api/[...path]/route.js are thin.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';
import {
  canonicalKey, detectPlatform, isSameHackathon, mergeHackathon, normalizeUrl, toIso,
} from '../shared/canonical.js';
import {
  STAGE_IDS, PROJECT_STATUSES, TASK_STATUSES, IDEA_STATUSES, ROLES, isLead,
} from '../shared/model.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const forbidden = (msg = 'Only the team lead can do that') => new HttpError(403, msg);
const notFound = (what = 'Not found') => new HttpError(404, what);

/* ------------------------------------------------------------------ */
/*  ids / secrets                                                      */
/* ------------------------------------------------------------------ */
export const newId = (n = 10) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n + 4) || newId(n);
export const newSecret = () => randomBytes(24).toString('base64url');
export const hash = (s) => createHash('sha256').update(String(s)).digest('hex');
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
const now = () => new Date().toISOString();

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7', '#14b8a6', '#ef4444', '#eab308', '#6366f1', '#f97316'];

/* ------------------------------------------------------------------ */
/*  sanitizers                                                         */
/* ------------------------------------------------------------------ */
const str = (v, max = 200) => (v == null ? undefined : String(v).trim().slice(0, max));
const optStr = (v, max) => (v === null || v === '' ? null : str(v, max));
const url = (v) => {
  if (v === null || v === '') return null;
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!/^https?:\/\//i.test(s) && !/^[\w-]+(\.[\w-]+)+/.test(s)) throw bad('Invalid URL');
  return (/^https?:\/\//i.test(s) ? s : `https://${s}`).slice(0, 500);
};
const date = (v) => {
  if (v === null || v === '') return null;
  if (v == null) return undefined;
  const iso = toIso(v);
  if (!iso) throw bad(`Invalid date: ${v}`);
  return iso;
};
const oneOf = (v, list, field) => {
  if (v == null) return undefined;
  if (!list.includes(v)) throw bad(`Invalid ${field}`);
  return v;
};
const strList = (v, maxItems = 20, max = 40) => (v == null ? undefined
  : (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim().slice(0, max)).filter(Boolean).slice(0, maxItems));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function hackathonFields(b) {
  return clean({
    name: str(b.name, 160),
    url: url(b.url),
    platform: str(b.platform, 30),
    stage: oneOf(b.stage, STAGE_IDS, 'stage'),
    result: b.result === undefined ? undefined : oneOf(b.result || 'none', ['none', 'won', 'finalist', 'participated', 'dropped'], 'result'),
    startTime: date(b.startTime),
    endTime: date(b.endTime),
    registrationDeadline: date(b.registrationDeadline),
    submissionDeadline: date(b.submissionDeadline),
    milestones: b.milestones == null ? undefined : (Array.isArray(b.milestones) ? b.milestones : []).slice(0, 20).map((m) => ({
      id: str(m.id, 20) || newId(6), label: str(m.label, 80) || 'Milestone', at: date(m.at) || null,
    })),
    mode: b.mode === undefined ? undefined : oneOf(b.mode || 'unknown', ['online', 'offline', 'hybrid', 'unknown'], 'mode'),
    location: optStr(b.location, 120),
    prize: optStr(b.prize, 120),
    teamSize: optStr(b.teamSize, 30),
    tags: strList(b.tags),
    notes: optStr(b.notes, 5000),
    description: optStr(b.description, 600),
    image: b.image === undefined ? undefined : (b.image ? String(b.image).slice(0, 500) : null),
    ownerId: optStr(b.ownerId, 30),
    archived: b.archived == null ? undefined : !!b.archived,
  });
}
const USER_EDITABLE_TRACKED = ['name', 'startTime', 'endTime', 'registrationDeadline', 'submissionDeadline', 'mode', 'location', 'description'];

function projectFields(b) {
  return clean({
    name: str(b.name, 120),
    description: optStr(b.description, 5000),
    hackathonId: optStr(b.hackathonId, 30),
    status: oneOf(b.status, PROJECT_STATUSES, 'status'),
    repoUrl: url(b.repoUrl),
    demoUrl: url(b.demoUrl),
    pitchUrl: url(b.pitchUrl),
    techStack: strList(b.techStack),
    memberIds: strList(b.memberIds, 20, 30),
  });
}
function taskFields(b) {
  return clean({
    title: str(b.title, 200),
    notes: optStr(b.notes, 2000),
    status: oneOf(b.status, TASK_STATUSES, 'status'),
    projectId: optStr(b.projectId, 30),
    hackathonId: optStr(b.hackathonId, 30),
    assigneeId: optStr(b.assigneeId, 30),
    dueAt: date(b.dueAt),
    priority: b.priority === undefined ? undefined : oneOf(b.priority || 'normal', ['low', 'normal', 'high'], 'priority'),
  });
}
function ideaFields(b) {
  return clean({
    title: str(b.title, 160),
    body: optStr(b.body, 5000),
    hackathonId: optStr(b.hackathonId, 30),
    status: oneOf(b.status, IDEA_STATUSES, 'status'),
  });
}
function announcementFields(b) {
  return clean({
    title: str(b.title, 160),
    body: optStr(b.body, 3000),
    requireAck: b.requireAck == null ? undefined : !!b.requireAck,
    audience: b.audience == null ? undefined : (b.audience === 'all' ? 'all' : strList(b.audience, 50, 30)),
    dueAt: date(b.dueAt),
    hackathonId: optStr(b.hackathonId, 30),
    archived: b.archived == null ? undefined : !!b.archived,
  });
}

/* ------------------------------------------------------------------ */
/*  workspace / membership                                             */
/* ------------------------------------------------------------------ */
const publicMember = (m) => ({ id: m.id, name: m.name, role: m.role, color: m.color, joinedAt: m.createdAt, lastSeenAt: m.lastSeenAt || null });

async function touch(wsId) {
  await getDb().patch('workspaces', wsId, { rev: `${Date.now()}-${newId(4)}` });
}

async function log(ws, actor, verb, target, summary) {
  const db = getDb();
  await db.put('activity', {
    id: newId(), workspaceId: ws.id, actorId: actor?.id || null, verb,
    targetType: target?.type || null, targetId: target?.id || null, summary, createdAt: now(),
  });
}

export async function createWorkspace({ name, leaderName }) {
  const db = getDb();
  const wsName = str(name, 80);
  const ln = str(leaderName, 60);
  if (!wsName) throw bad('Workspace name is required');
  if (!ln) throw bad('Your name is required');
  const ws = {
    id: newId(8), name: wsName, createdAt: now(), rev: `${Date.now()}`,
    inviteCode: newSecret().slice(0, 16), calendarKey: newSecret().slice(0, 24),
    publicToken: null, settings: { webhookUrl: null, reminderOffsets: [72, 24, 3] },
  };
  await db.put('workspaces', ws);
  const member = await addMember(ws, ln, 'leader');
  ws.leaderId = member.id;
  await db.patch('workspaces', ws.id, { leaderId: member.id });
  await log(ws, member, 'created', { type: 'workspace', id: ws.id }, `created the workspace “${ws.name}”`);
  const session = await createSession(ws.id, member.id);
  return { workspace: ws, member, session };
}

async function addMember(ws, name, role) {
  const db = getDb();
  const existing = await db.find('members', { workspaceId: ws.id });
  const m = {
    id: newId(), workspaceId: ws.id, name, role, color: COLORS[existing.length % COLORS.length],
    createdAt: now(), lastSeenAt: now(),
  };
  await db.put('members', m);
  return m;
}

export async function createSession(wsId, memberId) {
  const secret = newSecret();
  const s = { id: newId(), workspaceId: wsId, memberId, secretHash: hash(secret), createdAt: now() };
  await getDb().put('sessions', s);
  return `${s.id}.${secret}`;
}

/** Resolve the member behind a session cookie value. */
export async function memberFromSession(wsId, cookieValue) {
  if (!cookieValue) return null;
  const [sid, secret] = String(cookieValue).split('.');
  if (!sid || !secret) return null;
  const db = getDb();
  const s = await db.get('sessions', sid);
  if (!s || s.workspaceId !== wsId || !safeEqual(s.secretHash, hash(secret))) return null;
  const m = await db.get('members', s.memberId);
  if (!m || m.removed) return null;
  if (!m.lastSeenAt || Date.now() - new Date(m.lastSeenAt).getTime() > 5 * 60000) {
    await db.patch('members', m.id, { lastSeenAt: now() });
  }
  return m;
}

/** Resolve an extension device token `hpt_<deviceId>.<secret>`. */
export async function memberFromDeviceToken(token) {
  const raw = String(token || '').replace(/^Bearer\s+/i, '').replace(/^hpt_/, '');
  const [did, secret] = raw.split('.');
  if (!did || !secret) return null;
  const db = getDb();
  const d = await db.get('devices', did);
  if (!d || d.revoked || !safeEqual(d.secretHash, hash(secret))) return null;
  const m = await db.get('members', d.memberId);
  const ws = await db.get('workspaces', d.workspaceId);
  if (!m || m.removed || !ws) return null;
  await db.patch('devices', d.id, { lastUsedAt: now() });
  return { member: m, workspace: ws, device: d };
}

export async function getWorkspace(wsId) {
  const ws = await getDb().get('workspaces', wsId);
  if (!ws) throw notFound('Workspace not found');
  return ws;
}

export async function joinInfo(wsId, code) {
  const ws = await getWorkspace(wsId);
  if (!code || !safeEqual(ws.inviteCode, code)) throw forbidden('This invite link is invalid or was reset by the lead');
  const members = await getDb().find('members', { workspaceId: ws.id });
  return { name: ws.name, members: members.filter((m) => !m.removed).map((m) => m.name) };
}

export async function joinWorkspace(wsId, { code, name }) {
  const ws = await getWorkspace(wsId);
  if (!code || !safeEqual(ws.inviteCode, code)) throw forbidden('This invite link is invalid or was reset by the lead');
  const n = str(name, 60);
  if (!n) throw bad('Your name is required');
  const member = await addMember(ws, n, 'member');
  await log(ws, member, 'joined', { type: 'member', id: member.id }, 'joined the team');
  await touch(ws.id);
  return { workspace: ws, member, session: await createSession(ws.id, member.id) };
}

/** One-time sign-in link for moving to another device. */
export async function createLoginLink(ws, me, memberId) {
  const target = memberId || me.id;
  if (target !== me.id && !isLead(me)) throw forbidden('Only the lead can create sign-in links for teammates');
  const m = await getDb().get('members', target);
  if (!m || m.workspaceId !== ws.id || m.removed) throw notFound('Member not found');
  const secret = newSecret();
  const link = { id: newId(), workspaceId: ws.id, memberId: target, secretHash: hash(secret), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), used: false };
  await getDb().put('loginLinks', link);
  return { code: `${link.id}.${secret}`, expiresAt: link.expiresAt };
}

export async function redeemLoginLink(code) {
  const [id, secret] = String(code || '').split('.');
  const db = getDb();
  const link = id && await db.get('loginLinks', id);
  if (!link || link.used || !safeEqual(link.secretHash, hash(secret || '')) || new Date(link.expiresAt) < new Date()) {
    throw forbidden('This sign-in link is invalid, expired or already used');
  }
  await db.patch('loginLinks', id, { used: true });
  const ws = await getWorkspace(link.workspaceId);
  const m = await db.get('members', link.memberId);
  if (!m || m.removed) throw forbidden('Member was removed');
  return { workspace: ws, member: m, session: await createSession(ws.id, m.id) };
}

/* ------------------------------------------------------------------ */
/*  snapshot                                                           */
/* ------------------------------------------------------------------ */
export async function snapshot(ws, me, sinceRev) {
  if (sinceRev && sinceRev === ws.rev) return { unchanged: true, rev: ws.rev };
  const db = getDb();
  const q = { workspaceId: ws.id };
  const [members, hackathons, projects, tasks, ideas, messages, announcements, activity, devices] = await Promise.all([
    db.find('members', q), db.find('hackathons', q), db.find('projects', q), db.find('tasks', q),
    db.find('ideas', q), db.find('messages', q), db.find('announcements', q), db.find('activity', q),
    db.find('devices', { ...q, memberId: me.id }),
  ]);
  const lead = isLead(me);
  const byTime = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]));
  return {
    rev: ws.rev,
    me: publicMember(me),
    workspace: {
      id: ws.id, name: ws.name, createdAt: ws.createdAt, leaderId: ws.leaderId,
      calendarKey: ws.calendarKey,
      publicToken: ws.publicToken || null,
      inviteCode: lead ? ws.inviteCode : null,
      settings: lead ? ws.settings : { reminderOffsets: ws.settings?.reminderOffsets, webhookConfigured: !!ws.settings?.webhookUrl },
    },
    members: members.filter((m) => !m.removed).map(publicMember),
    hackathons: hackathons.sort(byTime('createdAt')),
    projects: projects.sort(byTime('createdAt')),
    tasks: tasks.sort(byTime('createdAt')),
    ideas: ideas.sort(byTime('createdAt')),
    messages: messages.sort(byTime('createdAt')).slice(-400),
    announcements: announcements.sort(byTime('createdAt')),
    activity: activity.sort(byTime('createdAt')).slice(-120).reverse(),
    devices: devices.filter((d) => !d.revoked).map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt || null })),
  };
}

/* ------------------------------------------------------------------ */
/*  hackathons                                                         */
/* ------------------------------------------------------------------ */
async function findDuplicate(wsId, candidate) {
  const all = await getDb().find('hackathons', { workspaceId: wsId });
  const nu = candidate.url ? normalizeUrl(candidate.url) : null;
  return all.find((h) => (candidate.key && h.key === candidate.key)
    || (nu && (normalizeUrl(h.url || '') === nu || (h.altUrls || []).includes(nu)))
    || isSameHackathon(h, candidate)) || null;
}

/**
 * Create OR merge. Used by the dashboard ("Add hackathon") and the extension
 * (auto capture) so that both paths share one dedup rule.
 */
export async function upsertHackathon(ws, me, body, { source = 'manual', registerSelf = false } = {}) {
  const f = hackathonFields(body);
  if (!f.name) throw bad('Hackathon name is required');
  const candidate = {
    ...f,
    url: f.url ? normalizeUrl(f.url) : null,
    key: f.url ? canonicalKey(f.url) : null,
    platform: f.platform || (f.url ? detectPlatform(f.url) : 'web'),
  };
  const db = getDb();
  const dup = await findDuplicate(ws.id, candidate);
  let h; let created = false;
  if (dup) {
    h = mergeHackathon(dup, { ...candidate, stage: undefined });
    if (f.stage && STAGE_IDS.indexOf(f.stage) > STAGE_IDS.indexOf(dup.stage)) h.stage = f.stage; // only move forward
    h.updatedAt = now();
  } else {
    created = true;
    h = {
      id: newId(), workspaceId: ws.id, ...candidate,
      stage: f.stage || (source === 'extension' ? 'discovered' : 'shortlisted'),
      registrations: {}, userEdited: source === 'manual' ? USER_EDITABLE_TRACKED.filter((k) => candidate[k]) : [],
      source, createdBy: me.id, createdAt: now(), updatedAt: now(), archived: false,
    };
  }
  if (registerSelf) h.registrations = { ...(h.registrations || {}), [me.id]: now() };
  await db.put('hackathons', h);
  if (created) await log(ws, me, 'added', { type: 'hackathon', id: h.id }, `${source === 'extension' ? 'captured' : 'added'} hackathon “${h.name}”`);
  await touch(ws.id);
  return { hackathon: h, created, merged: !created };
}

async function loadIn(coll, ws, id) {
  const doc = await getDb().get(coll, id);
  if (!doc || doc.workspaceId !== ws.id) throw notFound();
  return doc;
}

export async function updateHackathon(ws, me, id, body) {
  const h = await loadIn('hackathons', ws, id);
  const f = hackathonFields(body);
  if (f.url) { f.url = normalizeUrl(f.url); f.key = canonicalKey(f.url); f.platform = f.platform || detectPlatform(f.url); }
  const edited = new Set(h.userEdited || []);
  for (const k of USER_EDITABLE_TRACKED) if (k in f) edited.add(k);
  const next = await getDb().patch('hackathons', id, { ...f, userEdited: [...edited], updatedAt: now() });
  if (f.stage && f.stage !== h.stage) await log(ws, me, 'moved', { type: 'hackathon', id }, `moved “${h.name}” to ${f.stage}`);
  await touch(ws.id);
  return next;
}

export async function deleteHackathon(ws, me, id) {
  const h = await loadIn('hackathons', ws, id);
  if (!isLead(me) && h.createdBy !== me.id) throw forbidden('Only the lead or whoever added it can delete — archive it instead');
  await getDb().del('hackathons', id);
  await log(ws, me, 'deleted', { type: 'hackathon', id }, `deleted hackathon “${h.name}”`);
  await touch(ws.id);
}

export async function setRegistration(ws, me, id, { memberId, registered }) {
  const h = await loadIn('hackathons', ws, id);
  const target = memberId || me.id;
  if (target !== me.id && !isLead(me)) throw forbidden('Only the lead can mark someone else as registered');
  const regs = { ...(h.registrations || {}) };
  if (registered === false) delete regs[target]; else regs[target] = now();
  const next = await getDb().patch('hackathons', id, { registrations: regs, updatedAt: now() });
  if (registered !== false) {
    const who = target === me.id ? 'registered' : 'marked a teammate registered';
    await log(ws, me, 'registered', { type: 'hackathon', id }, `${who} for “${h.name}”`);
  }
  await touch(ws.id);
  return next;
}

/* ------------------------------------------------------------------ */
/*  generic entities (projects, tasks, ideas, messages, announcements) */
/* ------------------------------------------------------------------ */
const ENTITY = {
  projects: { fields: projectFields, required: 'name', label: 'project', title: (d) => d.name },
  tasks: { fields: taskFields, required: 'title', label: 'task', title: (d) => d.title },
  ideas: { fields: ideaFields, required: 'title', label: 'idea', title: (d) => d.title },
  announcements: { fields: announcementFields, required: 'title', label: 'announcement', title: (d) => d.title, leadOnly: true },
};

export async function createEntity(ws, me, coll, body) {
  const spec = ENTITY[coll];
  if (!spec) throw notFound();
  if (spec.leadOnly && !isLead(me)) throw forbidden('Only the lead (or an admin) can post announcements');
  const f = spec.fields(body);
  if (!f[spec.required]) throw bad(`${spec.required} is required`);
  const doc = { id: newId(), workspaceId: ws.id, ...f, createdBy: me.id, createdAt: now(), updatedAt: now() };
  if (coll === 'projects') { doc.status ||= 'ideating'; doc.memberIds ||= [me.id]; }
  if (coll === 'tasks') { doc.status ||= 'todo'; doc.priority ||= 'normal'; }
  if (coll === 'ideas') { doc.status ||= 'open'; doc.votes = [me.id]; }
  if (coll === 'announcements') { doc.audience ||= 'all'; doc.acks = {}; doc.requireAck ??= true; }
  await getDb().put(coll, doc);
  const assigned = coll === 'tasks' && doc.assigneeId && doc.assigneeId !== me.id ? ' and assigned it' : '';
  await log(ws, me, 'created', { type: spec.label, id: doc.id }, `${coll === 'announcements' ? 'announced' : `created ${spec.label}`} “${spec.title(doc)}”${assigned}`);
  await touch(ws.id);
  return doc;
}

export async function updateEntity(ws, me, coll, id, body) {
  const spec = ENTITY[coll];
  if (!spec) throw notFound();
  const doc = await loadIn(coll, ws, id);
  if (spec.leadOnly && !isLead(me)) throw forbidden();
  const f = spec.fields(body);
  const next = await getDb().patch(coll, id, { ...f, updatedAt: now() });
  if (coll === 'tasks' && f.status === 'done' && doc.status !== 'done') {
    await log(ws, me, 'completed', { type: 'task', id }, `completed task “${doc.title}”`);
  }
  if (coll === 'projects' && f.status && f.status !== doc.status) {
    await log(ws, me, 'moved', { type: 'project', id }, `set project “${doc.name}” to ${f.status}`);
  }
  await touch(ws.id);
  return next;
}

export async function deleteEntity(ws, me, coll, id) {
  const spec = ENTITY[coll];
  if (!spec && coll !== 'messages') throw notFound();
  const doc = await loadIn(coll, ws, id);
  const owner = doc.createdBy === me.id || doc.authorId === me.id;
  if (!owner && !isLead(me)) throw forbidden('You can only delete things you created');
  await getDb().del(coll, id);
  if (coll === 'projects') {
    for (const t of await getDb().find('tasks', { workspaceId: ws.id, projectId: id })) await getDb().del('tasks', t.id);
  }
  await touch(ws.id);
}

export async function voteIdea(ws, me, id, up = true) {
  const idea = await loadIn('ideas', ws, id);
  const votes = new Set(idea.votes || []);
  if (up) votes.add(me.id); else votes.delete(me.id);
  const next = await getDb().patch('ideas', id, { votes: [...votes] });
  await touch(ws.id);
  return next;
}

/** Turn an idea into a project (keeps the idea, marks it picked). */
export async function promoteIdea(ws, me, id) {
  const idea = await loadIn('ideas', ws, id);
  const project = await createEntity(ws, me, 'projects', {
    name: idea.title, description: idea.body, hackathonId: idea.hackathonId || null, status: 'building',
  });
  await getDb().patch('ideas', id, { status: 'picked', projectId: project.id });
  await touch(ws.id);
  return project;
}

export async function ackAnnouncement(ws, me, id) {
  const a = await loadIn('announcements', ws, id);
  const next = await getDb().patch('announcements', id, { acks: { ...(a.acks || {}), [me.id]: now() } });
  await touch(ws.id);
  return next;
}

export async function postMessage(ws, me, body) {
  const text = str(body.body, 4000);
  if (!text) throw bad('Message is empty');
  const threadType = oneOf(body.threadType || 'general', ['general', 'hackathon', 'project', 'idea'], 'thread');
  const msg = {
    id: newId(), workspaceId: ws.id, threadType, threadId: threadType === 'general' ? 'general' : str(body.threadId, 30),
    body: text, authorId: me.id, createdAt: now(),
  };
  await getDb().put('messages', msg);
  await touch(ws.id);
  return msg;
}

/* ------------------------------------------------------------------ */
/*  team & settings (lead powers)                                      */
/* ------------------------------------------------------------------ */
export async function updateMember(ws, me, id, body) {
  const m = await loadIn('members', ws, id);
  const patch = {};
  if (body.name != null) {
    if (id !== me.id && !isLead(me)) throw forbidden();
    patch.name = str(body.name, 60) || m.name;
  }
  if (body.role != null) {
    if (!isLead(me)) throw forbidden();
    const role = oneOf(body.role, ROLES, 'role');
    if (role === 'leader') {
      if (me.role !== 'leader') throw forbidden('Only the current leader can hand over leadership');
      await getDb().patch('members', me.id, { role: 'admin' });
      await getDb().patch('workspaces', ws.id, { leaderId: id });
      await log(ws, me, 'role', { type: 'member', id }, `handed leadership to ${m.name}`);
    } else if (m.role === 'leader') {
      throw bad('Hand leadership to someone else first');
    }
    patch.role = role;
  }
  const next = await getDb().patch('members', id, patch);
  await touch(ws.id);
  return publicMember(next);
}

export async function removeMember(ws, me, id) {
  const m = await loadIn('members', ws, id);
  if (id !== me.id && !isLead(me)) throw forbidden();
  if (m.role === 'leader') throw bad('The leader cannot be removed — hand over leadership first');
  await getDb().patch('members', id, { removed: true });
  for (const s of await getDb().find('sessions', { memberId: id })) await getDb().del('sessions', s.id);
  for (const d of await getDb().find('devices', { memberId: id })) await getDb().patch('devices', d.id, { revoked: true });
  await log(ws, me, 'removed', { type: 'member', id }, id === me.id ? 'left the team' : `removed ${m.name}`);
  await touch(ws.id);
}

export async function updateWorkspace(ws, me, body) {
  if (!isLead(me)) throw forbidden();
  const patch = {};
  if (body.name != null) patch.name = str(body.name, 80) || ws.name;
  if (body.settings) {
    const s = { ...(ws.settings || {}) };
    if ('webhookUrl' in body.settings) {
      const w = body.settings.webhookUrl;
      if (w && !/^https:\/\/(discord(app)?\.com\/api\/webhooks\/|hooks\.slack\.com\/)/.test(w)) {
        throw bad('Webhook must be a Discord or Slack incoming-webhook URL');
      }
      s.webhookUrl = w || null;
    }
    if (Array.isArray(body.settings.reminderOffsets)) {
      s.reminderOffsets = body.settings.reminderOffsets.map(Number).filter((n) => n > 0 && n <= 24 * 30).slice(0, 6);
    }
    patch.settings = s;
  }
  if (body.regenerateInvite) patch.inviteCode = newSecret().slice(0, 16);
  if (body.regenerateCalendar) patch.calendarKey = newSecret().slice(0, 24);
  if (body.publicShare === true) patch.publicToken = ws.publicToken || newSecret().slice(0, 16);
  if (body.publicShare === false) patch.publicToken = null;
  const next = await getDb().patch('workspaces', ws.id, patch);
  await touch(ws.id);
  return next;
}

export async function deleteWorkspace(ws, me) {
  if (me.role !== 'leader') throw forbidden('Only the leader can delete the workspace');
  const db = getDb();
  for (const c of ['members', 'sessions', 'devices', 'hackathons', 'projects', 'tasks', 'ideas', 'messages', 'announcements', 'activity', 'sentReminders', 'loginLinks']) {
    for (const d of await db.find(c, { workspaceId: ws.id })) await db.del(c, d.id);
  }
  await db.del('workspaces', ws.id);
}

/* ------------------------------------------------------------------ */
/*  extension devices                                                  */
/* ------------------------------------------------------------------ */
export async function createDevice(ws, me, label) {
  const secret = newSecret();
  const d = {
    id: newId(), workspaceId: ws.id, memberId: me.id, label: str(label, 60) || 'Chrome extension',
    secretHash: hash(secret), createdAt: now(), revoked: false,
  };
  await getDb().put('devices', d);
  return { id: d.id, token: `hpt_${d.id}.${secret}` };
}

export async function revokeDevice(ws, me, id) {
  const d = await loadIn('devices', ws, id);
  if (d.memberId !== me.id && !isLead(me)) throw forbidden();
  await getDb().patch('devices', id, { revoked: true });
}

/* ------------------------------------------------------------------ */
/*  public read-only timeline                                          */
/* ------------------------------------------------------------------ */
export async function publicTimeline(token) {
  const all = await getDb().find('workspaces', { publicToken: token });
  const ws = all[0];
  if (!token || !ws) throw notFound('This share link is invalid or was turned off');
  const hacks = await getDb().find('hackathons', { workspaceId: ws.id });
  return {
    name: ws.name,
    hackathons: hacks.filter((h) => !h.archived && h.stage !== 'discovered').map((h) => ({
      id: h.id, name: h.name, url: h.url, platform: h.platform, stage: h.stage,
      startTime: h.startTime || null, endTime: h.endTime || null,
      registrationDeadline: h.registrationDeadline || null, submissionDeadline: h.submissionDeadline || null,
      mode: h.mode || null, location: h.location || null,
    })),
  };
}
