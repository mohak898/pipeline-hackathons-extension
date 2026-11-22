import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiResponse, parseDevpostRange, detectPlatform } from '../../background/network-rules.js';
import { parsePairing } from '../../utils/api.js';

test('devfolio: picks page hackathon, captures reg deadline', () => {
  const json = {
    hackathon: {
      name: 'ETHIndia 2026', slug: 'ethindia', starts_at: '2026-12-05T04:30:00Z', ends_at: '2026-12-07T10:30:00Z',
      is_online: false, location: 'Bengaluru', hackathon_setting: { reg_ends_at: '2026-11-25T18:29:00Z' },
    },
    related: [{ name: 'Other Hack', slug: 'otherhack', starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-12-02T00:00:00Z' }],
  };
  const d = parseApiResponse('devfolio', json, 'https://ethindia.devfolio.co/overview');
  assert.equal(d.name, 'ETHIndia 2026');
  assert.equal(d.registrationDeadline, '2026-11-25T18:29:00.000Z');
  assert.equal(d.mode, 'offline');
  assert.equal(d.location, 'Bengaluru');
});

test('devfolio: related-hackathons response is ignored', () => {
  const json = { result: [{ name: 'Other Hack', slug: 'otherhack', starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-12-02T00:00:00Z' }] };
  assert.equal(parseApiResponse('devfolio', json, 'https://ethindia.devfolio.co/'), null);
});

test('listing pages never produce a capture', () => {
  const json = { data: [{ name: 'A Hack', slug: 'a', starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-12-02T00:00:00Z' }] };
  assert.equal(parseApiResponse('devfolio', json, 'https://devfolio.co/hackathons'), null);
  assert.equal(parseApiResponse('unstop', { data: { data: [{ title: 'X', id: 1234567, end_date: '2026-12-01' }] } }, 'https://unstop.com/hackathons'), null);
});

test('unstop: listing-shaped response, picks by numeric id', () => {
  const json = {
    data: {
      data: [
        { id: 1111111, title: 'Wrong Hackathon', public_url: 'hackathons/wrong-hackathon-1111111', start_date: '2026-12-01T00:00:00+05:30', end_date: '2026-12-03T00:00:00+05:30' },
        {
          id: 1234567, title: 'Smart India Hackathon 2026', public_url: 'hackathons/smart-india-hackathon-2026-1234567',
          start_date: '2026-12-10T09:00:00+05:30', end_date: '2026-12-12T18:00:00+05:30', region: 'online',
          regnRequirements: { start_regn_dt: '2026-11-01T00:00:00+05:30', end_regn_dt: '2026-12-01T23:59:00+05:30' },
        },
      ],
    },
  };
  const d = parseApiResponse('unstop', json, 'https://unstop.com/hackathons/smart-india-hackathon-2026-1234567');
  assert.equal(d.name, 'Smart India Hackathon 2026');
  assert.equal(d.registrationDeadline, '2026-12-01T18:29:00.000Z');
  assert.equal(d.mode, 'online');
});

test('devpost: submission_period_dates range', () => {
  assert.deepEqual(Object.keys(parseDevpostRange('Oct 03 - Nov 25, 2026')), ['start', 'end']);
  const json = { hackathons: [
    { title: 'HackMIT 2026', url: 'https://hackmit.devpost.com/', submission_period_dates: 'Sep 12 - 14, 2026' },
    { title: 'TreeHacks', url: 'https://treehacks.devpost.com/', submission_period_dates: 'Feb 14 - 16, 2027' },
  ] };
  const d = parseApiResponse('devpost', json, 'https://hackmit.devpost.com/rules');
  assert.equal(d.name, 'HackMIT 2026');
  assert.equal(new Date(d.submissionDeadline).getDate(), 14);
  assert.equal(detectPlatform('https://x.devpost.com'), 'devpost');
  assert.equal(detectPlatform('https://myhack.io'), null);
});

test('pairing string parsing', () => {
  assert.deepEqual(parsePairing('https://app.example.com/#hpt_abc123.sEcr-et_9'), { apiBase: 'https://app.example.com', token: 'hpt_abc123.sEcr-et_9' });
  assert.deepEqual(parsePairing('app.example.com/w/xyz', 'hpt_a.b'), { apiBase: 'https://app.example.com', token: 'hpt_a.b' });
  assert.throws(() => parsePairing('hpt_a.b'));
  assert.throws(() => parsePairing('https://x.com#garbage'));
});
