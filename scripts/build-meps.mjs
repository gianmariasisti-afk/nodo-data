/* MEP directory updater.
   Source: European Parliament Open Data Portal API v2 (CC BY 4.0). The EP website itself blocks GitHub runners; the API does not.
   - GET /meps/show-current gives the sitting MEPs with country and political group.
   - GET /meps/<id> gives names, email, homepage and memberships (committees, delegations, national party).
   Compared with v1/meps.json:
   - small changes go straight into v1/meps.json: committee and delegation seats and roles, national party, email, homepage, names;
   - structural changes wait for review: an MEP arriving or leaving, a change of political group, or a member losing every
     committee seat at once. They go to data-cache/meps-structural.json, with the full proposal in data-cache/meps-proposed.json,
     for the workflow to put on a review branch.
   data-cache/meps-report.json records what the run checked, so the health status knows the directory was verified today.
   Photos, `hi` and socials of existing MEPs are never touched. A new MEP arrives without a photo (the EP photo server blocks
   runners); a session with a browser adds it.
   Environment: REPORT_ONLY=1 writes only the report. MEPS_JSON / OUT_DIR override paths (tests). EP_API overrides the API base. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const NAME_ORDER = new Intl.Collator("en", { sensitivity: "base", ignorePunctuation: true });
const byName = (a, b) => NAME_ORDER.compare(a.family || a.name || "", b.family || b.name || "") || NAME_ORDER.compare(a.given || "", b.given || "") || String(a.id).localeCompare(String(b.id));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.EP_API || "https://data.europarl.europa.eu/api/v2";
const J = "format=application%2Fld%2Bjson";
const UA = "nodo-prd-1.0";
const GAP_MS = Number(process.env.GAP_MS || 650);
const REPORT_ONLY = process.env.REPORT_ONLY === "1";
const MEPS_JSON = process.env.MEPS_JSON || path.join(ROOT, "v1", "meps.json");
const CACHE = process.env.OUT_DIR || path.join(ROOT, "data-cache");
const MANIFEST = path.join(path.dirname(MEPS_JSON), "manifest.json");

/* Kept although the API does not list them, by decision. */
export const NOT_IN_API = {
  "202352": "Antoni Comín i Oliveres: seat not taken up in Parliament records; listed in nodo by decision (2 Oct 2026)",
};
/* API group labels (some French acronyms) to the labels nodo uses. */
export const GROUP = { PPE: "EPP", "Verts/ALE": "Greens/EFA", "GUE/NGL": "The Left", ID: "PfE", "NA": "NI" };
export const ROLE = { MEMBER: "Member", MEMBER_SUBSTITUTE: "Substitute", CHAIR: "Chair", CHAIR_VICE: "Vice Chair", CHAIR_CO: "Co-Chair" };
const SOCIAL = { TWT: "x", YTB: "youtube" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return d; } };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const last = (s) => String(s || "").split("/").pop();
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const today = () => new Date().toISOString().slice(0, 10);

