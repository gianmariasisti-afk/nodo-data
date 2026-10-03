#!/usr/bin/env node
/* nodo: build the per-MEP activity feed from the European Parliament Open Data Portal.

   Output (all under v1/activity/):
     <mep id>.json      one file per MEP: speeches, written questions, rapporteur and shadow roles, newest first
     q/<question>.json  full question and answer text for one written question (loaded when a card is opened)
     index.json         counts and generation time
   Cache (committed, not served to the app): data-cache/questions.json, data-cache/docs.json

   The job is resumable. Details of questions and committee documents are fetched newest first, up to MAX_DETAILS per run,
   so the first runs backfill the term and later runs only add what is new.

   Environment: MAX_DETAILS (default 3000), MAX_PDFS (default 800), ONLY (comma list of MEP ids), YEARS (default 2024..now),
   EP_API (override the API base, used by tests), DRY (1 = write nothing).
   Data: European Parliament Open Data Portal, CC BY 4.0. No personal data goes into the User-Agent. */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.EP_API || "https://data.europarl.europa.eu/api/v2";
const FILES = process.env.EP_FILES || "https://data.europarl.europa.eu/";
const UA = "nodo-prd-1.0";
const MAX_DETAILS = Number(process.env.MAX_DETAILS || 3000);
const MAX_PDFS = Number(process.env.MAX_PDFS || 800);
const SKIP = new Set((process.env.SKIP || "").split(",").filter(Boolean)); /* e.g. SKIP=speech,question,role to run only the PDF text stage from the caches */
const PDF_GAP_MS = Number(process.env.PDF_GAP_MS || 1500);
const GAP_MS = Number(process.env.GAP_MS || 650); /* 500 requests per 5 minutes per endpoint is the limit; this stays under it */
const DRY = process.env.DRY === "1";
const NOW = new Date();
const YEARS = (process.env.YEARS ? process.env.YEARS.split(",").map(Number) : Array.from({ length: NOW.getFullYear() - 2024 + 1 }, (_, i) => 2024 + i));
const OUT = path.join(ROOT, "v1", "activity");
const CACHE = path.join(ROOT, "data-cache");

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return d; } };
const writeJson = async (p, v) => { if (DRY) return; await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(v) + "\n"); };

/* ---------- API client: one request at a time, spaced, with retries ---------- */
let last = 0;
const stats = { calls: 0, retries: 0, failed: 0 };
async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    stats.calls++;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/ld+json, application/json" } });
      if (r.ok) {
        const body = await r.text();
        try { return JSON.parse(body); } catch { stats.retries++; await sleep(2000 * (attempt + 1)); continue; }
      }
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) {
        stats.retries++;
        const ra = Number(r.headers.get("retry-after"));
        await sleep((ra > 0 ? ra * 1000 : 5000 * 2 ** attempt));
        continue;
      }
      throw new Error(`HTTP ${r.status} ${url}`);
    } catch (e) {
      if (attempt === 4 || /HTTP 4\d\d/.test(String(e.message))) { stats.failed++; throw e; }
      stats.retries++;
      await sleep(3000 * 2 ** attempt);
    }
  }
  stats.failed++;
  throw new Error("gave up " + url);
}
const qs = (o) => new URLSearchParams({ format: "application/ld+json", ...o }).toString();
async function pageAll(p, params, { limit = 100, maxPages = 50 } = {}) {
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const j = await getJson(`${API}${p}?${qs({ ...params, limit, offset: page * limit })}`);
    const rows = (j && j.data) || [];
    all.push(...rows);
    if (rows.length < limit) break;
  }
  return all;
}

