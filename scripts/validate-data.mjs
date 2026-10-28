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
    /* checked: the day someone last confirmed status and next steps against sources. No date in next may sit before it. */
    if (f.checked !== undefined && !ISO.test(String(f.checked))) bad(`${at}: checked "${f.checked}" is not a date`);
    if (f.checked && f.checked > new Date().toISOString().slice(0, 10)) bad(`${at}: checked ${f.checked} is in the future`);
    if (f.checked) for (const n of f.next || []) if (n.date && n.date < f.checked) bad(`${at}: next item "${n.what}" (${n.date}) is before the checked date ${f.checked}; move it out of next`);
    if (stages.size && !stages.has(f.stage)) bad(`${at}: unknown stage "${f.stage}"`);
    /* area: the policy area the Files screen groups the file under (since 28 Oct 2026). */
    const areas = new Set(((files.legend && files.legend.areas) || []).map((a) => a.id));
    if (areas.size && !areas.has(f.area)) bad(`${at}: unknown or missing area "${f.area}"`);
    for (const n of f.next || []) {
      if (n.date !== null && !ISO.test(String(n.date))) bad(`${at}: next date "${n.date}" is not YYYY-MM-DD or null`);
      if (!n.what) bad(`${at}: next item without text`);
      /* A dated step must name the source that gives its date (an id from this file's sources). */
      if (n.src !== undefined && !(f.sources || []).some((x) => x.id === n.src && /^https:\/\//.test(x.url || ""))) bad(`${at}: next item "${n.what}" points to unknown or non-https source "${n.src}"`);
      if (n.date && !n.src) bad(`${at}: dated next item "${n.what}" has no source`);
    }
    for (const m of f.meps || []) if (mepIds.size && !mepIds.has(String(m.id))) bad(`${at}: MEP id ${m.id} not in meps.json`);
    for (const c of f.cabinet || []) if (cabKeys.size && !cabKeys.has(c.k)) bad(`${at}: cabinet key ${c.k} not in commission.json`);
    for (const s of [...((f.commission && f.commission.lead) || []), ...((f.commission && f.commission.associated) || [])]) if (comSlugs.size && !comSlugs.has(s)) bad(`${at}: commissioner ${s} not in commission.json`);
    for (const s of f.sources || []) if (!/^https:\/\//.test(s.url || "")) bad(`${at}: source ${s.id} is not an https URL`);
  }
}

/* Council presidency profiles: the app shows motto, priorities and links from presidency.current or presidency.next */
const council = load("council.json");
if (council && council.presidency) {
  const P = council.presidency, rot = P.rotation || [];
  for (const k of ["current", "next"]) {
    const x = P[k]; if (!x) continue;
    const at = `council.json presidency.${k}`;
    if (!rot.some((r) => r[0] === x.country)) bad(`${at}: country ${x.country} not in the rotation`);
    if (!Array.isArray(x.pillars) || !x.pillars.every((y) => Array.isArray(y) && y.length === 2)) bad(`${at}: pillars must be [name, text] pairs`);
    if (!Array.isArray(x.also)) bad(`${at}: also must be a list`);
    for (const u of [x.site, x.trioProgramme]) if (u && !/^https:\/\//.test(u)) bad(`${at}: link ${u} is not https`);
  }
  if (P.current && P.next && P.current.country === P.next.country) bad("council.json: presidency.current and presidency.next are the same country");
}

/* Parliament calendar */
const cal = load("calendar.json");
if (cal) {
  if (!Array.isArray(cal.sessions) || cal.sessions.length < 10) bad(`calendar.json: ${cal.sessions ? cal.sessions.length : 0} plenary sessions`);
  for (const x of cal.sessions || []) if (!ISO.test(x.start) || !ISO.test(x.end) || x.end < x.start || !["SXB", "BRU"].includes(x.place)) bad(`calendar.json: bad session ${JSON.stringify(x)}`);
  if (cal.checked !== undefined && !ISO.test(String(cal.checked))) bad(`calendar.json: checked "${cal.checked}" is not a date`);
}

/* Hand-added permanent representatives: [name, date checked, https source] */
try {
  const extra = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/council/permreps-extra.json"), "utf8"));
  for (const [cc, slots] of Object.entries(extra)) for (const [slot, v] of Object.entries(slots)) {
    if (!["pr", "dpr"].includes(slot) || !Array.isArray(v) || !v[0] || !ISO.test(String(v[1])) || !/^https:\/\//.test(String(v[2]))) bad(`permreps-extra.json: ${cc}.${slot} must be [name, YYYY-MM-DD, https source]`);
  }
} catch (e) { bad(`permreps-extra.json: does not parse (${e.message.slice(0, 80)})`); }

/* Committee minutes: who spoke on nodo's files (optional file, built by tools/minutes/pull.py) */
if (fs.existsSync(path.join(V1, "minutes.json"))) {
  const mn = load("minutes.json");
  const fileIds = new Set(((files && files.files) || []).map((f) => f.id));
  if (mn) {
    if (mn.through && !ISO.test(mn.through)) bad(`minutes.json: through "${mn.through}" is not a date`);
    for (const [fid, o] of Object.entries(mn.files || {})) {
      if (!fileIds.has(fid)) bad(`minutes.json: unknown file ${fid}`);
      for (const m of o.meetings || []) if (!/^[A-Z0-9]{4}-PV-\d{4}-\d\d-\d\d-\d+$/.test(m.pv) || !ISO.test(m.date)) bad(`minutes.json ${fid}: bad meeting ${m.pv}`);
      for (const s of o.speakers || []) {
        if (!mepIds.has(s.id)) bad(`minutes.json ${fid}: speaker ${s.id} is not in meps.json`);
        if (!(s.n >= 1) || !(s.dates || []).length || !(s.dates || []).every((d) => ISO.test(d))) bad(`minutes.json ${fid}: speaker ${s.id} has no valid dates`);
      }
      for (const e of o.officials || []) if (!e.name || ![...(e.spoke || []), ...(e.present || [])].every((d) => ISO.test(d))) bad(`minutes.json ${fid}: bad official ${e.name || "?"}`);
    }
    const prev = loadBase("minutes.json");
    if (prev && prev.minutes && mn.minutes < prev.minutes - 10) bad(`minutes.json: minutes dropped from ${prev.minutes} to ${mn.minutes} in one change`);
  }
}

/* Everything else must at least parse */
for (const rel of ["agenda.json", "manifest.json"]) load(rel);

if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log(`valid: ${mepIds.size} MEPs, ${cabKeys.size} cabinet members, ${(files && files.files.length) || 0} files`);
