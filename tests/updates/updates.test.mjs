import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, procedureId } from '../../scripts/build-updates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, 'fixtures');
const OMNI = 'digital-omnibus-data';
const MFF = 'mff-2028-2034';

async function workspace() {
  const dir = await mkdtemp(path.join(here, '.work-'));
  await cp(FIX, path.join(dir, 'fixtures'), { recursive: true });
  return {
    dir,
    files: path.join(dir, 'fixtures', 'nodo-files.json'),
    fixtures: path.join(dir, 'fixtures'),
    out: path.join(dir, 'out'),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const opts = (w, today) => ({ filesPath: w.files, outDir: w.out, fixturesDir: w.fixtures, today });
const readOut = async (w, name) => JSON.parse(await readFile(path.join(w.out, name), 'utf8'));

test('procedureId maps procedure labels and skips other references', () => {
  assert.equal(procedureId('2025/0360(COD)'), '2025-0360');
  assert.equal(procedureId('2025/0571(APP)'), '2025-0571');
  assert.equal(procedureId('COM(2026)100'), null);
  assert.equal(procedureId(null), null);
});

test('first run seeds history without push candidates and groups amendments', async () => {
  const w = await workspace();
  try {
    const r = await run(opts(w, '2026-10-06'));
    assert.equal(r.failures.length, 0);
    assert.equal(r.pushQueue.length, 0);

    const omni = r.timelines[OMNI];
    const amendments = omni.filter((e) => e.title === 'Amendments tabled in committee');
    assert.equal(amendments.length, 1);
    assert.equal(amendments[0].count, 9);
    assert.equal(amendments[0].date, '2026-07-27');
    assert.ok(omni.some((e) => e.title === 'Draft report tabled' && e.date === '2026-06-22'));
    assert.ok(omni.some((e) => e.title === 'Referred to committee'));
    assert.equal(omni.filter((e) => e.kind === 'people').length, 7);
    assert.ok(omni.every((e) => e.kind !== 'people' || e.push === false));

    const greens = omni.find((e) => e.personId === '197503' && e.date === '2026-07-13');
    assert.equal(greens.group, 'Greens/EFA');
    assert.equal(greens.title, 'Opinion shadow rapporteur recorded');

    const mff = r.timelines[MFF].filter((e) => e.source === 'ep');
    assert.equal(mff.length, 4);
    assert.ok(r.timelines['industrial-accelerator-act'].length === 0);
    assert.ok(r.timelines['digital-fairness-act'].length === 0);
  } finally { await w.cleanup(); }
});

test('updates.json keeps 90 days and upcoming dates; timelines keep full history', async () => {
  const w = await workspace();
  try {
    await run(opts(w, '2026-10-06'));
    const updates = await readOut(w, 'updates.json');
    const timelines = await readOut(w, 'timelines.json');
    assert.ok(!updates.events.some((e) => e.date === '2026-06-22'), '22 Jun is 106 days old');
    assert.ok(updates.events.some((e) => e.date === '2026-07-27'));
    assert.ok(updates.events.some((e) => e.kind === 'scheduled' && e.date === '2026-10-13'));
    assert.ok(timelines[OMNI].some((e) => e.date === '2026-06-22'));
  } finally { await w.cleanup(); }
});

test('second run with no changes produces nothing new', async () => {
  const w = await workspace();
  try {
    await run(opts(w, '2026-10-06'));
    const r = await run(opts(w, '2026-10-07'));
    assert.equal(r.newEvents, 0);
    assert.equal(r.pushQueue.length, 0);
  } finally { await w.cleanup(); }
});

test('a new milestone pushes; a late amendment on a known day updates the count without a push', async () => {
  const w = await workspace();
  try {
    await run(opts(w, '2026-10-06'));
    const p = path.join(w.fixtures, '2025-0360.json');
    const body = JSON.parse(await readFile(p, 'utf8'));
    const mk = (id, date) => ({ id: `eli/dl/event/${id}`, activity_date: date, activity_id: id, based_on_a_realization_of: [`eli/dl/doc/${id}`], had_activity_type: 'def/ep-activities/COMMITTEE_TABLING_AMENDMENT' });
    body.data[0].consists_of.push(mk('CJ72-AM-900001-DEPOT-2026-07-27', '2026-07-27'));
    body.data[0].consists_of.push(mk('CJ72-AM-900002-DEPOT-2026-10-08', '2026-10-08'));
    body.data[0].consists_of.push({ id: 'eli/dl/event/X-VOTE-2026-10-08', activity_date: '2026-10-08', activity_id: 'X-VOTE-2026-10-08', had_activity_type: 'def/ep-activities/SOMETHING_NEW' });
    await writeFile(p, JSON.stringify(body));

    const r = await run(opts(w, '2026-10-08'));
    assert.equal(r.pushQueue.length, 1);
    assert.equal(r.pushQueue[0].date, '2026-10-08');
    assert.equal(r.pushQueue[0].count, 1);
    const old = r.timelines[OMNI].find((e) => e.date === '2026-07-27' && e.count);
    assert.equal(old.count, 10);
    const unknown = r.timelines[OMNI].find((e) => e.id.endsWith('X-VOTE-2026-10-08'));
    assert.equal(unknown.push, false);
    assert.equal(unknown.title, 'Something new');
  } finally { await w.cleanup(); }
});

test('scheduled Council dates enter the push queue on the day only, once', async () => {
  const w = await workspace();
  try {
    await run(opts(w, '2026-10-06'));
    const day = await run(opts(w, '2026-10-13'));
    const titles = day.pushQueue.map((e) => e.title).sort();
    assert.equal(day.pushQueue.length, 2);
    assert.ok(titles.some((t) => t.startsWith('General Affairs Council: MFF')));
    assert.ok(titles.some((t) => t.startsWith('GAC: omnibus')));
    assert.ok(!titles.some((t) => t.startsWith('European Council')));
    const again = await run(opts(w, '2026-10-13'));
    assert.equal(again.pushQueue.length, 0);
  } finally { await w.cleanup(); }
});

test('a stage change produces one push candidate', async () => {
  const w = await workspace();
  try {
    await run(opts(w, '2026-10-06'));
    const body = JSON.parse(await readFile(w.files, 'utf8'));
    body.files.find((f) => f.id === MFF).stage = 'trilogue';
    await writeFile(w.files, JSON.stringify(body));
    const r = await run(opts(w, '2026-10-07'));
    assert.equal(r.pushQueue.length, 1);
    assert.equal(r.pushQueue[0].title, 'Stage change: council negotiating box to trilogue');
    const later = await run(opts(w, '2026-10-08'));
    assert.equal(later.pushQueue.length, 0);
    assert.ok(later.timelines[MFF].some((e) => e.id.includes(':stage:trilogue')));
  } finally { await w.cleanup(); }
});

test('a failed fetch keeps the previous timeline, reports the failure and sends no pushes', async () => {
  const w = await workspace();
  try {
    await run(opts(w, '2026-10-06'));
    await rm(path.join(w.fixtures, '2025-0360.json'));
    const r = await run(opts(w, '2026-10-07'));
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].fileId, OMNI);
    assert.equal(r.pushQueue.length, 0);
    assert.ok(r.timelines[OMNI].some((e) => e.title === 'Draft report tabled'));
  } finally { await w.cleanup(); }
});

test('a file whose first fetch fails stays unseeded, so its history never pushes later', async () => {
  const w = await workspace();
  try {
    await rm(path.join(w.fixtures, '2025-0360.json'));
    const first = await run(opts(w, '2026-10-06'));
    assert.equal(first.failures.length, 1);
    await cp(path.join(FIX, '2025-0360.json'), path.join(w.fixtures, '2025-0360.json'));
    const second = await run(opts(w, '2026-10-07'));
    assert.equal(second.failures.length, 0);
    assert.equal(second.pushQueue.length, 0);
    assert.ok(second.timelines[OMNI].length > 10);
  } finally { await w.cleanup(); }
});
