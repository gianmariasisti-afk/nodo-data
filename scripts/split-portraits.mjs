#!/usr/bin/env node
/* Splits the portraits out of the directory files, so the app's first download is the directory without its photos.

     node scripts/split-portraits.mjs [--check]

   Reads v1/meps.json and v1/commission.json (unchanged: the live app still reads them with the photos inline) and writes
     v1/lite/meps.json, v1/lite/commission.json  the same records, with photo = "portraits/<sha256 prefix>.webp"
     v1/portraits/<sha256 prefix>.<ext>          one file per distinct portrait, named after its content
   The app adds its data address in front of "portraits/" and each image loads only when it is shown.
   Content-named files never change, so phones and the service worker can keep them for good; a new photo gets a new
   name. Files no longer referenced are deleted. Run by .github/workflows/meps.yml and commission.yml before each commit,
   and by portraits.yml after any other push that changes the two files.
   --check: exit 1 if the lite files or portraits are out of step, write nothing. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1"), LITE = path.join(V1, "lite"), PORT = path.join(V1, "portraits");
const check = process.argv.includes("--check");
const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

const wanted = new Map(); /* file name -> bytes */
function lift(o) {
  if (!o || typeof o.photo !== "string" || !o.photo.startsWith("data:image/")) return;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(o.photo);
  if (!m || !EXT[m[1]]) { delete o.photo; return; } /* an unreadable photo: the app shows initials */
  const bytes = Buffer.from(m[2], "base64");
  const name = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16) + "." + EXT[m[1]];
  wanted.set(name, bytes);
  o.photo = "portraits/" + name;
}

const out = {};
const meps = JSON.parse(fs.readFileSync(path.join(V1, "meps.json"), "utf8"));
for (const m of meps.meps || []) lift(m);
out["meps.json"] = meps;
const ec = JSON.parse(fs.readFileSync(path.join(V1, "commission.json"), "utf8"));
for (const c of ec.college || []) { lift(c); for (const k of c.cabinet || []) lift(k); }
out["commission.json"] = ec;

/* Compact JSON: these files exist to be small. */
const text = Object.fromEntries(Object.entries(out).map(([f, d]) => [f, JSON.stringify(d)]));
const have = fs.existsSync(PORT) ? new Set(fs.readdirSync(PORT)) : new Set();
const stale = [...have].filter((f) => !wanted.has(f));
const missing = [...wanted.keys()].filter((f) => !have.has(f));
const liteDiff = Object.entries(text).filter(([f, t]) => { try { return fs.readFileSync(path.join(LITE, f), "utf8") !== t; } catch { return true; } }).map(([f]) => f);

const summary = { portraits: wanted.size, added: missing.length, removed: stale.length, liteChanged: liteDiff,
  bytes: { lite: Object.fromEntries(Object.entries(text).map(([f, t]) => [f, Buffer.byteLength(t)])) } };
if (check) { console.log(JSON.stringify(summary)); process.exit(missing.length || stale.length || liteDiff.length ? 1 : 0); }

fs.mkdirSync(LITE, { recursive: true }); fs.mkdirSync(PORT, { recursive: true });
for (const f of missing) fs.writeFileSync(path.join(PORT, f), wanted.get(f));
for (const f of stale) fs.unlinkSync(path.join(PORT, f));
for (const f of liteDiff) fs.writeFileSync(path.join(LITE, f), text[f]);
console.log(JSON.stringify(summary));
