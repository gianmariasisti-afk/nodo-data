/* Scope guard for the weekly files refresh.

   Compares v1/files.json in the working tree with a git ref and allows only the fields the weekly
   refresh may touch: per file status, stage, next, sources, caveats, checked, council.note; at the
   top level asOf and generated. Adding or removing a file, or changing MEPs, commissioners, cabinet,
   DGs or working parties, is refused: those changes go through a session with Gianmaria.

   Usage: node scripts/files-guard.mjs [--base origin/main]
   Prints a JSON summary of what changed. Exit 0 = within scope, 1 = out of scope (reasons printed). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";
const now = JSON.parse(fs.readFileSync(path.join(ROOT, "v1/files.json"), "utf8"));
const was = JSON.parse(execFileSync("git", ["-C", ROOT, "show", `${base}:v1/files.json`], { encoding: "utf8", maxBuffer: 16 << 20 }));

const TOP = new Set(["asOf", "generated"]);
const FILE = new Set(["status", "stage", "next", "sources", "caveats", "checked"]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refused = [], changes = [];

for (const k of new Set([...Object.keys(now), ...Object.keys(was)])) {
  if (k === "files" || TOP.has(k)) continue;
  if (!same(now[k], was[k])) refused.push(`top-level "${k}" changed`);
}
const ids = (d) => d.files.map((f) => f.id);
if (!same(ids(now), ids(was))) refused.push(`file list changed: ${ids(was).join(",")} -> ${ids(now).join(",")}`);

const byId = Object.fromEntries(was.files.map((f) => [f.id, f]));
for (const f of now.files) {
  const o = byId[f.id];
  if (!o) continue;
  const touched = [];
  for (const k of new Set([...Object.keys(f), ...Object.keys(o)])) {
    if (same(f[k], o[k])) continue;
    if (k === "council") {
      const { note: a, ...ra } = f.council || {}, { note: b, ...rb } = o.council || {};
      if (!same(ra, rb)) refused.push(`${f.id}: council changed beyond the note`);
      else touched.push("council.note");
      continue;
    }
    if (FILE.has(k)) touched.push(k);
    else refused.push(`${f.id}: "${k}" changed (outside the weekly refresh)`);
  }
  if (o.stage !== f.stage) touched.push(`stage ${o.stage} -> ${f.stage}`);
  if (touched.length) changes.push({ id: f.id, touched });
}

console.log(JSON.stringify({ base, changes, refused }, null, 1));
process.exit(refused.length ? 1 : 0);