let lastCall = 0;
async function getJson(p) {
  for (let a = 0; a < 5; a++) {
    const wait = lastCall + GAP_MS - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now();
    try {
      const r = await fetch(API + p, { headers: { "User-Agent": UA, Accept: "application/ld+json" } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status} ${p}`);
    } catch (e) { if (a === 4) throw e; }
    await sleep(3000 * 2 ** a);
  }
  throw new Error("gave up " + p);
}
async function listAll(p) {
  const out = [];
  for (let off = 0; off < 5000; off += 500) {
    const j = await getJson(`${p}?${J}&offset=${off}&limit=500`); const d = (j && j.data) || [];
    out.push(...d); if (d.length < 500) break;
  }
  return out;
}

/* ---------- pure parts (tested) ---------- */
export const isCurrent = (m, day) => { const p = m.memberDuring || {}; return (!p.startDate || p.startDate <= day) && (!p.endDate || p.endDate >= day); };
export const kindOf = (cls) => {
  const c = last(cls);
  if (/^DELEGATION_/.test(c) || c === "COMMITTEE_PARLIAMENTARY_JOINT") return "delegation";
  if (/^COMMITTEE_PARLIAMENTARY_/.test(c)) return "committee";
  if (c === "NATIONAL_POLITICAL_GROUP") return "party";
  return "";
};
/* committee name: the one nodo already uses for that abbreviation, else built from the API's English label */
export function committeeName(abbr, cls, en, known) {
  if (known[abbr]) return known[abbr];
  const c = last(cls);
  const base = en || abbr;
  return c === "COMMITTEE_PARLIAMENTARY_TEMPORARY" || c === "COMMITTEE_PARLIAMENTARY_SPECIAL" ? `Special Committee on ${base}` : c === "COMMITTEE_PARLIAMENTARY_SUB" ? `Subcommittee on ${base}` : `Committee on ${base}`;
}
/* Seats from the API, in nodo's shape. orgs: id -> { label, cls, en } */
export function seats(detail, orgs, known, day) {
  const committees = [], delegations = [], parties = [];
  for (const m of arr(detail.hasMembership)) {
    if (!isCurrent(m, day)) continue;
    const o = orgs[last(m.organization)] || {}; const kind = kindOf(m.membershipClassification || o.cls);
    const role = ROLE[last(m.role)];
    if (kind === "party") { if (o.label && o.label !== "-") parties.push({ label: o.label, start: (m.memberDuring || {}).startDate || "" }); continue; }
    if (!role || !o.label) continue;
    if (kind === "committee") committees.push({ name: committeeName(o.label, m.membershipClassification || o.cls, o.en, known), abbr: o.label, role });
    else if (kind === "delegation") delegations.push({ name: o.label, abbr: "", role });
  }
  /* the most recent national party; "-" (no party recorded) is ignored */
  const party = parties.sort((a, b) => b.start.localeCompare(a.start))[0]?.label || "";
  return { committees: dedupe(committees, (x) => x.abbr), delegations: dedupe(delegations, (x) => x.name), party };
}
function dedupe(list, key) { const rank = { Chair: 4, "Co-Chair": 3, "Vice Chair": 2, Member: 1, Substitute: 0 }; const by = new Map(); for (const x of list) { const k = key(x), p = by.get(k); if (!p || (rank[x.role] ?? 0) > (rank[p.role] ?? 0)) by.set(k, x); } return [...by.values()]; }
/* keep the existing order for seats that did not change, so an unchanged MEP gives an identical record */
export function mergeSeats(prev, next, key) {
  const sig = (x) => key(x) + "|" + x.role;
  const nextSig = new Set(next.map(sig)), prevSig = new Set(prev.map(sig));
  if (prev.length === next.length && next.every((x) => prevSig.has(sig(x)))) return { list: prev, changed: false };
  return { list: [...prev.filter((x) => nextSig.has(sig(x))), ...next.filter((x) => !prevSig.has(sig(x)))], changed: true };
}
/* email and homepage can be lists: keep nodo's value while the API still lists it, else take the first */
export const pickOne = (list, prev) => { const xs = arr(list).map((x) => String(x || "").replace(/^mailto:/i, "").trim()).filter(Boolean); return prev && xs.includes(prev) ? prev : xs[0] || ""; };
export function socialsOf(detail) {
  const s = {};
  for (const a of arr(detail.account)) { const k = SOCIAL[last(a.dcterms_type)]; if (k && a.id && !s[k]) s[k] = a.id; }
  return s;
}
export function newRecord(cur, detail, st) {
  return {
    id: String(cur.identifier), name: cur.label, given: cur.givenName || detail.givenName || "", family: cur.familyName || detail.familyName || "",
    country: cur["api:country-of-representation"] || "", group: GROUP[cur["api:political-group"]] || cur["api:political-group"] || "", party: st.party,
    email: pickOne(detail.hasEmail), hi: null, photo: "", homepage: pickOne(detail.homepage), socials: socialsOf(detail),
    committees: st.committees, delegations: st.delegations, profile: `https://www.europarl.europa.eu/meps/en/${cur.identifier}`,
  };
}
/* Compare one MEP. Returns the record to publish now, the record to propose, and what changed. */
export function compare(prev, cur, detail, st) {
  const auto = {}, structural = [];
  const next = { ...prev };
  const group = GROUP[cur["api:political-group"]] || cur["api:political-group"] || prev.group;
  const c = mergeSeats(prev.committees || [], st.committees, (x) => x.abbr);
  const d = mergeSeats(prev.delegations || [], st.delegations, (x) => x.name);
  if (c.changed && !st.committees.length && (prev.committees || []).length) structural.push({ type: "all-committees-gone", from: prev.committees.map((x) => x.abbr) });
  else if (c.changed) { next.committees = c.list; auto.committees = { from: (prev.committees || []).map((x) => `${x.abbr} ${x.role}`), to: c.list.map((x) => `${x.abbr} ${x.role}`) }; }
  if (d.changed) { next.delegations = d.list; auto.delegations = { from: (prev.delegations || []).map((x) => `${x.name} ${x.role}`), to: d.list.map((x) => `${x.name} ${x.role}`) }; }
  const fields = { party: st.party, email: pickOne(detail.hasEmail, prev.email), homepage: pickOne(detail.homepage, prev.homepage), name: cur.label, given: cur.givenName, family: cur.familyName };
  for (const [k, v] of Object.entries(fields)) if (v && v !== prev[k]) { auto[k] = { from: prev[k], to: v }; next[k] = v; }
  const proposed = { ...next };
  if (group && group !== prev.group) { structural.push({ type: "group", from: prev.group, to: group }); proposed.group = group; }
  if (structural.some((s) => s.type === "all-committees-gone")) proposed.committees = st.committees;
  return { next, proposed, auto, structural };
}

/* ---------- run ---------- */
async function main() {
  const file = await readJson(MEPS_JSON, null);
  if (!file || !Array.isArray(file.meps)) throw new Error("v1/meps.json missing");
  const day = today();
  const known = {}; file.meps.forEach((m) => (m.committees || []).forEach((c) => { if (c.abbr && c.name) known[c.abbr] = c.name; }));
  const byId = new Map(file.meps.map((m) => [String(m.id), m]));

  const current = await listAll("/meps/show-current");
  if (current.length < 690 || current.length > 730) throw new Error(`show-current returned ${current.length} MEPs; expected about 720. Nothing changed.`);
  const orgs = {};
  for (const o of await listAll("/corporate-bodies/show-current")) orgs[String(o.identifier)] = { label: o.label || "", cls: o.classification || "" };

  const report = { run: new Date().toISOString(), checked: day, api: current.length, nodo: file.meps.length, failed: [], auto: [], structural: [] };
  const nextById = new Map(), proposedById = new Map();
  let failures = 0, autoCount = 0;
  for (const cur of current) {
    const id = String(cur.identifier);
    let detail;
    try { detail = ((await getJson(`/meps/${id}?${J}`)) || {}).data?.[0]; } catch (e) { detail = null; }
    if (!detail) { failures++; report.failed.push(id); if (byId.has(id)) { nextById.set(id, byId.get(id)); proposedById.set(id, byId.get(id)); } continue; }
    /* organisations missing from the bulk list (or committees needing an English name) are looked up once */
    for (const m of arr(detail.hasMembership)) {
      if (!isCurrent(m, day)) continue;
      const oid = last(m.organization), o = orgs[oid];
      const needEn = kindOf(m.membershipClassification) === "committee" && o && o.label && !known[o.label] && o.en === undefined;
      if (o && o.label && !needEn) continue;
      try { const od = ((await getJson(`/corporate-bodies/${oid}?${J}`)) || {}).data?.[0] || {}; orgs[oid] = { label: od.label || (o && o.label) || "", cls: od.classification || (o && o.cls) || "", en: (od.altLabel || {}).en || "" }; } catch { orgs[oid] = o || { label: "", cls: "" }; }
    }
    const st = seats(detail, orgs, known, day);
    const prev = byId.get(id);
    if (!prev) {
      const rec = newRecord(cur, detail, st);
      report.structural.push({ type: "arrived", id, name: rec.name, country: rec.country, group: rec.group, party: rec.party, committees: rec.committees.map((c) => `${c.abbr} ${c.role}`), note: "no photo yet" });
      proposedById.set(id, rec);
      continue;
    }
    const r = compare(prev, cur, detail, st);
    nextById.set(id, r.next); proposedById.set(id, r.proposed);
    if (Object.keys(r.auto).length) { autoCount++; report.auto.push({ id, name: prev.name, changes: r.auto }); }
    for (const s of r.structural) report.structural.push({ ...s, id, name: prev.name });
  }
  if (failures > 20) throw new Error(`${failures} MEP records could not be read; nothing changed.`);
  const apiIds = new Set(current.map((c) => String(c.identifier)));
  for (const m of file.meps) {
    const id = String(m.id);
    if (apiIds.has(id)) continue;
    if (NOT_IN_API[id]) { nextById.set(id, m); proposedById.set(id, m); continue; }
    report.structural.push({ type: "left", id, name: m.name, country: m.country, group: m.group });
    nextById.set(id, m); /* stays published until the review is merged */
  }
  /* A mass change (for example the mid-term reshuffle) goes to review as a whole. */
  if (autoCount > 150) { report.structural.push({ type: "mass-change", count: autoCount, note: "more than 150 MEP records changed in one run; held for review" }); for (const a of report.auto) nextById.set(a.id, byId.get(a.id)); }

  /* Alphabetical by family name, then given name, ignoring accents and case, so arrivals take their place in the
     list instead of landing at the end (27 Oct 2026). The app sorts the same way. */
  const order = file.meps.map((m) => String(m.id));
  const build = (map, withNew) => { const ids = [...order.filter((id) => map.has(id)), ...(withNew ? [...map.keys()].filter((id) => !byId.has(id)) : [])]; const meps = ids.map((id) => map.get(id)).sort(byName); return { ...file, generated: new Date().toISOString(), count: meps.length, meps }; };
  const next = build(nextById, false);
  const changed = JSON.stringify(next.meps) !== JSON.stringify(file.meps);
  report.summary = { auto: report.auto.length, structural: report.structural.length, failed: failures, changed };
  report.auto = report.auto.slice(0, 120);
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(path.join(CACHE, "meps-report.json"), JSON.stringify(report, null, 1) + "\n");
  if (!REPORT_ONLY) {
    if (changed && autoCount <= 150) {
      const buf = Buffer.from(JSON.stringify(next));
      await fs.writeFile(MEPS_JSON, buf);
      const man = await readJson(MANIFEST, null);
      if (man && man.files && man.files.meps) { man.files.meps = { ...man.files.meps, bytes: buf.length, sha256: sha(buf) }; man.generated = new Date().toISOString(); await fs.writeFile(MANIFEST, JSON.stringify(man, null, 1) + "\n"); }
    }
    const structuralFile = path.join(CACHE, "meps-structural.json"), proposedFile = path.join(CACHE, "meps-proposed.json");
    if (report.structural.length) {
      /* the proposal applies everything: the published state plus the structural changes; departures are removed */
      for (const s of report.structural) if (s.type === "left") proposedById.delete(s.id);
      await fs.writeFile(structuralFile, JSON.stringify({ at: day, changes: report.structural }, null, 1) + "\n");
      await fs.writeFile(proposedFile, JSON.stringify(build(proposedById, true)));
    } else { await fs.rm(structuralFile, { force: true }); await fs.rm(proposedFile, { force: true }); }
  }
  console.log(JSON.stringify({ api: current.length, nodo: file.meps.length, ...report.summary, structural: report.structural.map((s) => `${s.type} ${s.name || ""}`) }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
