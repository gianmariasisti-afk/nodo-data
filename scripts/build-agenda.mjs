/* Plenary agenda builder.
   Source: EP Open Data Portal API v2 (the EP website sits behind a bot check that blocks GitHub runners, the API does not).
   For every sitting day of the next plenary session(s), GET /meetings/MTG-PL-<day>/foreseen-activities returns the time slots
   (MEETING_PART) and the agenda items (…-OJ-ITM-…) with title, type, documents and creators (rapporteurs with their MEP id).
   Output: v1/agenda.json (same shape as before), data-cache/agenda-notify.json (pending push notifications),
   data-cache/agenda-probe.json (what the run saw, for diagnosis), data-cache/agenda-unmatched.json (rapporteur ids missing from meps.json). */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1");
const CACHE = path.join(ROOT, "data-cache");
const API = process.env.EP_API || "https://data.europarl.europa.eu/api/v2";
const PAGE = "https://www.europarl.europa.eu/plenary/en/agendas.html";
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 21);
const UA = "nodo-prd-1.0";

const readJson = async (p, d) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return d; } };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const iso = (d) => d.toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMMITTEES = new Set("AFET DEVE INTA BUDG CONT ECON EMPL ENVI SANT ITRE IMCO TRAN REGI AGRI PECH CULT JURI LIBE AFCO FEMM PETI SEDE DROI".split(" "));

async function getJson(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/ld+json, application/json" } });
      if (r.status === 404 || r.status === 204) return { status: r.status, data: [] };
      if (r.ok) { const t = await r.text(); try { const j = JSON.parse(t); return { status: r.status, data: j.data || [] }; } catch { /* retry */ } }
      else if (r.status !== 429 && r.status < 500) return { status: r.status, data: [] };
    } catch { /* retry */ }
    await sleep(2000 * (a + 1));
  }
  return { status: 0, data: [], failed: true };
}
async function dayActivities(day) {
  const out = []; let status = 0;
  for (let off = 0; off < 1000; off += 200) {
    const r = await getJson(`${API}/meetings/MTG-PL-${day}/foreseen-activities?format=application%2Fld%2Bjson&limit=200&offset=${off}`);
    status = r.status;
    if (r.failed) return { status, items: out, failed: true };
    out.push(...r.data);
    if (r.data.length < 200) break;
    await sleep(700);
  }
  return { status, items: out };
}

