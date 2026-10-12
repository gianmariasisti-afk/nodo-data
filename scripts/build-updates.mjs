#!/usr/bin/env node
// nodo updates job (spec v0.1, with the changes listed in README.md)
//
// Reads nodo-files.json, fetches each file's procedure from the EP Open Data
// API, turns activity into events, diffs against state.json and writes:
//   updates.json     Latest feed: last 90 days, plus upcoming scheduled items
//   timelines.json   full history per file (feeds the file detail screen)
//   push-queue.json  push candidates for today (the sender applies user rules)
//   state.json       ids already seen, per-file seeding, last known stage
//
// Usage: node update-job.mjs --files nodo-files.json --out ./data [--state dir] [--today YYYY-MM-DD] [--fixtures dir]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const API = 'https://data.europarl.europa.eu/api/v2/procedures/';
const RETENTION_DAYS = 90;

const GROUPS = {
  PPE: 'EPP', 'S-D': 'S&D', RENEW: 'Renew', 'VERTS-ALE': 'Greens/EFA',
  ECR: 'ECR', PFE: 'PfE', ESN: 'ESN', 'THE-LEFT': 'The Left',
};

// EP activity types. `group` folds same-day events into one with a count; `skip` drops duplicates of another event.
const ACTIVITY = {
  REFERRAL: { kind: 'procedural', title: 'Referred to committee', push: false },
  COMMITTEE_TABLING_REPORT: { kind: 'milestone', title: 'Draft report tabled', push: true },
  COMMITTEE_TABLING_AMENDMENT: { kind: 'milestone', title: 'Amendments tabled in committee', push: true, group: 'amendments' },
  COMMITTEE_ADOPTING_OPINION: { kind: 'milestone', title: 'Committee opinions adopted', push: false, group: 'opinions' },
  COMMITTEE_ADOPTING_REPORT: { kind: 'milestone', title: 'Report adopted in committee', push: true },
  COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT: { kind: 'milestone', title: 'Committee endorsed the trilogue agreement', push: true },
  PLENARY_REFER_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS: { kind: 'milestone', title: 'Trilogue mandate confirmed in plenary', push: true },
  INTERINSTITUTIONAL_NEGOTIATION: { kind: 'milestone', title: 'Trilogue', push: true },
  TABLING_PLENARY: { kind: 'procedural', title: 'Report tabled for plenary', push: false, group: 'tabled' },
  PLENARY_DEBATE: { kind: 'milestone', title: 'Plenary debate', push: false },
  PLENARY_AMEND: { kind: 'procedural', title: 'Plenary amendments', push: false },
  PLENARY_VOTE: { kind: 'milestone', title: 'Plenary vote', push: true },
  PLENARY_VOTE_RESULTS: { skip: true },
  PLENARY_DECISION: { kind: 'procedural', title: 'Plenary decision', push: false, unlessSameDay: 'PLENARY_VOTE' },
  PLENARY_ADOPT_POSITION: { kind: 'milestone', title: 'Parliament adopted its position', push: true },
  SIGNATURE: { kind: 'milestone', title: 'Act signed', push: true },
  PUBLICATION_OFFICIAL_JOURNAL: { kind: 'milestone', title: 'Published in the Official Journal', push: true },
};

const PEOPLE = {
  RAPPORTEUR: 'Rapporteur named',
  RAPPORTEUR_CO: 'Co-rapporteur named',
  RAPPORTEUR_SHADOW: 'Shadow rapporteur recorded',
  RAPPORTEUR_OPINION: 'Opinion rapporteur named',
  RAPPORTEUR_SHADOW_OPINION: 'Opinion shadow rapporteur recorded',
};

const lastSeg = (v) => String(v ?? '').split('/').pop();
const sha = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 6);
const humanize = (s) => { const t = s.toLowerCase().replace(/_/g, ' '); return t[0].toUpperCase() + t.slice(1); };
const stageLabel = (s) => String(s).replace(/-/g, ' ');

// "2025/0360(COD)" -> "2025-0360"; an interim report such as "2025/0571R(APP)" -> "2025-0571R".
export function procedureId(label) {
  const m = /^(\d{4})\/(\d{4}[A-Z]?)\([A-Z]+\)$/.exec(label ?? '');
  return m ? `${m[1]}-${m[2]}` : null;
}