/* ---------- parsing helpers ---------- */
const pick = (m) => (!m ? "" : typeof m === "string" ? m : m.en || m[Object.keys(m)[0]] || "");
const personId = (s) => String(s || "").replace(/^person\//, "");
const lastSeg = (id) => String(id || "").split("/").pop();
const roleOf = (p) => String(p.participation_role || "").split("/").pop();
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
function expressionOf(work) {
  const ex = arr(work.is_realized_by);
  return ex.find((e) => /\/en$/.test(e.id || "")) || ex.find((e) => /ENG$/.test(e.language || "")) || ex[0] || null;
}
function pdfOf(work) {
  const ex = expressionOf(work); if (!ex) return "";
  const m = arr(ex.is_embodied_by).find((x) => /pdf/i.test(x.format || x.media_type || x.id || ""));
  return m && m.is_exemplified_by ? FILES + m.is_exemplified_by.replace(/^\//, "") : "";
}
function titleOf(work) {
  const ex = expressionOf(work);
  return pick(work.title_dcterms) || pick(ex && ex.title) || "";
}
const ADDRESSEE = [[/COM|COMMISSION/i, "Commission"], [/COUNCIL|CONSIL/i, "Council"], [/ECB/i, "European Central Bank"], [/EEAS|HR|VP/i, "High Representative"]];
const addresseeName = (code) => { const c = String(code || ""); const h = ADDRESSEE.find(([re]) => re.test(c)); return h ? h[1] : c.replace(/^org\//, ""); };

/* ---------- inputs ---------- */
const mepsFile = await readJson(path.join(ROOT, "v1", "meps.json"), null);
if (!mepsFile || !Array.isArray(mepsFile.meps)) throw new Error("v1/meps.json missing");
let MEPS = mepsFile.meps.filter((m) => /^\d+$/.test(String(m.id)));
if (process.env.ONLY) { const only = new Set(process.env.ONLY.split(",")); MEPS = MEPS.filter((m) => only.has(String(m.id))); }
const ids = new Set(MEPS.map((m) => String(m.id)));
const nameById = new Map(mepsFile.meps.map((m) => [String(m.id), m.name && m.given && m.family ? `${m.given} ${m.family}` : m.name]));
const cmteName = {};
mepsFile.meps.forEach((m) => (m.committees || []).forEach((c) => { if (c.abbr) cmteName[c.abbr] = c.name; }));

const items = new Map(MEPS.map((m) => [String(m.id), { speech: [], question: [], role: [] }]));
const okStage = { speech: true, question: true, role: true };
const stageErr = {};

/* ---------- stage 1: plenary speeches, one request series per MEP ---------- */
const speechFailed = new Set();
async function speeches() {
  let n = 0;
  for (const m of MEPS) {
    const id = String(m.id);
    try {
      const rows = await pageAll("/speeches", { "person-id": id, "parliamentary-term": 10 }, { limit: 100, maxPages: 6 });
      const seen = new Set();
      for (const r of rows) {
        const key = r.activity_id || r.id;
        const title = pick(r.activity_label) || pick(r.label);
        const date = String(r.activity_date || "").slice(0, 10);
        if (!key || !title || !date || seen.has(key)) continue;
        seen.add(key);
        items.get(id).speech.push({ type: "speech", id: String(key), date, title: title.replace(/\s*\((debate|debates)\)\s*$/i, "").trim(), meta: "Plenary debate", role: "Speaker" });
      }
      n += items.get(id).speech.length;
    } catch (e) {
      speechFailed.add(id); stageErr.speech = e.message;
      log("speeches failed for", id, e.message);
      if (speechFailed.size > MEPS.length * 0.1 + 5) { okStage.speech = false; break; }
    }
  }
  log("speeches:", n, "failed MEPs:", speechFailed.size);
}

/* ---------- stage 2: written questions ---------- */
const qCache = await readJson(path.join(CACHE, "questions.json"), {});
/* E-10-2026-000123 -> sortable number (term, year, sequence), so the newest questions come first */
const qKey = (id) => { const m = /^[A-Z]-(\d+)-(\d{4})-(\d+)$/.exec(id); return m ? Number(m[1]) * 1e12 + Number(m[2]) * 1e8 + Number(m[3]) : 0; };
async function questions() {
  const listed = new Set();
  for (const y of YEARS) {
    const rows = await pageAll("/parliamentary-questions", { year: y, "work-type": "QUESTION_WRITTEN" }, { limit: 100, maxPages: 400 });
    rows.forEach((r) => { const id = r.identifier || lastSeg(r.id); if (/^[A-Z]-\d+-\d{4}-\d+$/.test(id)) listed.add(id); });
    log("questions listed", y, rows.length);
  }
  const today = NOW.toISOString().slice(0, 10);
  const todo = [...listed].filter((id) => !qCache[id] || (!qCache[id].ad && qCache[id].c !== today)).sort((a, b) => (qCache[a] ? 1 : 0) - (qCache[b] ? 1 : 0) || qKey(b) - qKey(a));
  log("question details to fetch:", todo.length, "cap", MAX_DETAILS);
  let done = 0;
  for (const id of todo.slice(0, MAX_DETAILS)) {
    try {
      const j = await getJson(`${API}/parliamentary-questions/${id}?${qs({})}`);
      const w = j && j.data && j.data[0]; if (!w) continue;
      const parts = arr(w.workHadParticipation);
      const authors = parts.filter((p) => roleOf(p) === "AUTHOR").flatMap((p) => arr(p.had_participant_person)).map(personId);
      const to = parts.filter((p) => roleOf(p) === "ADDRESSEE").flatMap((p) => arr(p.had_participant_organization))[0] || "";
      const ans = arr(w.inverse_answers_to)[0];
      qCache[id] = { a: authors, to: addresseeName(to), d: String(w.document_date || "").slice(0, 10), t: titleOf(w), p: pdfOf(w), ad: ans ? String(ans.document_date || "").slice(0, 10) : "", ap: ans ? pdfOf(ans) : "", c: today, qt: qCache[id]?.qt, at: qCache[id]?.at };
      done++;
    } catch (e) { log("question failed", id, e.message); if (stats.failed > 60) { okStage.question = false; stageErr.question = e.message; break; } }
    if (done % 200 === 0 && done) await writeJson(path.join(CACHE, "questions.json"), qCache);
  }
  log("question details fetched:", done);
  await writeJson(path.join(CACHE, "questions.json"), qCache);
}

/* ---------- stage 3: rapporteur and shadow roles from committee documents ---------- */
const dCache = await readJson(path.join(CACHE, "docs.json"), {});
const DOC_RE = /^([A-Z]{3,5})-(AD|PR)-(\d+)$/;
async function roles() {
  const listed = new Set();
  for (const y of YEARS) {
    const rows = await pageAll("/committee-documents", { year: y }, { limit: 100, maxPages: 400 });
    rows.forEach((r) => { const id = r.identifier || lastSeg(r.id); if (DOC_RE.test(id)) listed.add(id); });
    log("committee documents listed", y, rows.length);
  }
  const today = NOW.toISOString().slice(0, 10);
  const age = (id) => (NOW - new Date(dCache[id].d || 0)) / 864e5;
  const todo = [...listed].filter((id) => !dCache[id] || (age(id) < 60 && dCache[id].c !== today)).sort((a, b) => (dCache[a] ? 1 : 0) - (dCache[b] ? 1 : 0) || Number(b.split("-").pop()) - Number(a.split("-").pop()));
  log("committee document details to fetch:", todo.length, "cap", MAX_DETAILS);
  let done = 0;
  for (const id of todo.slice(0, MAX_DETAILS)) {
    try {
      const j = await getJson(`${API}/committee-documents/${id}?${qs({})}`);
      const w = j && j.data && j.data[0]; if (!w) continue;
      const rl = arr(w.workHadParticipation).map((p) => [arr(p.had_participant_person).map(personId)[0], roleOf(p)]).filter(([p, r]) => p && /^RAPPORTEUR/.test(r));
      dCache[id] = { d: String(w.document_date || "").slice(0, 10), t: titleOf(w), p: pdfOf(w), r: rl, c: today };
      done++;
    } catch (e) { log("document failed", id, e.message); if (stats.failed > 60) { okStage.role = false; stageErr.role = e.message; break; } }
    if (done % 200 === 0 && done) await writeJson(path.join(CACHE, "docs.json"), dCache);
  }
  log("committee document details fetched:", done);
  await writeJson(path.join(CACHE, "docs.json"), dCache);
}

/* ---------- stage 4: question and answer text from the published PDFs ---------- */
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nodo-"));
function pdfText(file) {
  return new Promise((res) => execFile("pdftotext", ["-enc", "UTF-8", file, "-"], { maxBuffer: 8e6 }, (err, out) => res(err ? "" : out)));
}
let lastPdf = 0, pdfStreak = 0;
const pdfDiag = [];
async function download(url) {
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastPdf + PDF_GAP_MS - Date.now(); if (wait > 0) await sleep(wait); lastPdf = Date.now();
    r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) break;
    if (r.status === 429 || r.status >= 500) { const ra = Number(r.headers.get("retry-after")); await sleep(ra > 0 ? Math.min(ra, 300) * 1000 : 20000 * 2 ** attempt); continue; }
    break;
  }
  if (!r.ok) {
    if (pdfDiag.length < 8) pdfDiag.push({ url, status: r.status, retryAfter: r.headers.get("retry-after"), server: r.headers.get("server"), type: r.headers.get("content-type"), body: (await r.text().catch(() => "")).slice(0, 300) });
    throw new Error("HTTP " + r.status);
  }
  const f = path.join(tmp, crypto.randomBytes(6).toString("hex") + ".pdf");
  await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
  return f;
}
const DROP = /^(Question for written answer|Answer given by|Submitted:|Original language|Last updated|Rule \d+|E-\d{6}\/\d{4}|PE\d|Official Journal|\d+\s*\/\s*\d+$)/i;
function paragraphs(raw, title) {
  const out = []; let cur = [];
  const flush = () => { if (cur.length) out.push(cur.join(" ").replace(/\s+/g, " ").trim()); cur = []; };
  for (const line of raw.replace(/\r/g, "").replace(/\f/g, "\n").split("\n").map((s) => s.trim())) {
    if (!line) { flush(); continue; }
    if (DROP.test(line)) continue;
    cur.push(line);
  }
  flush();
  const t = String(title || "").toLowerCase();
  return out.filter((p) => p.length > 1 && p.toLowerCase() !== t);
}
const clip = (ps, max) => { const o = []; let n = 0; for (const p of ps) { if (n + p.length > max) break; o.push(p); n += p.length; } return o; };
async function texts() {
  const cand = Object.entries(qCache).filter(([, r]) => r.p && !r.qt || (r.ap && !r.at)).sort((a, b) => qKey(b[0]) - qKey(a[0])).slice(0, MAX_PDFS);
  log("pdf texts to extract:", cand.length);
  let done = 0;
  for (const [id, r] of cand) {
    try {
      if (r.p && !r.qt) { const f = await download(r.p); r.qt = clip(paragraphs(await pdfText(f), r.t), 4000); await fs.rm(f, { force: true }); }
      if (r.ap && !r.at) {
        const f = await download(r.ap); const raw = await pdfText(f);
        const by = raw.match(/Answer given by\s+([\s\S]{3,160}?)\s+on behalf of/i);
        r.ab = by ? by[1].replace(/\s+/g, " ").trim() : "";
        r.at = clip(paragraphs(raw, ""), 9000); await fs.rm(f, { force: true });
      }
      done++; pdfStreak = 0;
    } catch (e) { log("pdf failed", id, e.message); if (++pdfStreak >= 8) { log("pdf stage stopped: 8 failures in a row, will resume next run"); break; } }
    if (done % 100 === 0 && done) await writeJson(path.join(CACHE, "questions.json"), qCache);
  }
  await writeJson(path.join(CACHE, "questions.json"), qCache);
  await writeJson(path.join(CACHE, "pdf-diag.json"), { at: new Date().toISOString(), extracted: done, tried: cand.length, errors: pdfDiag });
  log("pdf texts extracted:", done);
}

/* ---------- run ---------- */
const t0 = Date.now();
if (SKIP.has("speech")) okStage.speech = false; /* keeps the previous speeches */
if (SKIP.has("role")) okStage.role = false;
try { if (!SKIP.has("speech")) await speeches(); } catch (e) { okStage.speech = false; stageErr.speech = e.message; log("speeches stage failed", e.message); }
try { if (!SKIP.has("question")) await questions(); } catch (e) { okStage.question = false; stageErr.question = e.message; log("questions stage failed", e.message); }
try { if (!SKIP.has("role")) await roles(); } catch (e) { okStage.role = false; stageErr.role = e.message; log("roles stage failed", e.message); }
try { await texts(); } catch (e) { log("texts stage failed", e.message); }

/* assemble questions and roles per MEP from the caches */
for (const [id, r] of Object.entries(qCache)) {
  for (const a of r.a || []) {
    if (!ids.has(a) || !r.t) continue;
    const answered = !!r.ad;
    items.get(a).question.push({ type: "question", id, date: r.d, title: r.t, meta: id, addressee: r.to, status: answered ? "answered" : "pending", ...(answered ? { answerDate: r.ad } : {}), ...(r.p ? { pdf: r.p } : {}), ...(r.ap ? { answerPdf: r.ap } : {}), ...(r.qt || r.at ? { detail: `q/${id}.json` } : {}) });
  }
}
for (const [id, r] of Object.entries(dCache)) {
  const mm = id.match(DOC_RE); if (!mm) continue;
  const [, cm, kind, num] = mm;
  const rapp = (r.r || []).filter(([, ro]) => !/SHADOW/.test(ro)).map(([p]) => p);
  for (const [p, ro] of r.r || []) {
    if (!ids.has(p) || !r.t) continue;
    const shadow = /SHADOW/.test(ro);
    const other = rapp.filter((x) => x !== p).map((x) => nameById.get(x)).filter(Boolean);
    const cn = cmteName[cm] ? `${cm} · ${cmteName[cm]}` : cm;
    items.get(p).role.push({ type: kind === "AD" ? "opinion" : "report", id, date: r.d || undefined, title: r.t, meta: shadow && other.length ? `${cm} · Rapporteur: ${other.join(", ")}` : cn, role: shadow ? "Shadow" : "Rapporteur", ref: `${cm}_${kind}(${(r.d || "").slice(0, 4) || NOW.getFullYear()})${num}`, ...(r.p ? { pdf: r.p } : {}) });
  }
}

/* write per-MEP files, keeping the previous items of a stage that failed */
let changed = 0, total = { speech: 0, question: 0, role: 0 };
const cmp = (a, b) => (a.date && b.date ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) : a.date ? -1 : b.date ? 1 : 0);
for (const m of MEPS) {
  const id = String(m.id), f = path.join(OUT, id + ".json");
  const prev = await readJson(f, null), it = items.get(id);
  const keep = (stage, type) => (okStage[stage] && !(stage === "speech" && speechFailed.has(id)) ? it[stage] : ((prev && prev.items) || []).filter((x) => (stage === "role" ? x.type === "opinion" || x.type === "report" : x.type === type)));
  const all = [...keep("speech", "speech"), ...keep("question", "question"), ...keep("role")].sort(cmp);
  total.speech += all.filter((x) => x.type === "speech").length; total.question += all.filter((x) => x.type === "question").length; total.role += all.filter((x) => x.role && x.type !== "speech").length;
  if (prev && JSON.stringify(prev.items) === JSON.stringify(all)) continue;
  changed++;
  await writeJson(f, { id: Number(id), updated: NOW.toISOString(), source: "European Parliament Open Data Portal, CC BY 4.0", items: all });
}

/* text files for questions that have them */
let qfiles = 0;
for (const [id, r] of Object.entries(qCache)) {
  if (!r.qt && !r.at) continue;
  const f = path.join(OUT, "q", id + ".json");
  const body = { id, ...(r.qt ? { question: r.qt } : {}), ...(r.at ? { answer: r.at } : {}), ...(r.ab ? { answeredBy: r.ab } : {}) };
  const prev = await readJson(f, null);
  if (prev && JSON.stringify(prev) === JSON.stringify(body)) continue;
  await writeJson(f, body); qfiles++;
}

/* sanity checks: refuse to publish an empty or collapsed result */
const prevIndex = await readJson(path.join(OUT, "index.json"), null);
const problems = [];
if (ids.size > 100) {
  if (okStage.speech && total.speech === 0) problems.push("no speeches for any MEP");
  if (prevIndex && prevIndex.totals && okStage.speech && total.speech < prevIndex.totals.speech * 0.8) problems.push(`speeches fell from ${prevIndex.totals.speech} to ${total.speech}`);
}
Object.entries(okStage).forEach(([k, ok]) => { if (!ok && !SKIP.has(k)) problems.push(`${k} stage failed: ${stageErr[k]}`); });
await writeJson(path.join(OUT, "index.json"), { generated: changed || qfiles ? NOW.toISOString() : (prevIndex && prevIndex.generated) || NOW.toISOString(), meps: MEPS.length, totals: total, source: "European Parliament Open Data Portal, CC BY 4.0" });

/* register in the manifest */
if (!DRY && !process.env.ONLY) {
  const mp = path.join(ROOT, "v1", "manifest.json"), man = await readJson(mp, null);
  if (man) {
    const buf = await fs.readFile(path.join(OUT, "index.json"));
    man.files.activity = { path: "activity/index.json", description: "MEP activity: speeches, written questions, rapporteur and shadow roles (one file per MEP in activity/)", bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
    if (changed || qfiles) man.generated = NOW.toISOString();
    await fs.writeFile(mp, JSON.stringify(man, null, 1) + "\n");
  }
}
await fs.rm(tmp, { recursive: true, force: true });
log(`done in ${Math.round((Date.now() - t0) / 1000)}s · api calls ${stats.calls}, retries ${stats.retries}, failed ${stats.failed} · MEP files changed ${changed}, question texts ${qfiles} · totals ${JSON.stringify(total)}`);
if (problems.length) { console.error("PROBLEMS:\n- " + problems.join("\n- ")); process.exitCode = 1; }