/* ---------- parsing ---------- */
const en = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v.en || "" : typeof v === "string" ? v : "");
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const clean = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const hhmm = (s) => (typeof s === "string" && /T\d\d:\d\d/.test(s) ? s.slice(11, 16) : "");
const idOf = (s) => String(s || "").replace(/^eli\/dl\/event\//, "");

export function itemType(a) {
  const t = String(a.had_activity_type || "");
  const label = en(a.activity_label);
  if (/VOT/i.test(t) || /^votes?\b/i.test(label)) return "votes";
  if (/STATEMENT/i.test(t) || /\bstatement\b/i.test(label)) return "statement";
  if (/DEBATE|READING|REPORT|MOTION|QUESTION/i.test(t)) return "debate";
  return "other";
}
/* structuredContent (English) is a small XML string: references, process, creators (org = committee, person = rapporteur). */
export function parseStructured(sc) {
  const x = en(sc);
  const res = { refs: [], procs: [], people: [], committees: [] };
  if (!x) return res;
  for (const m of x.matchAll(/<label typeof="def\/ep-document-types\/[^"]*"[^>]*>([^<]+)<\/label>/g)) res.refs.push(clean(m[1]));
  for (const m of x.matchAll(/<process[\s\S]*?<label[^>]*>([^<]+)<\/label>/g)) res.procs.push(clean(m[1]));
  for (const m of x.matchAll(/<label typeof="person" resource="person\/(\d+)"[^>]*>([^<]*)<\/label>/g)) res.people.push({ id: m[1], name: clean(m[2]) });
  for (const m of x.matchAll(/<label typeof="org" resource="org\/([A-Z0-9_-]+)"/g)) res.committees.push(m[1]);
  return res;
}
export function buildDay(acts, mepIds) {
  const byId = new Map(acts.map((a) => [idOf(a.activity_id || a.id), a]));
  const slots = acts.filter((a) => /MEETING_PART/.test(String(a.had_activity_type || "")) || /-TF-/.test(String(a.activity_id || a.id)));
  slots.sort((a, b) => String(a.activity_start_date || "").localeCompare(String(b.activity_start_date || "")));
  const used = new Set(), out = [], unmatched = [];
  const mk = (a, time) => {
    const s = parseStructured(a.structuredContent);
    const it = { time, type: itemType(a), title: en(a.activity_label) };
    const sub = [...new Set([...s.refs, ...s.procs])].join(" · ");
    if (sub) it.sub = sub;
    const ids = [], names = [];
    for (const p of s.people) { if (mepIds.has(p.id)) { ids.push(p.id); names.push(p.name); } else unmatched.push({ id: p.id, name: p.name, title: it.title }); }
    if (names.length) { it.rapporteur = names.join(", "); it.rapporteurs = ids; }
    const com = s.committees.find((c) => COMMITTEES.has(c)); if (com) it.committee = com;
    return it;
  };
  for (const sl of slots) {
    const time = hhmm(sl.activity_start_date) ? `${hhmm(sl.activity_start_date)}–${hhmm(arr(sl.activity_end_date).slice(-1)[0])}` : "";
    const kids = arr(sl.consists_of).map(idOf).filter((k) => byId.has(k));
    if (!kids.length) { out.push({ time, type: itemType({ had_activity_type: "", activity_label: sl.agendaLabel || sl.activity_label }), title: en(sl.agendaLabel) || en(sl.activity_label) }); continue; }
    for (const k of kids) { used.add(k); out.push(mk(byId.get(k), time)); }
  }
  const rest = acts.filter((a) => /-OJ-ITM-/.test(String(a.activity_id || a.id)) && !used.has(idOf(a.activity_id || a.id)));
  rest.sort((a, b) => Number(a.activity_order || 0) - Number(b.activity_order || 0));
  for (const a of rest) out.push(mk(a, ""));
  return { items: out, unmatched };
}

/* ---------- main ---------- */
function daysOf(s) {
  const out = []; for (let d = new Date(s.start + "T00:00:00Z"); iso(d) <= s.end; d = new Date(d.getTime() + 864e5)) out.push(iso(d));
  return out;
}
function stageFor(start, prevStage, isNew) {
  const today = iso(new Date());
  if (today >= start) return isNew ? "agenda" : (prevStage === "agenda" || prevStage === "updated" ? "updated" : "agenda");
  const daysTo = Math.round((new Date(start) - new Date(today)) / 864e5);
  if (isNew) return daysTo <= 4 ? "final-draft" : "draft";
  return daysTo <= 4 ? "final-draft" : prevStage || "draft";
}

async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  const probe = { run: new Date().toISOString(), sessions: {} };
  const cal = await readJson(path.join(V1, "calendar.json"), { sessions: [] });
  const mepIds = new Set(((await readJson(path.join(V1, "meps.json"), { meps: [] })).meps || []).map((m) => String(m.id)));
  const agenda = await readJson(path.join(V1, "agenda.json"), { checked: "", source: PAGE, sessions: {} });
  const notify = await readJson(path.join(CACHE, "agenda-notify.json"), { pending: [] });
  const from = iso(new Date(Date.now() - 4 * 864e5)), to = iso(new Date(Date.now() + DAYS_AHEAD * 864e5));
  const upcoming = (cal.sessions || []).filter((s) => s.place === "SXB" && s.end >= from && s.start <= to);
  const unmatchedAll = {};
  let changed = false, failed = false;

  for (const s of upcoming) {
    const info = (probe.sessions[s.start] = { days: {} });
    const days = {}; const um = []; const types = {};
    for (const day of daysOf(s)) {
      const r = await dayActivities(day);
      info.days[day] = { status: r.status, activities: r.items.length };
      if (r.failed) { failed = true; continue; }
      for (const a of r.items) types[String(a.had_activity_type || "?")] = (types[String(a.had_activity_type || "?")] || 0) + 1;
      if (!r.items.length) continue;
      const { items, unmatched } = buildDay(r.items, mepIds);
      if (items.length) days[day] = items;
      um.push(...unmatched);
      await sleep(700);
    }
    info.types = types;
    const n = Object.values(days).reduce((a, v) => a + v.length, 0);
    info.items = n;
    if (!n) continue;
    const hash = sha(JSON.stringify(days));
    const prev = agenda.sessions[s.start];
    if (prev && prev.src && prev.src.sha256 === hash) { info.unchanged = true; continue; }
    const adopt = prev && !prev.src; /* entry made by hand earlier: replace it without announcing it */
    const stage = stageFor(s.start, prev && prev.stage, !prev);
    agenda.sessions[s.start] = { stage, updated: iso(new Date()), link: PAGE, src: { api: "foreseen-activities", sha256: hash }, days };
    if (!adopt && (!prev || prev.stage !== stage)) notify.pending.push({ session: s.start, stage, link: PAGE, at: new Date().toISOString(), items: n });
    if (um.length) unmatchedAll[s.start] = um;
    changed = true;
  }

  agenda.checked = iso(new Date());
  agenda.source = PAGE;
  await fs.writeFile(path.join(CACHE, "agenda-probe.json"), JSON.stringify(probe, null, 1) + "\n");
  if (changed) {
    const buf = Buffer.from(JSON.stringify(agenda, null, 1) + "\n");
    await fs.writeFile(path.join(V1, "agenda.json"), buf);
    await fs.writeFile(path.join(CACHE, "agenda-notify.json"), JSON.stringify(notify, null, 1) + "\n");
    const mp = path.join(V1, "manifest.json"), man = await readJson(mp, null);
    if (man && man.files) { man.files.agenda = { ...(man.files.agenda || {}), path: "agenda.json", bytes: buf.length, sha256: sha(buf) }; man.generated = new Date().toISOString(); await fs.writeFile(mp, JSON.stringify(man, null, 1) + "\n"); }
  }
  if (Object.keys(unmatchedAll).length) await fs.writeFile(path.join(CACHE, "agenda-unmatched.json"), JSON.stringify(unmatchedAll, null, 1) + "\n");
  else await fs.rm(path.join(CACHE, "agenda-unmatched.json"), { force: true });
  console.log(JSON.stringify({ upcoming: upcoming.map((s) => s.start), changed, unmatched: Object.fromEntries(Object.entries(unmatchedAll).map(([k, v]) => [k, v.length])), probe: probe.sessions }, null, 1));
  if (failed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
