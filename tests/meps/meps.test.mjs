import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seats, compare, mergeSeats, pickOne, kindOf, isCurrent, newRecord, committeeName, GROUP } from '../../scripts/build-meps.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = async () => JSON.parse(await readFile(path.join(here, 'fixtures', 'protas.json'), 'utf8'));
const DAY = '2026-10-12';
const clone = (x) => JSON.parse(JSON.stringify(x));

test('seats from the API match the published record of an unchanged MEP', async () => {
  const f = await load();
  const st = seats(f.detail, f.orgs, f.known, DAY);
  const sig = (l) => l.map((x) => `${x.abbr || x.name} ${x.role}`).sort();
  assert.deepEqual(sig(st.committees), sig(f.prev.committees));
  assert.deepEqual(sig(st.delegations), sig(f.prev.delegations));
  assert.equal(st.party, 'KO');
  const r = compare(f.prev, f.cur, f.detail, st);
  assert.deepEqual(r.auto, {});
  assert.deepEqual(r.structural, []);
  assert.equal(r.next.committees, f.prev.committees, 'unchanged seats keep the same array and order');
  assert.equal(r.next.photo, f.prev.photo);
});

test('a new committee seat is applied directly; a group change waits for review', async () => {
  const f = await load();
  const st = seats(f.detail, f.orgs, f.known, DAY);
  st.committees.push({ name: 'Committee on Industry, Research and Energy', abbr: 'ITRE', role: 'Member' });
  const cur = { ...f.cur, 'api:political-group': 'Renew' };
  const r = compare(f.prev, cur, f.detail, st);
  assert.ok(r.auto.committees);
  assert.equal(r.next.committees.at(-1).abbr, 'ITRE');
  assert.equal(r.next.group, 'EPP');
  assert.deepEqual(r.structural, [{ type: 'group', from: 'EPP', to: 'Renew' }]);
  assert.equal(r.proposed.group, 'Renew');
});

test('losing every committee seat at once is held for review', async () => {
  const f = await load();
  const st = { ...seats(f.detail, f.orgs, f.known, DAY), committees: [] };
  const r = compare(f.prev, f.cur, f.detail, st);
  assert.equal(r.structural[0].type, 'all-committees-gone');
  assert.equal(r.next.committees.length, f.prev.committees.length);
  assert.equal(r.proposed.committees.length, 0);
});

test('ended memberships and "-" parties are ignored; the latest party wins', async () => {
  const f = await load();
  const d = clone(f.detail);
  d.hasMembership.push({ organization: 'org/9001', role: 'def/ep-roles/MEMBER', membershipClassification: 'def/ep-entities/NATIONAL_POLITICAL_GROUP', memberDuring: { startDate: '2026-09-01' } });
  d.hasMembership.push({ organization: 'org/6582', role: 'def/ep-roles/MEMBER', membershipClassification: 'def/ep-entities/COMMITTEE_PARLIAMENTARY_STANDING', memberDuring: { startDate: '2024-07-16', endDate: '2025-01-01' } });
  const orgs = { ...f.orgs, 9001: { label: '-', cls: 'def/ep-entities/NATIONAL_POLITICAL_GROUP' }, 6582: { label: 'AGRI', cls: 'def/ep-entities/COMMITTEE_PARLIAMENTARY_STANDING' } };
  const st = seats(d, orgs, f.known, DAY);
  assert.equal(st.party, 'KO');
  assert.ok(!st.committees.some((c) => c.abbr === 'AGRI'));
});

test('helpers', () => {
  assert.equal(pickOne(['mailto:a@ep.eu', 'mailto:b@ep.eu'], 'b@ep.eu'), 'b@ep.eu');
  assert.equal(pickOne(['mailto:a@ep.eu', 'mailto:b@ep.eu'], 'old@ep.eu'), 'a@ep.eu');
  assert.equal(pickOne(undefined, 'x'), '');
  assert.equal(kindOf('def/ep-entities/COMMITTEE_PARLIAMENTARY_STANDING'), 'committee');
  assert.equal(kindOf('def/ep-entities/DELEGATION_PARLIAMENTARY'), 'delegation');
  assert.equal(kindOf('def/ep-entities/COMMITTEE_PARLIAMENTARY_JOINT'), 'delegation');
  assert.equal(kindOf('def/ep-entities/EU_POLITICAL_GROUP'), '');
  assert.ok(isCurrent({ memberDuring: { startDate: '2024-07-16' } }, DAY));
  assert.ok(!isCurrent({ memberDuring: { startDate: '2024-07-16', endDate: '2025-07-14' } }, DAY));
  assert.equal(committeeName('XYZ', 'def/ep-entities/COMMITTEE_PARLIAMENTARY_TEMPORARY', 'Water', {}), 'Special Committee on Water');
  assert.equal(GROUP.PPE, 'EPP');
  const m = mergeSeats([{ abbr: 'A', role: 'Member' }, { abbr: 'B', role: 'Member' }], [{ abbr: 'B', role: 'Member' }, { abbr: 'A', role: 'Member' }], (x) => x.abbr);
  assert.equal(m.changed, false);
});

test('a new MEP gets a full record without a photo', async () => {
  const f = await load();
  const st = seats(f.detail, f.orgs, f.known, DAY);
  const rec = newRecord({ ...f.cur, identifier: '999999', label: 'Test PERSON' }, f.detail, st);
  assert.equal(rec.id, '999999');
  assert.equal(rec.group, 'EPP');
  assert.equal(rec.photo, '');
  assert.equal(rec.hi, null);
  assert.equal(rec.socials.x, 'https://x.com/jacek_protas');
  assert.equal(rec.profile, 'https://www.europarl.europa.eu/meps/en/999999');
});