// Every EP procedure a file follows: `procedure`, then `procedures` and the parts' procedures. The first is the main one.
export function procedureIds(file) {
  const labels = [file.procedure, ...(file.procedures ?? []), ...(file.parts ?? []).map((p) => p.procedure)];
  return [...new Set(labels.map(procedureId).filter(Boolean))];
}

export function normaliseProcedure(file, proc, { pid = proc?.process_id, main = true } = {}) {
  const events = [];
  const groups = new Map();
  // Grouped events of the main procedure keep their original ids; other procedures add their id.
  const gid = (name, date) => (main ? `${file.id}:ep:${name}:${date}` : `${file.id}:ep:${pid}:${name}:${date}`);

  const typesOn = new Map();
  for (const a of proc.consists_of ?? []) typesOn.set(`${a.activity_date}|${lastSeg(a.had_activity_type)}`, true);

  for (const a of proc.consists_of ?? []) {
    const date = a.activity_date;
    if (!date) continue;
    const type = lastSeg(a.had_activity_type);
    const rule = ACTIVITY[type] ?? { kind: 'procedural', title: humanize(type || 'activity'), push: false };
    if (rule.skip || (rule.unlessSameDay && typesOn.has(`${date}|${rule.unlessSameDay}`))) continue;
    if (rule.group) {
      const k = `${rule.group}|${date}`;
      const g = groups.get(k) ?? { rule, date, count: 0 };
      g.count++; groups.set(k, g);
      continue;
    }
    events.push({
      id: `${file.id}:ep:${a.activity_id ?? lastSeg(a.id)}`,
      fileId: file.id, date, source: 'ep', proc: pid, kind: rule.kind, title: rule.title, push: rule.push,
      ref: lastSeg((a.based_on_a_realization_of ?? [])[0]) || undefined,
    });
  }

  for (const { rule, date, count } of groups.values()) {
    events.push({
      id: gid(rule.group, date),
      fileId: file.id, date, source: 'ep', proc: pid, kind: rule.kind,
      title: rule.title, count, push: rule.push,
    });
  }

  for (const p of proc.had_participation ?? []) {
    const person = p.had_participant_person?.[0];
    if (!p.activity_date || !person) continue;
    const title = PEOPLE[lastSeg(p.participation_role)];
    if (!title) continue;
    events.push({
      id: `${file.id}:ep:${lastSeg(p.id)}`,
      fileId: file.id, date: p.activity_date, source: 'ep', proc: pid, kind: 'people', title,
      personId: lastSeg(person),
      group: GROUPS[lastSeg(p.politicalGroup)] ?? undefined,
      committee: p.participation_in_name_of ? lastSeg(p.participation_in_name_of) : undefined,
      push: false,
    });
  }
  return events;
}

