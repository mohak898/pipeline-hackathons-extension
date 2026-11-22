import test from 'node:test';
import assert from 'node:assert/strict';
process.env.STORAGE = 'memory';
process.env.CRON_SECRET = 'cronsecret';
const { handle } = await import('../lib/server/router.js');

const BASE = 'http://localhost:3000/api/';
const jar = {};
async function call(method, path, body, { cookie, headers = {} } = {}) {
  const req = new Request(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handle(req, path.split('?')[0].split('/').filter(Boolean));
  const sc = res.headers.get('set-cookie');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, cookie: sc ? sc.split(';')[0] : null };
}

test('full team workflow', async () => {
  // Leader creates workspace
  const c = await call('POST', 'workspaces', { name: 'Hikity', leaderName: 'Asha' });
  assert.equal(c.status, 201);
  const ws = c.data.workspaceId;
  jar.lead = c.cookie;

  let snap = (await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.lead })).data;
  assert.equal(snap.me.role, 'leader');
  const invite = snap.workspace.inviteCode;
  assert.ok(invite);

  // Unauthed access denied
  assert.equal((await call('GET', `w/${ws}/snapshot`)).status, 401);
  // Bad invite
  assert.equal((await call('POST', `join/${ws}`, { code: 'nope', name: 'X' })).status, 403);
  // Teammate joins via invite
  const j = await call('POST', `join/${ws}`, { code: invite, name: 'Ravi' });
  assert.equal(j.status, 201);
  jar.ravi = j.cookie;
  snap = (await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.ravi })).data;
  assert.equal(snap.workspace.inviteCode, null, 'members do not see invite code');
  const raviId = snap.me.id;

  // Leader pairs an extension; it captures the same hackathon 3 different ways
  const dev = (await call('POST', `w/${ws}/devices`, { label: 'Asha laptop' }, { cookie: jar.lead })).data;
  const auth = { headers: { authorization: `Bearer ${dev.token}` } };
  assert.equal((await call('GET', 'ext/ping', null, auth)).data.workspace.name, 'Hikity');
  const r1 = await call('POST', 'ext/hackathons', { items: [
    { name: 'ETHIndia 2026', url: 'https://ethindia.devfolio.co/?ref=x', endTime: '2026-12-07T10:00:00Z' },
    { name: 'ETHIndia 2026', url: 'https://devfolio.co/hackathons/ethindia', endTime: '2026-12-07T10:00:00Z', startTime: '2026-12-05T10:00:00Z' },
    { name: 'ETHIndia', url: 'https://ethindia.co', endTime: '2026-12-07T15:00:00Z' },
  ] }, auth);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.data.results.map((r) => r.created), [true, false, false]);
  snap = (await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.ravi })).data;
  assert.equal(snap.hackathons.length, 1, 'deduplicated into one record');
  const h = snap.hackathons[0];
  assert.equal(h.stage, 'discovered');
  assert.equal(h.startTime, '2026-12-05T10:00:00.000Z');

  // Teammate WITHOUT extension adds a custom-site hackathon manually
  const add = await call('POST', `w/${ws}/hackathons`, { name: 'BuildFest', url: 'buildfest.dev/register', registrationDeadline: '2099-01-01T00:00:00Z' }, { cookie: jar.ravi });
  assert.equal(add.status, 201);
  assert.equal(add.data.hackathon.key, 'web:buildfest.dev');
  assert.equal(add.data.hackathon.stage, 'shortlisted');

  // Leader edits name → later extension capture must not overwrite it
  await call('PATCH', `w/${ws}/hackathons/${h.id}`, { name: 'ETHIndia (main)', stage: 'shortlisted' }, { cookie: jar.lead });
  await call('POST', 'ext/hackathons', { name: 'ETHIndia 2026', url: 'https://ethindia.devfolio.co/prizes' }, auth);
  snap = (await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.lead })).data;
  const h2 = snap.hackathons.find((x) => x.id === h.id);
  assert.equal(h2.name, 'ETHIndia (main)');
  assert.equal(snap.hackathons.length, 2);

  // Registration: member can mark self, not others
  assert.equal((await call('POST', `w/${ws}/hackathons/${h.id}/registration`, { memberId: snap.me.id }, { cookie: jar.ravi })).status, 403);
  assert.equal((await call('POST', `w/${ws}/hackathons/${h.id}/registration`, {}, { cookie: jar.ravi })).status, 200);

  // Announcement: lead only, ack by member
  assert.equal((await call('POST', `w/${ws}/announcements`, { title: 'x' }, { cookie: jar.ravi })).status, 403);
  const ann = (await call('POST', `w/${ws}/announcements`, { title: 'Everyone register by tonight' }, { cookie: jar.lead })).data;
  assert.equal((await call('POST', `w/${ws}/announcements/${ann.id}/ack`, {}, { cookie: jar.ravi })).status, 200);

  // Ideas → vote → promote to project → tasks
  const idea = (await call('POST', `w/${ws}/ideas`, { title: 'ZK attendance', hackathonId: h.id }, { cookie: jar.ravi })).data;
  const v = (await call('POST', `w/${ws}/ideas/${idea.id}/vote`, { up: true }, { cookie: jar.lead })).data;
  assert.equal(v.votes.length, 2);
  const proj = (await call('POST', `w/${ws}/ideas/${idea.id}/promote`, {}, { cookie: jar.lead })).data;
  assert.equal(proj.hackathonId, h.id);
  const task = (await call('POST', `w/${ws}/tasks`, { title: 'Smart contract', projectId: proj.id, assigneeId: raviId, dueAt: '2099-01-01T00:00:00Z' }, { cookie: jar.lead })).data;
  assert.equal((await call('PATCH', `w/${ws}/tasks/${task.id}`, { status: 'done' }, { cookie: jar.ravi })).data.status, 'done');

  // Chat
  assert.equal((await call('POST', `w/${ws}/messages`, { body: 'gm team' }, { cookie: jar.ravi })).status, 201);

  // Permissions: member cannot delete leader's hackathon nor edit settings
  assert.equal((await call('DELETE', `w/${ws}/hackathons/${h.id}`, null, { cookie: jar.ravi })).status, 403);
  assert.equal((await call('PATCH', `w/${ws}/workspace`, { name: 'x' }, { cookie: jar.ravi })).status, 403);
  assert.equal((await call('PATCH', `w/${ws}/workspace`, { settings: { webhookUrl: 'https://evil.com' } }, { cookie: jar.lead })).status, 400);

  // Rev short-circuit
  const rev = snap.rev;
  const s2 = (await call('GET', `w/${ws}/snapshot?since=${encodeURIComponent((await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.lead })).data.rev)}`, null, { cookie: jar.lead })).data;
  assert.equal(s2.unchanged, true);
  assert.ok(rev);

  // Calendar feed
  const key = snap.workspace.calendarKey;
  const ics = await call('GET', `cal/${ws}/${key}.ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.data, /BEGIN:VEVENT/);
  assert.equal((await call('GET', `cal/${ws}/wrong.ics`)).status, 403);

  // Sign-in link for another device
  const link = (await call('POST', `w/${ws}/login-link`, {}, { cookie: jar.ravi })).data;
  const code = new URL(link.url).searchParams.get('code');
  const li = await call('POST', 'login', { code });
  assert.equal(li.status, 200);
  assert.equal((await call('POST', 'login', { code })).status, 403, 'single use');

  // Public timeline
  await call('PATCH', `w/${ws}/workspace`, { publicShare: true }, { cookie: jar.lead });
  const tok = (await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.lead })).data.workspace.publicToken;
  const pub = (await call('GET', `public/${tok}`)).data;
  assert.equal(pub.hackathons.length, 2);

  // Cron auth
  assert.equal((await call('GET', 'cron/reminders')).status, 401);
  assert.equal((await call('GET', 'cron/reminders', null, { headers: { authorization: 'Bearer cronsecret' } })).status, 200);

  // Remove member revokes access
  await call('DELETE', `w/${ws}/members/${raviId}`, null, { cookie: jar.lead });
  assert.equal((await call('GET', `w/${ws}/snapshot`, null, { cookie: jar.ravi })).status, 401);
  // Device revoke
  await call('DELETE', `w/${ws}/devices/${dev.id}`, null, { cookie: jar.lead });
  assert.equal((await call('GET', 'ext/ping', null, auth)).status, 401);
});
