import test from 'node:test';
import assert from 'node:assert/strict';
import { planFor, brussels, isMove, weekSteps, prefsOf } from '../../supabase/functions/push-send/plan.js';

const fileBy = {
  de: { id: 'de', short: 'Digital euro', next: [] },
  mff: { id: 'mff', short: 'MFF 2028–2034', next: [{ date: '2026-11-18', what: 'ECOFIN Council' }] },
  co2: { id: 'co2', short: 'CO2 cars', next: [{ date: '2026-11-17', what: 'ENVI vote' }, { date: '2026-12-01', what: 'Plenary vote' }] },
};
const body = (extra = {}) => ({ follow: ['de', 'mff', 'co2'], profile: { notify: {} }, lists: {}, ...extra });
// Tue 17 Nov 2026 08:30 Brussels = 07:30 UTC
const TUE_830 = '2026-11-17T07:30:00Z';
const TUE_1430 = '2026-11-17T13:30:00Z';
const MON_830 = '2026-11-16T07:30:00Z';
const seen = '2026-11-17T06:00:00Z';

const shadow = { id: 'mff:p1', fileId: 'mff', kind: 'people', title: 'Shadow rapporteur recorded', personId: '1', firstSeen: seen };
const shadow2 = { id: 'mff:p2', fileId: 'mff', kind: 'people', title: 'Shadow rapporteur recorded', personId: '2', firstSeen: seen };
const press = { id: 'press:x', fileId: 'co2', kind: 'press', title: 'Something', firstSeen: seen };
const vote = { id: 'de:vote', fileId: 'de', kind: 'milestone', title: 'Plenary vote', date: '2026-11-16', firstSeen: seen };

test('brussels time across seasons', () => {
  assert.deepEqual(brussels('2026-11-17T07:30:00Z'), { date: '2026-11-17', hour: 8, dow: 2 });
  assert.equal(brussels('2026-06-16T06:30:00Z').hour, 8);
  assert.equal(brussels('2026-11-21T09:00:00Z').dow, 6);
});

test('move classification', () => {
  assert.ok(isMove(vote));
  assert.ok(isMove({ kind: 'milestone', title: 'Stage change: committee to trilogue' }));
  assert.ok(!isMove({ kind: 'milestone', title: 'Draft report tabled' }));
  assert.ok(!isMove({ kind: 'milestone', title: 'Trilogue' }));
});

test('roundup groups by file', () => {
  const m = planFor({ now: TUE_830, body: body(), updates: [shadow, shadow2, press], scheduled: [], fileBy, sent: [] });
  assert.equal(m.kind, 'day');
  assert.equal(m.title, '3 updates on your files');
  assert.match(m.body, /^MFF 2028–2034: 2 new shadow rapporteurs\. CO2 cars: 1 new development\.$/);
  assert.deepEqual(m.event_ids.sort(), ['mff:p1', 'mff:p2', 'press:x']);
});

test('a file move replaces the roundup, single file wording', () => {
  const m = planFor({ now: TUE_830, body: body(), updates: [shadow, vote], scheduled: [], fileBy, sent: [] });
  assert.equal(m.kind, 'move');
  assert.equal(m.title, 'Digital euro · Plenary vote');
  assert.deepEqual(m.event_ids, ['de:vote']);
});

test('moves go out during the day, roundups only in the morning', () => {
  assert.equal(planFor({ now: TUE_1430, body: body(), updates: [shadow], scheduled: [], fileBy, sent: [] }), null);
  assert.equal(planFor({ now: TUE_1430, body: body(), updates: [vote], scheduled: [], fileBy, sent: [] }).kind, 'move');
});

test('one a day, never the same update twice', () => {
  const sent = [{ sent_at: '2026-11-17T07:30:05Z', kind: 'day', event_ids: ['mff:p1'] }];
  assert.equal(planFor({ now: TUE_1430, body: body(), updates: [vote], scheduled: [], fileBy, sent }), null);
  const wed = planFor({ now: '2026-11-18T07:30:00Z', body: body(), updates: [shadow, shadow2, vote], scheduled: [], fileBy, sent });
  assert.equal(wed.kind, 'move');
  const sent2 = [...sent, { sent_at: '2026-11-18T07:30:05Z', kind: 'move', event_ids: ['de:vote'] }];
  const thu = planFor({ now: '2026-11-19T07:30:00Z', body: body(), updates: [shadow, shadow2, vote], scheduled: [], fileBy, sent: sent2 });
  assert.equal(thu.kind, 'day');
  assert.deepEqual(thu.event_ids, ['mff:p2']);
});

