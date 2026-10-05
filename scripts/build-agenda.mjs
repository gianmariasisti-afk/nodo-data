/* Plenary agenda builder.
   Finds the agenda PDF of the next plenary session(s) on the EP site, converts it to v1/agenda.json, links rapporteurs to MEP ids,
   saves the PDF under v1/agenda/ and writes data-cache/agenda-notify.json when a draft, final draft or update appears.
   Writes data-cache/agenda-probe.json on every run (what was found, HTTP status per URL) so a failing fetch can be diagnosed. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1");
const CACHE = path.join(ROOT, "data-cache");
const EP = "https://www.europarl.europa.eu";
const LIST_URL = EP + "/plenary/en/agendas.html";
const UA = "Mozilla/5.0 (compatible; nodo-data/1.0; +https://github.com/gianmariasisti-afk/nodo-data)";
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 21);
const TERM = process.env.EP_TERM || "10";

const readJson = async (p, d) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return d; } };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const iso = (d) => d.toISOString().slice(0, 10);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

async function get(url, binary) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: binary ? "application/pdf,*/*" : "text/html,*/*" }, redirect: "follow" });
  const status = r.status;
  if (!r.ok) return { status, body: null };
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "";
  if (binary && !(buf.slice(0, 4).toString() === "%PDF")) return { status, body: null, note: "not a PDF (" + ct + ")" };
  return { status, body: buf, ct };
}

/* ---------- discovery ---------- */
export function candidateUrls(sessionStart, listHtml) {
  const [y, m, d] = sessionStart.split("-");
  const stamp = `${y}-${m}-${d}`;
  const found = [];
  const re = /href="([^"]*doceo\/document\/[^"]*\.pdf)"/gi;
  let x;
  while ((x = re.exec(listHtml || ""))) {
    const u = new URL(x[1].replace(/&amp;/g, "&"), EP).href;
    if (u.includes(stamp)) found.push(u);
  }
  const base = `${EP}/doceo/document/`;
  const guesses = [
    `${base}OJ-${TERM}-${stamp}_EN.pdf`,
    `${base}OJ-${TERM}-${stamp}-FNL_EN.pdf`,
    `${base}PDOJ-${TERM}-${stamp}_EN.pdf`,
    `${base}PDOJ-${TERM}-${stamp}-PROV_EN.pdf`,
    `${base}OJ-${TERM}-${stamp}-PROV_EN.pdf`,
  ];
  return [...new Set([...found, ...guesses])];
}
/* Stage from the document name: PDOJ = draft, OJ = agenda. */
export function stageFromUrl(u) { return /\/PDOJ-/i.test(u) ? "draft" : "agenda"; }

/* ---------- parsing ---------- */
const DAY_RE = /^\s*(monday|tuesday|wednesday|thursday|friday)[,\s]+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i;
const TIME_RE = /^\s*(\d{1,2})[.:h](\d{2})\s*[–—-]\s*(\d{1,2})[.:h](\d{2})\s*(.*)$/;
const pad = (n) => String(n).padStart(2, "0");
const COMMITTEES = "AFET DEVE INTA BUDG CONT ECON EMPL ENVI SANT ITRE IMCO TRAN REGI AGRI PECH CULT JURI LIBE AFCO FEMM PETI SEDE DROI".split(" ");