export function nodoEvents(file) {
  return (file.next ?? [])
    .filter((n) => n.date)
    .map((n) => ({
      id: `${file.id}:next:${n.date}:${sha(n.what)}`,
      fileId: file.id, date: n.date, source: 'nodo', kind: 'scheduled', title: n.what,
      push: true, pushOn: n.date,
    }));
}

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function loadProcedure(id, { fixturesDir, fetchImpl, retryDelay = 5000 }) {
  let body;
  if (fixturesDir) {
    body = JSON.parse(await readFile(path.join(fixturesDir, `${id}.json`), 'utf8'));
  } else {
    // The EP API sometimes answers 500 or times out once; three tries, 5 and 15 seconds apart, before giving up.
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(`${API}${id}?format=application%2Fld%2Bjson`, {
          headers: { accept: 'application/ld+json' },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${id}`), { retry: res.status === 429 || res.status >= 500 });
        body = await res.json();
        break;
      } catch (e) {
        const retry = e.retry ?? true;
        if (!retry || attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, retryDelay * (attempt === 0 ? 1 : 3)));
      }
    }
  }
  const proc = body?.data?.[0];
  if (!proc || proc.process_id !== id) throw new Error(`Unexpected response for ${id}`);
  return proc;
}

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export async function run({ filesPath, outDir, stateDir = outDir, fixturesDir, today, fetchImpl = globalThis.fetch, retryDelay = 5000 }) {
  const files = (JSON.parse(await readFile(filesPath, 'utf8'))).files;
  await mkdir(outDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const state = await readJson(path.join(stateDir, 'state.json'), { seen: {}, seeded: {}, stages: {}, pushed: {} });
  state.pushed ??= {};
  // A procedure seen for the first time (a file gains a related procedure) seeds its history without pushes.
  state.seededProcs ??= {};
  const prevTimelines = await readJson(path.join(outDir, 'timelines.json'), {});

  const timelines = {};
  const failures = [];
  const pushQueue = [];
  let newEvents = 0;

  for (const file of files) {
    const prev = prevTimelines[file.id] ?? [];
    const pids = procedureIds(file);
    let ep = [];
    let fetched = true;
    const fetchedPids = [];

    for (const [i, pid] of pids.entries()) {
      try {
        ep.push(...normaliseProcedure(file, await loadProcedure(pid, { fixturesDir, fetchImpl, retryDelay }), { pid, main: i === 0 }));
        fetchedPids.push(pid);
      } catch (e) {
        fetched = false;
        failures.push({ fileId: file.id, procedure: pid, error: String(e.message ?? e) });
        // keep what this procedure showed before (events written before procedures were tagged belong to the main one)
        ep.push(...prev.filter((x) => x.source === 'ep' && (x.proc ? x.proc === pid : i === 0)));
      }
    }

    const stageEvents = prev.filter((x) => x.id.includes(':stage:'));
    const lastStage = state.stages[file.id];
    if (lastStage && lastStage !== file.stage) {
      stageEvents.push({
        id: `${file.id}:stage:${file.stage}`,
        fileId: file.id, date: today, source: 'nodo', kind: 'milestone',
        title: `Stage change: ${stageLabel(lastStage)} to ${stageLabel(file.stage)}`, push: true,
      });
    }

    const events = [...ep, ...nodoEvents(file), ...stageEvents];
    const unique = [...new Map(events.map((e) => [e.id, e])).values()].sort(byDateDesc);
    timelines[file.id] = unique;

    const firstRun = !state.seeded[file.id];
    for (const e of unique) {
      if (!state.seen[e.id]) {
        state.seen[e.id] = true;
        newEvents++;
        const newProc = e.source === 'ep' && e.proc && !state.seededProcs[e.proc];
        if (!firstRun && !newProc && e.push && e.kind !== 'scheduled') pushQueue.push({ ...e });
      }
      if (e.kind === 'scheduled' && e.pushOn === today && !state.pushed[e.id]) {
        state.pushed[e.id] = true;
        pushQueue.push({ ...e });
      }
    }

    for (const pid of fetchedPids) state.seededProcs[pid] = true;
    if (fetched) {
      state.seeded[file.id] = true;
      state.stages[file.id] = file.stage;
    }
  }

  const cutoff = addDays(today, -RETENTION_DAYS);
  const updates = Object.values(timelines).flat()
    .filter((e) => e.date >= cutoff || (e.kind === 'scheduled' && e.date >= today))
    .sort(byDateDesc);

  const generatedAt = `${today}T00:00:00Z`;
  const write = (name, obj) => writeFile(path.join(outDir, name), JSON.stringify(obj, null, 2) + '\n');
  await write('updates.json', { generatedAt, events: updates });
  await write('timelines.json', timelines);
  await write('push-queue.json', { generatedAt, events: pushQueue });
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2) + '\n');

  return { newEvents, pushQueue, failures, updates, timelines };
}

async function registerManifest(manifestPath, outDir) {
  const man = await readJson(manifestPath, null);
  if (!man || !man.files) return;
  const buf = await readFile(path.join(outDir, 'updates.json'));
  man.files.updates = {
    ...(man.files.updates || {}),
    path: 'updates/updates.json',
    description: 'Update stream for priority files: EP procedure events, Council dates, stage changes (also timelines.json and push-queue.json in the same folder)',
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
  man.generated = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(man, null, 1) + '\n');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const result = await run({
    filesPath: a.files ?? 'nodo-files.json',
    outDir: a.out ?? './data',
    stateDir: a.state ?? a.out ?? './data',
    fixturesDir: a.fixtures,
    today: a.today ?? new Date().toISOString().slice(0, 10),
  });
  if (a.manifest) await registerManifest(a.manifest, a.out ?? './data');
  console.log(`new events: ${result.newEvents}, push candidates: ${result.pushQueue.length}, failures: ${result.failures.length}`);
  for (const f of result.failures) console.error(`FAILED ${f.fileId} (${f.procedure}): ${f.error}`);
  process.exitCode = result.failures.length ? 2 : 0;
}
