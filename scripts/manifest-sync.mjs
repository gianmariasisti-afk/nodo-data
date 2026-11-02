/* Re-sync v1/manifest.json with the files it lists: rewrites bytes and sha256 for every entry whose file changed.
   Run it after any hand edit to a file in v1/ (curated files, search terms, auto pages).
   Usage: node scripts/manifest-sync.mjs [--check]   (--check: report drift and exit 1, change nothing) */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1");
const mPath = path.join(V1, "manifest.json");
const check = process.argv.includes("--check");
const m = JSON.parse(fs.readFileSync(mPath, "utf8"));
const drift = [];
for (const [k, e] of Object.entries(m.files || {})) {
  if (!e || !e.path) continue;
  let buf;
  try { buf = fs.readFileSync(path.join(V1, e.path)); } catch { drift.push(`${k}: file ${e.path} missing`); continue; }
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (buf.length === e.bytes && sha === e.sha256) continue;
  drift.push(`${k}: ${e.bytes} -> ${buf.length} bytes`);
  e.bytes = buf.length; e.sha256 = sha;
}
if (!drift.length) { console.log("manifest in step"); process.exit(0); }
console.log(drift.join("\n"));
if (check) process.exit(1);
m.generated = new Date().toISOString();
fs.writeFileSync(mPath, JSON.stringify(m, null, 1) + "\n");
console.log(`manifest updated (${drift.length} entr${drift.length === 1 ? "y" : "ies"})`);
