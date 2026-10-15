/* Data validator: the gate every automatic change has to pass before it reaches main.

   Checks the published v1 data for shape, references and sudden shrinkage. It does not judge content
   (whether a date is the right one); it stops broken, truncated or inconsistent data from going live.

   Usage:
     node scripts/validate-data.mjs                 check the working tree
     node scripts/validate-data.mjs --base origin/main   also compare sizes against that git ref
   Exit 0 = valid, 1 = problems (printed one per line). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1");
const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
const problems = [];
const bad = (m) => problems.push(m);

const load = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(V1, rel), "utf8")); }
  catch (e) { bad(`${rel}: does not parse (${e.message.slice(0, 80)})`); return null; }
};
const loadBase = (rel) => {
  if (!base) return null;
  try { return JSON.parse(execFileSync("git", ["-C", ROOT, "show", `${base}:v1/${rel}`], { encoding: "utf8", maxBuffer: 64 << 20 })); }
  catch { return null; }
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* MEPs */
const meps = load("meps.json");
const mepIds = new Set();
if (meps) {
  const list = meps.meps || [];
  if (list.length < 690 || list.length > 720) bad(`meps.json: ${list.length} MEPs (expected 690–720)`);
  for (const m of list) {
    if (!m.id || !m.name || !m.country || !m.group) bad(`meps.json: incomplete record ${m.id || "?"} ${m.name || ""}`);
    if (mepIds.has(m.id)) bad(`meps.json: duplicate id ${m.id}`);
    mepIds.add(m.id);
  }
  const prev = loadBase("meps.json");
  if (prev && prev.meps && list.length < prev.meps.length - 10) bad(`meps.json: dropped from ${prev.meps.length} to ${list.length} MEPs in one change`);
}

/* Commission and cabinets */
const ec = load("commission.json");
const cabKeys = new Set(), comSlugs = new Set();
const CLS = new Set(["lead", "policy", "office"]);
if (ec) {
  const college = ec.college || [];
  if (college.length !== 27) bad(`commission.json: ${college.length} College members (expected 27)`);
  let total = 0;
  for (const m of college) {
    comSlugs.add(m.slug);
    const cab = m.cabinet || [];
    total += cab.length;
    if (cab.length < 5) bad(`commission.json: ${m.slug} has only ${cab.length} cabinet members`);
    if (!cab.some((p) => p.role === "Head of Cabinet")) bad(`commission.json: ${m.slug} has no Head of Cabinet`);
    for (const p of cab) {
      if (!p.k || !p.name || !p.role) bad(`commission.json: incomplete cabinet record in ${m.slug}: ${p.name || p.k || "?"}`);
      if (!CLS.has(p.cls)) bad(`commission.json: ${p.k} has class "${p.cls}"`);
      if (p.cls === "lead" && /\bassistant\b/i.test(p.role)) bad(`commission.json: ${p.k} is an assistant classed as lead`);
      if (cabKeys.has(p.k)) bad(`commission.json: duplicate cabinet key ${p.k}`);
      cabKeys.add(p.k);
    }
  }
  const prev = loadBase("commission.json");
  if (prev && prev.college) {
    const was = prev.college.reduce((a, m) => a + (m.cabinet || []).length, 0);
    if (total < was - 10) bad(`commission.json: cabinets dropped from ${was} to ${total} people in one change`);
  }
}

/* Priority files: every reference must resolve, every date must be a date, every source must be https */
const files = load("files.json");
if (files) {
  const stages = new Set((files.legend && files.legend.stage) || []);
  const ids = new Set();
  if (!ISO.test(String(files.asOf || ""))) bad(`files.json: asOf "${files.asOf}" is not a date`);
  for (const f of files.files || []) {
    const at = `files.json ${f.id}`;
    if (ids.has(f.id)) bad(`${at}: duplicate id`);
    ids.add(f.id);
    if (!f.title || !f.status) bad(`${at}: missing title or status`);
    if (stages.size && !stages.has(f.stage)) bad(`${at}: unknown stage "${f.stage}"`);
    for (const n of f.next || []) {
      if (n.date !== null && !ISO.test(String(n.date))) bad(`${at}: next date "${n.date}" is not YYYY-MM-DD or null`);
      if (!n.what) bad(`${at}: next item without text`);
    }
    for (const m of f.meps || []) if (mepIds.size && !mepIds.has(String(m.id))) bad(`${at}: MEP id ${m.id} not in meps.json`);
    for (const c of f.cabinet || []) if (cabKeys.size && !cabKeys.has(c.k)) bad(`${at}: cabinet key ${c.k} not in commission.json`);
    for (const s of [...((f.commission && f.commission.lead) || []), ...((f.commission && f.commission.associated) || [])]) if (comSlugs.size && !comSlugs.has(s)) bad(`${at}: commissioner ${s} not in commission.json`);
    for (const s of f.sources || []) if (!/^https:\/\//.test(s.url || "")) bad(`${at}: source ${s.id} is not an https URL`);
  }
}

/* Everything else must at least parse */
for (const rel of ["council.json", "calendar.json", "agenda.json", "manifest.json"]) load(rel);

if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log(`valid: ${mepIds.size} MEPs, ${cabKeys.size} cabinet members, ${(files && files.files.length) || 0} files`);
