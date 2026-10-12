/* Data checks for status.json (read by the weekday check).
   Prints one JSON object:
   - freshness: when each data file was last built, from the file itself
   - files: per priority file, the last date in `next` and how many dates are still ahead
   - manifest: entries in v1/manifest.json whose size or checksum no longer matches the file, or that are not entries at all
   Usage: node scripts/status-data.mjs [today YYYY-MM-DD] */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1");
const today = process.argv[2] || new Date().toISOString().slice(0, 10);
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(V1, rel), "utf8")); } catch { return null; } };
const day = (v) => (v ? String(v).slice(0, 10) : null);

const meps = read("meps.json"), council = read("council.json"), cal = read("calendar.json"), ec = read("commission.json");
const ag = read("agenda.json"), act = read("activity/index.json"), upd = read("updates/updates.json"), files = read("files.json");

/* The MEP directory is checked every weekday but only rewritten when something changes: its report holds the check date. */
let mepsReport = null; try { mepsReport = JSON.parse(fs.readFileSync(path.join(ROOT, "data-cache", "meps-report.json"), "utf8")); } catch { /* not yet */ }
const freshness = {
  meps: day(meps && meps.generated),
  mepsChecked: day(mepsReport && mepsReport.checked),
  commission: day(ec && ec.fetched),
  council: day(council && council.fetched),
  calendar: day(cal && cal.fetched),
  agendaChecked: day(ag && ag.checked),
  activity: day(act && act.generated),
  updates: day(upd && upd.generatedAt),
  filesAsOf: day(files && files.asOf),
};

const fileDates = ((files && files.files) || []).map((f) => {
  const dates = (f.next || []).map((n) => n.date).filter(Boolean).sort();
  return { id: f.id, short: f.short, lastNext: dates[dates.length - 1] || null, upcoming: dates.filter((d) => d >= today).length };
});

const manifest = [];
const man = read("manifest.json");
if (!man || !man.files) manifest.push({ entry: "*", problem: "manifest.json missing or has no files map" });
else for (const [k, e] of Object.entries(man.files)) {
  if (!e || typeof e !== "object" || !e.path) { manifest.push({ entry: k, problem: "not a file entry" }); continue; }
  let buf;
  try { buf = fs.readFileSync(path.join(V1, e.path)); } catch { manifest.push({ entry: k, problem: `file ${e.path} missing` }); continue; }
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (buf.length !== e.bytes || sha !== e.sha256) manifest.push({ entry: k, problem: `size or checksum differs (manifest ${e.bytes} bytes, file ${buf.length} bytes)` });
}

console.log(JSON.stringify({ today, freshness, files: fileDates, manifest }));
