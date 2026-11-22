import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalKey, isSameHackathon, mergeHackathon, toIso, normalizeUrl } from '../lib/shared/canonical.js';
import { extractHackathon, collectFromHtml, findKeywordDates } from '../lib/shared/extract.js';

test('canonical keys collapse URL variants', () => {
  assert.equal(canonicalKey('https://ethindia.devfolio.co/'), 'devfolio:ethindia');
  assert.equal(canonicalKey('https://ethindia.devfolio.co/prizes?ref=abc'), 'devfolio:ethindia');
  assert.equal(canonicalKey('https://devfolio.co/hackathons/ethindia'), 'devfolio:ethindia');
  assert.equal(canonicalKey('https://devfolio.co/hackathons'), null);
  assert.equal(canonicalKey('https://devfolio.co/hackathons/open'), null);
  assert.equal(canonicalKey('https://hackmit.devpost.com/rules'), 'devpost:hackmit');
  assert.equal(canonicalKey('https://devpost.com/software/cool-app'), null);
  assert.equal(canonicalKey('https://devpost.com/hackathons'), null);
  assert.equal(canonicalKey('https://unstop.com/hackathons/smart-india-hackathon-2026-iit-delhi-1234567'), 'unstop:1234567');
  assert.equal(canonicalKey('https://unstop.com/o/xyz-1234567/register'), 'unstop:1234567');
  assert.equal(canonicalKey('https://unstop.com/hackathons'), null);
  assert.equal(canonicalKey('https://www.myhack.io/prizes/'), 'web:myhack.io');
  assert.equal(canonicalKey('https://myhack.io'), 'web:myhack.io');
  assert.equal(canonicalKey('https://lu.ma/abc123'), 'luma:abc123');
  assert.equal(normalizeUrl('http://www.X.io/a/?q=1#h'), 'https://x.io/a');
});

test('same hackathon across platforms merges by name+date', () => {
  const a = { url: 'https://ethindia.devfolio.co', name: 'ETHIndia 2026', endTime: '2026-12-07T10:00:00Z' };
  const b = { url: 'https://ethindia.co', name: 'ETHIndia', endTime: '2026-12-07T18:00:00Z' };
  const c = { url: 'https://other.devfolio.co', name: 'ETHIndia 2026', endTime: '2026-12-07T10:00:00Z' };
  assert.equal(isSameHackathon(a, b), true);
  assert.equal(isSameHackathon(a, c), false, 'different devfolio slugs are different events');
  assert.equal(isSameHackathon(a, { name: 'HackMIT', endTime: a.endTime }), false);
});

test('merge keeps user-edited fields', () => {
  const ex = { id: '1', name: 'My name', url: 'https://a.devfolio.co', stage: 'registered', userEdited: ['name'] };
  const out = mergeHackathon(ex, { name: 'Captured', endTime: '2026-01-01T00:00:00Z', url: 'https://devfolio.co/hackathons/a', stage: 'discovered' });
  assert.equal(out.name, 'My name');
  assert.equal(out.stage, 'registered');
  assert.equal(out.endTime, '2026-01-01T00:00:00Z');
  assert.deepEqual(out.altUrls, ['https://devfolio.co/hackathons/a']);
});

test('toIso handles formats', () => {
  assert.equal(toIso(1767225600), '2026-01-01T00:00:00.000Z');
  assert.equal(toIso('garbage'), null);
  assert.ok(toIso('2026-03-05 10:00:00'));
});

test('generic extraction from a custom hackathon website', () => {
  const html = `<html><head><title>BuildFest 2026 | Official</title>
  <meta property="og:description" content="A 36h hackathon in Bengaluru">
  </head><body><h1>BuildFest</h1>
  <p>Registrations close on March 5, 2026 at 11:59 PM</p>
  <p>Project submission deadline: 8th March 2026</p>
  <p>Hacking starts March 7, 2026 10:00 AM. In-person at IISc.</p></body></html>`;
  const d = extractHackathon(collectFromHtml(html, 'https://buildfest.dev/register'));
  assert.equal(d.name, 'BuildFest 2026');
  assert.equal(d.key, 'web:buildfest.dev');
  assert.equal(new Date(d.registrationDeadline).getDate(), 5);
  assert.equal(new Date(d.registrationDeadline).getHours(), 23);
  assert.equal(new Date(d.submissionDeadline).getDate(), 8);
  assert.equal(new Date(d.startTime).getHours(), 10);
  assert.equal(d.mode, 'offline');
  assert.equal(d.looksLikeHackathon, true);
});

test('JSON-LD wins', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Event","name":"HackX","startDate":"2026-05-01T09:00:00Z","endDate":"2026-05-03T18:00:00Z","eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode"}]}</script>`;
  const d = extractHackathon(collectFromHtml(html, 'https://hackx.io'));
  assert.equal(d.name, 'HackX');
  assert.equal(d.endTime, '2026-05-03T18:00:00.000Z');
  assert.equal(d.mode, 'online');
});

test('date range without keywords', () => {
  const r = findKeywordDates('When: March 5, 2026 - March 7, 2026');
  assert.ok(r.start && r.end);
});
