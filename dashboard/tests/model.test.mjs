import test from 'node:test';
import assert from 'node:assert/strict';
import { computeActions, dueReminders } from '../lib/shared/model.js';

const H = 3600000;
const now = Date.parse('2026-06-01T00:00:00Z');
const snap = {
  workspace: { id: 'w' },
  members: [{ id: 'a', name: 'Asha', role: 'leader' }, { id: 'b', name: 'Ravi', role: 'member' }],
  hackathons: [
    { id: 'h1', name: 'Hack1', stage: 'shortlisted', registrationDeadline: new Date(now + 10 * H).toISOString(), registrations: { a: 'x' } },
    { id: 'h2', name: 'Hack2', stage: 'discovered' },
  ],
  tasks: [{ id: 't', title: 'Pitch deck', assigneeId: 'b', status: 'todo', dueAt: new Date(now + 50 * H).toISOString() }],
  announcements: [{ id: 'n', title: 'Sync at 9', requireAck: true, audience: 'all', acks: {} }],
  projects: [],
};

test('actions differ per member', () => {
  const ravi = computeActions(snap, 'b', now);
  assert.equal(ravi[0].kind, 'register');
  assert.equal(ravi[0].urgency, 'critical');
  assert.ok(ravi.some((x) => x.kind === 'task'));
  assert.ok(ravi.some((x) => x.kind === 'announcement'));
  assert.ok(!ravi.some((x) => x.kind === 'triage'));
  const asha = computeActions(snap, 'a', now);
  assert.ok(!asha.some((x) => x.kind === 'register'), 'already registered');
  assert.ok(asha.some((x) => x.kind === 'triage'));
});

test('push reminders fire once per window and name the unregistered', () => {
  const r = dueReminders(snap, new Set(), now);
  assert.equal(r.length, 1);
  assert.match(r[0].text, /Ravi/);
  assert.equal(dueReminders(snap, new Set([r[0].id]), now).length, 0);
});
