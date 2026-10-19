/* Scope guard for the scheduled Claude tasks that edit data by hand.

   Compares the working tree with a git ref and refuses any change outside the scopes named with --scope:
     files      v1/files.json: per file status, stage, next, sources, caveats, checked, council.note; top-level asOf, generated
     meps       v1/files.json: the meps list of each file (the Council task applies Observatory differences)
     calendar   v1/calendar.json: any field (validator checks shape)
     presidency v1/council.json: presidency.current and presidency.next only
     permreps   tools/council/permreps-extra.json: any entry
   v1/manifest.json may change only to follow the files above; with --sync-manifest the guard rewrites the
   bytes and sha256 of every changed v1 file first. Adding or removing a priority file, or changing commissioners,
   cabinet, DGs or working parties, is always refused: those changes go through a session with Gianmaria.

   Usage: node scripts/refresh-guard.mjs --scope files,calendar [--base origin/main] [--sync-manifest]
   Prints a JSON summary. Exit 0 = within scope, 1 = out of scope (reasons printed). */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const base = opt("--base", "origin/main");
const scopes = new Set(String(opt("--scope", "files")).split(",").map((s) => s.trim()).filter(Boolean));
const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", maxBuffer: 64 << 20 });
const atBase = (rel) => { try { return JSON.parse(git("show", `${base}:${rel}`)); } catch { return null; } };
const here = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refused = [], changes = [];

const PATHS = { "v1/files.json": ["files", "meps"], "v1/calendar.json": ["calendar"], "v1/council.json": ["presidency"], "tools/council/permreps-extra.json": ["permreps"], "v1/manifest.json": ["*"] };
const changed = [...new Set([
  ...git("diff", "--name-only", base).split("\n"),
  ...git("ls-files", "--others", "--exclude-standard").split("\n"),
].filter(Boolean))];

if (args.includes("--sync-manifest")) {
  const mp = path.join(ROOT, "v1/manifest.json"), man = here("v1/manifest.json");
  let touched = false;
  for (const e of Object.values(man.files || {})) {
    if (!e || !e.path || !changed.includes("v1/" + e.path)) continue;
    const buf = fs.readFileSync(path.join(ROOT, "v1", e.path));
    e.bytes = buf.length; e.sha256 = crypto.createHash("sha256").update(buf).digest("hex"); touched = true;
  }
  if (touched) { man.generated = new Date().toISOString(); fs.writeFileSync(mp, JSON.stringify(man, null, 1) + "\n"); if (!changed.includes("v1/manifest.json")) changed.push("v1/manifest.json"); }
}

for (const rel of changed) {
  const allowedBy = PATHS[rel];
  if (!allowedBy || (!allowedBy.includes("*") && !allowedBy.some((s) => scopes.has(s)))) refused.push(`${rel} changed (outside scope ${[...scopes].join(",")})`);
}

/* files.json: field-level rules */
if (changed.includes("v1/files.json")) {
  const now = here("v1/files.json"), was = atBase("v1/files.json") || { files: [] };
  for (const k of new Set([...Object.keys(now), ...Object.keys(was)])) {
    if (k === "files") continue;
    if (!same(now[k], was[k]) && !(scopes.has("files") && (k === "asOf" || k === "generated"))) refused.push(`files.json: top-level "${k}" changed`);
  }
  const ids = (d) => d.files.map((f) => f.id);
  if (!same(ids(now), ids(was))) refused.push(`files.json: file list changed: ${ids(was).join(",")} -> ${ids(now).join(",")}`);
  const FILE = new Set(scopes.has("files") ? ["status", "stage", "next", "sources", "caveats", "checked"] : []);
  if (scopes.has("meps")) FILE.add("meps");
  const byId = Object.fromEntries(was.files.map((f) => [f.id, f]));
  for (const f of now.files) {
    const o = byId[f.id]; if (!o) continue;
    const touched = [];
    for (const k of new Set([...Object.keys(f), ...Object.keys(o)])) {
      if (same(f[k], o[k])) continue;
      if (k === "council") {
        const { note: a, ...ra } = f.council || {}, { note: b, ...rb } = o.council || {};
        if (!same(ra, rb) || !scopes.has("files")) refused.push(`files.json ${f.id}: council changed`); else touched.push("council.note");
        continue;
      }
      if (FILE.has(k)) touched.push(k === "stage" ? `stage ${o.stage} -> ${f.stage}` : k);
      else refused.push(`files.json ${f.id}: "${k}" changed (outside scope)`);
    }
    if (touched.length) changes.push({ file: "v1/files.json", id: f.id, touched });
  }
}

/* council.json: only the presidency profiles */
if (changed.includes("v1/council.json") && scopes.has("presidency")) {
  const now = here("v1/council.json"), was = atBase("v1/council.json") || {};
  for (const k of new Set([...Object.keys(now), ...Object.keys(was)])) if (k !== "presidency" && !same(now[k], was[k])) refused.push(`council.json: "${k}" changed (only presidency.current and presidency.next may)`);
  const p = now.presidency || {}, q = was.presidency || {};
  for (const k of new Set([...Object.keys(p), ...Object.keys(q)])) if (!["current", "next"].includes(k) && !same(p[k], q[k])) refused.push(`council.json: presidency.${k} changed`);
  changes.push({ file: "v1/council.json", touched: ["current", "next"].filter((k) => !same(p[k], q[k])).map((k) => "presidency." + k) });
}

for (const rel of ["v1/calendar.json", "tools/council/permreps-extra.json"]) if (changed.includes(rel) && !refused.some((r) => r.startsWith(rel))) changes.push({ file: rel });

console.log(JSON.stringify({ base, scopes: [...scopes], changes, refused }, null, 1));
process.exit(refused.length ? 1 : 0);