export function parseAgenda(text) {
  const days = {};
  let day = null, cur = null;
  const flush = () => { if (cur && day) (days[day] = days[day] || []).push(finish(cur)); cur = null; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\f/g, "").trimEnd();
    const dm = line.match(DAY_RE);
    if (dm) {
      const mi = MONTHS.indexOf(dm[3].toLowerCase());
      if (mi >= 0) { flush(); day = `${dm[4]}-${pad(mi + 1)}-${pad(dm[2])}`; continue; }
    }
    if (!day) continue;
    const tm = line.match(TIME_RE);
    if (tm) { flush(); cur = { time: `${pad(tm[1])}:${tm[2]}–${pad(tm[3])}:${tm[4]}`, lines: tm[5].trim() ? [tm[5].trim()] : [] }; continue; }
    if (cur && line.trim()) cur.lines.push(line.trim());
  }
  flush();
  return days;
}
function finish(c) {
  const full = c.lines.join(" ").replace(/\s+/g, " ").trim();
  const title = (c.lines[0] || "").replace(/\s+/g, " ").trim();
  const rest = c.lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
  const it = { time: c.time, type: /\bvotes?\b|voting time/i.test(title) ? "votes" : /statement/i.test(title) ? "statement" : /debate|report|recommendation|motion|proposal|opinion/i.test(full) ? "debate" : "other", title };
  if (rest) it.sub = rest;
  const ref = full.match(/\bA\d{1,2}-\d{3,4}\/\d{4}\b/);
  if (ref) it.ref = ref[0];
  const rap = full.match(/(?:Report|Recommendation|Opinion)(?:\s+by|\s*:)\s+([^()\[\];]+?)(?=\s+(?:[A-Z]{3,5}\b|\(|\[|A\d{1,2}-)|\s*$)/);
  if (rap) it.rapporteur = rap[1].trim();
  const com = COMMITTEES.find((k) => new RegExp("\\b" + k + "\\b").test(full));
  if (com) it.committee = com;
  return it;
}

/* ---------- MEP matching ---------- */
export function makeMatcher(meps) {
  const full = new Map(), fam = new Map();
  for (const m of meps) {
    const f = norm(`${m.given} ${m.family}`), l = norm(m.family);
    if (f) (full.get(f) || full.set(f, []).get(f)).push(m.id);
    if (l) (fam.get(l) || fam.set(l, []).get(l)).push(m.id);
  }
  return (name) => {
    const n = norm(name);
    if (!n) return [];
    if (full.has(n) && full.get(n).length === 1) return full.get(n);
    const parts = n.split(" ");
    for (const k of [n, parts[parts.length - 1], parts.slice(-2).join(" ")]) if (fam.has(k) && fam.get(k).length === 1) return fam.get(k);
    return [];
  };
}

/* ---------- main ---------- */
async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  const probe = { run: new Date().toISOString(), list: null, sessions: {} };
  const cal = await readJson(path.join(V1, "calendar.json"), { sessions: [] });
  const meps = (await readJson(path.join(V1, "meps.json"), { meps: [] })).meps || [];
  const agenda = await readJson(path.join(V1, "agenda.json"), { checked: "", source: LIST_URL, sessions: {} });
  const match = makeMatcher(meps);
  const today = new Date(), horizon = new Date(Date.now() + DAYS_AHEAD * 864e5);
  const upcoming = (cal.sessions || []).filter((s) => s.start >= iso(new Date(Date.now() - 3 * 864e5)) && s.start <= iso(horizon) && s.place === "SXB");

  let listHtml = "";
  try { const l = await get(LIST_URL); probe.list = { status: l.status, bytes: l.body ? l.body.length : 0 }; listHtml = l.body ? l.body.toString("utf8") : ""; } catch (e) { probe.list = { error: String(e) }; }

  if (listHtml.length < 5000 || process.env.PROBE === "1") probe.listSnippet = listHtml.slice(0, 1500);
  const API = process.env.EP_API || "https://data.europarl.europa.eu/api/v2";
  probe.api = {};
  for (const s of upcoming.slice(0, 1)) {
    const id = `MTG-PL-${s.start}`;
    for (const ep of [`/meetings/${id}`, `/meetings/${id}/foreseen-activities?format=application%2Fld%2Bjson&limit=200`, `/meetings?year=${s.start.slice(0, 4)}&format=application%2Fld%2Bjson&limit=5`, `/plenary-documents?year=${s.start.slice(0, 4)}&format=application%2Fld%2Bjson&limit=3`]) {
      try {
        const r = await fetch(API + ep, { headers: { "User-Agent": "nodo-prd-1.0", Accept: "application/ld+json, application/json" } });
        const t = await r.text();
        probe.api[ep] = { status: r.status, bytes: t.length, head: t.slice(0, 1800) };
      } catch (e) { probe.api[ep] = { error: String(e) }; }
    }
  }

  const notify = (await readJson(path.join(CACHE, "agenda-notify.json"), { pending: [] }));
  const unmatchedAll = {};
  let changed = false, parseFailed = false;

  for (const s of upcoming) {
    const info = (probe.sessions[s.start] = { tried: [] });
    let pdf = null, url = null;
    for (const u of candidateUrls(s.start, listHtml)) {
      let r;
      try { r = await get(u, true); } catch (e) { info.tried.push({ u, error: String(e) }); continue; }
      info.tried.push({ u, status: r.status, note: r.note });
      if (r.body) { pdf = r.body; url = u; break; }
    }
    if (!pdf) continue;
    const hash = sha(pdf);
    const prev = agenda.sessions[s.start];
    if (prev && prev.src && prev.src.sha256 === hash) { info.unchanged = true; continue; }
    const tmp = path.join(CACHE, `agenda-${s.start}.pdf`);
    await fs.writeFile(tmp, pdf);
    const text = execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    await fs.writeFile(path.join(CACHE, `agenda-${s.start}.txt`), text);
    const days = parseAgenda(text);
    const n = Object.values(days).reduce((a, v) => a + v.length, 0);
    info.items = n;
    if (n < 3) { parseFailed = true; info.error = "parser found fewer than 3 items; previous data kept"; continue; }
    const unmatched = [];
    for (const items of Object.values(days)) for (const it of items) {
      if (!it.rapporteur) continue;
      const ids = match(it.rapporteur);
      if (ids.length) it.rapporteurs = ids; else unmatched.push({ name: it.rapporteur, title: it.title, ref: it.ref || "" });
    }
    let stage = stageFromUrl(url);
    if (prev && prev.src && prev.stage !== "none") stage = stage === "agenda" ? (prev.stage === "agenda" || prev.stage === "updated" ? "updated" : "agenda") : "final-draft";
    const dest = `agenda/${s.start}.pdf`;
    await fs.mkdir(path.join(V1, "agenda"), { recursive: true });
    await fs.writeFile(path.join(V1, dest), pdf);
    agenda.sessions[s.start] = { stage, updated: iso(today), pdf: dest, src: { url, sha256: hash }, days };
    notify.pending.push({ session: s.start, stage, pdf: `v1/${dest}`, source: url, at: today.toISOString(), unmatched: unmatched.length });
    if (unmatched.length) unmatchedAll[s.start] = unmatched;
    changed = true;
  }

  agenda.checked = iso(today);
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
  if (parseFailed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