test('a test send does not use up the day', () => {
  const sent = [{ sent_at: '2026-11-17T07:00:00Z', kind: 'test', event_ids: [] }];
  assert.equal(planFor({ now: TUE_830, body: body(), updates: [shadow], scheduled: [], fileBy, sent }).kind, 'day');
});

test('weekends, nights and early mornings stay quiet', () => {
  assert.equal(planFor({ now: '2026-11-21T09:00:00Z', body: body(), updates: [vote], scheduled: [], fileBy, sent: [] }), null);
  assert.equal(planFor({ now: '2026-11-17T18:30:00Z', body: body(), updates: [vote], scheduled: [], fileBy, sent: [] }), null);
  assert.equal(planFor({ now: '2026-11-17T06:30:00Z', body: body(), updates: [vote], scheduled: [], fileBy, sent: [] }), null);
});

test('Monday: week ahead takes the roundup slot', () => {
  const m = planFor({ now: MON_830, body: body(), updates: [shadow], scheduled: [{ id: 's', fileId: 'de', kind: 'scheduled', date: '2026-11-19', title: 'Coreper' }], fileBy, sent: [] });
  assert.equal(m.kind, 'week');
  assert.equal(m.title, 'Your week: 3 steps on 3 files');
  assert.equal(m.body, 'Tue CO2 cars: ENVI vote. Wed MFF 2028–2034: ECOFIN Council. Thu Digital euro: Coreper.');
  assert.deepEqual(m.event_ids, []);
});

test('Monday with no step: the roundup goes out', () => {
  const fb = { mff: { id: 'mff', short: 'MFF', next: [] } };
  const m = planFor({ now: MON_830, body: body({ follow: ['mff'] }), updates: [shadow], scheduled: [], fileBy: fb, sent: [] });
  assert.equal(m.kind, 'day');
});

test('switches, muted files and hidden people', () => {
  const off = body({ profile: { notify: { pushMoves: false } } });
  const m = planFor({ now: TUE_830, body: off, updates: [vote, shadow], scheduled: [], fileBy, sent: [] });
  assert.equal(m.kind, 'day'); // the move rides in the roundup
  assert.equal(planFor({ now: TUE_1430, body: off, updates: [vote], scheduled: [], fileBy, sent: [] }), null);
  const muted = body({ profile: { notify: { pushMuted: ['de'] } } });
  assert.equal(planFor({ now: TUE_1430, body: muted, updates: [vote], scheduled: [], fileBy, sent: [] }), null);
  const hid = body({ lists: { mff: { add: [], rem: ['ep:1', 'ep:2'] } } });
  assert.equal(planFor({ now: TUE_830, body: hid, updates: [shadow, shadow2], scheduled: [], fileBy, sent: [] }), null);
  assert.equal(planFor({ now: TUE_830, body: body({ profile: { notify: { pushDaily: false } } }), updates: [shadow], scheduled: [], fileBy, sent: [] }), null);
  assert.deepEqual([...prefsOf({}).muted], []);
});

test('old and unfollowed updates are ignored', () => {
  const old = { ...shadow, firstSeen: '2026-11-01T06:00:00Z' };
  assert.equal(planFor({ now: TUE_830, body: body(), updates: [old], scheduled: [], fileBy, sent: [] }), null);
  assert.equal(planFor({ now: TUE_830, body: body({ follow: ['de'] }), updates: [shadow], scheduled: [], fileBy, sent: [] }), null);
});

test('several files moved', () => {
  const v2 = { id: 'co2:st', fileId: 'co2', kind: 'milestone', title: 'Stage change: committee to trilogue', firstSeen: seen };
  const m = planFor({ now: TUE_1430, body: body(), updates: [vote, v2], scheduled: [], fileBy, sent: [] });
  assert.equal(m.title, '2 of your files moved');
  assert.match(m.body, /Digital euro: Plenary vote\. CO2 cars: Moved to trilogue\./);
});

test('week steps dedupe and window', () => {
  const s = weekSteps([fileBy.co2], [{ fileId: 'co2', kind: 'scheduled', date: '2026-11-17', title: 'ENVI vote' }], '2026-11-16');
  assert.equal(s.length, 1);
});
