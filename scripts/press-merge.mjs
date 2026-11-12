#!/usr/bin/env node
/* Latest developments (press.json), step 2 of 2: merge reviewed items into v1/press.json.

   node scripts/press-merge.mjs <items.json>     add items (a JSON array, see checkItem), rewrite press.json and its manifest entry
   node scripts/press-merge.mjs --remove <id>     drop one published item
   node scripts/press-merge.mjs --prune           only drop items older than keepDays
   node scripts/press-merge.mjs --split <items.json> <auto.json> <review.json> [--log]
                                                  check every item, then sort them by the autonomy policy (scripts/autonomy.mjs,
                                                  classifyPress). <auto.json> gets what is published to main now: institutional
                                                  items that do not change a stage, and press items or stage changes that passed
                                                  the double check (a second listed source in "confirm", or seen by a run on an
                                                  earlier day and submitted again). <review.json> gets the rest, which waits in
                                                  data-cache/press/pending.json for the next run. Items already published are left
                                                  out of both. --log appends the published ones to data-cache/autonomy-log.json and
                                                  rewrites pending.json. Writes nothing to press.json.
   node scripts/press-merge.mjs --pending         print the items that wait for a second look (JSON array)

   Every item is checked here and again by scripts/validate-data.mjs. An item that fails is refused with the reason and
   nothing is written. Items already published (same file and url) are kept as they are. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkPressSource, resolve as resolveSource } from "./sources.mjs";
import { classifyPress, logAuto } from "./autonomy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "v1/press.json");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/press/config.json"), "utf8"));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const INST = ["ep", "council", "commission", "advisory", "press"];
export const KIND = ["institutional", "press", "analysis"];
const today = new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* One item. The url must be on nodo's source list (v1/sources.json, see scripts/sources.mjs). text is nodo's own takeaway (never a quote of the source): one or two sentences, 40 to 240 characters. */
export function checkItem(x, { fileIds, mepIds, reg }) {
  const p = [];
  if (!fileIds.has(x.file)) p.push(`unknown file "${x.file}"`);
  if (!ISO.test(String(x.date || ""))) p.push(`date "${x.date}" is not YYYY-MM-DD`);
  else if (x.date > addDays(today, 1)) p.push(`date ${x.date} is in the future`);
  if (!/^https:\/\/[^\s]+$/.test(x.url || "")) p.push("url is not https");
  else p.push(...checkPressSource(x, x.file, reg));
  if (!x.source || String(x.source).length > 60) p.push("source missing or longer than 60 characters");
  if (!INST.includes(x.inst)) p.push(`inst "${x.inst}" is not one of ${INST.join(", ")}`);
  if (!KIND.includes(x.kind)) p.push(`kind "${x.kind}" is not one of ${KIND.join(", ")}`);
  const t = String(x.text || "");
  if (t.length < 40 || t.length > 240) p.push(`text has ${t.length} characters (40–240)`);
  if (/["“”]/.test(t)) p.push("text quotes the source; write nodo's own takeaway");
  if (/!/.test(t)) p.push("text has an exclamation mark");
  for (const k of x.people || []) if (!/^ep:\d+$/.test(k) || (mepIds && !mepIds.has(k.slice(3)))) p.push(`person ${k} is not an MEP in meps.json`);
  if (x.stage !== undefined && typeof x.stage !== "boolean") p.push("stage must be true or false");
  if (x.paywall !== undefined && typeof x.paywall !== "boolean") p.push("paywall must be true or false");
  /* confirm: a second page stating the same fact, on the source list (media or institution) and on another site than url. */
  if (x.confirm !== undefined) {
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
    const r = /^https:\/\/[^\s]+$/.test(x.confirm || "") ? resolveSource(x.confirm, reg) : null;
    if (!r || r.excluded || !["media", "institutions"].includes(r.group)) p.push("confirm is not an https page of a media outlet or institution on nodo's source list");
    else if (host(x.confirm) === host(x.url)) p.push("confirm must be a different site than url");
  }
  return p;
}
export const idOf = (x) => crypto.createHash("sha1").update(x.file + "|" + x.url).digest("hex").slice(0, 10);

function ctx() {
  const files = JSON.parse(fs.readFileSync(path.join(ROOT, "v1/files.json"), "utf8")).files;
  const meps = JSON.parse(fs.readFileSync(path.join(ROOT, "v1/meps.json"), "utf8")).meps;
  return { fileIds: new Set(files.map((f) => f.id)), mepIds: new Set(meps.map((m) => String(m.id))) };
}
function load() { return fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { files: {} }; }
function save(doc) {
  const keepFrom = addDays(today, -cfg.keepDays);
  for (const [k, xs] of Object.entries(doc.files)) {
    doc.files[k] = xs.filter((x) => x.date >= keepFrom).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    if (!doc.files[k].length) delete doc.files[k];
  }
  const out = { generated: new Date().toISOString(), windowDays: cfg.windowDays, maxPerFile: cfg.maxPerFile, files: Object.fromEntries(Object.entries(doc.files).sort()) };
  const body = JSON.stringify(out, null, 1) + "\n";
  fs.writeFileSync(OUT, body);
  const mPath = path.join(ROOT, "v1/manifest.json"), m = JSON.parse(fs.readFileSync(mPath, "utf8"));
  m.files = m.files || {};
  m.files.press = { path: "press.json", description: "Latest developments: dated press and institutional items on nodo's files, each with nodo's own takeaway and a link to the source", bytes: Buffer.byteLength(body), sha256: crypto.createHash("sha256").update(body).digest("hex") };
  m.generated = new Date().toISOString();
  fs.writeFileSync(mPath, JSON.stringify(m, null, 1) + "\n");
  return out;
}

const PENDING = path.join(ROOT, "data-cache/press/pending.json");
function loadPending() { try { const a = JSON.parse(fs.readFileSync(PENDING, "utf8")); return Array.isArray(a) ? a.filter((p) => p && p.id && p.item) : []; } catch { return []; } }
function savePending(list) { fs.mkdirSync(path.dirname(PENDING), { recursive: true }); fs.writeFileSync(PENDING, JSON.stringify(list, null, 1) + "\n"); }

function main() {
  const args = process.argv.slice(2);
  const doc = load();
  if (args[0] === "--remove") {
    const id = args[1]; let n = 0;
    for (const k of Object.keys(doc.files)) { const before = doc.files[k].length; doc.files[k] = doc.files[k].filter((x) => x.id !== id); n += before - doc.files[k].length; }
    if (!n) { console.error(`no item ${id}`); process.exit(1); }
    save(doc); console.log(`removed ${id}`); return;
  }
  if (args[0] === "--prune") { save(doc); console.log("pruned"); return; }
  if (args[0] === "--split") {
    const [, src, autoOut, reviewOut] = args;
    if (!src || !autoOut || !reviewOut) { console.error("usage: press-merge.mjs --split <items.json> <auto.json> <review.json> [--log]"); process.exit(2); }
    const items = JSON.parse(fs.readFileSync(src, "utf8"));
    if (!Array.isArray(items)) { console.error("items file must hold a JSON array"); process.exit(2); }
    const c = ctx(), refused = [];
    items.forEach((x, i) => { const p = checkItem(x, c); if (p.length) refused.push(`item ${i + 1} (${x.url || "no url"}): ${p.join("; ")}`); });
    if (refused.length) { console.error("Refused, nothing written:\n" + refused.join("\n")); process.exit(1); }
    const fresh = items.filter((x) => !(doc.files[x.file] || []).some((y) => y.id === idOf(x)));
    /* At once only from an institution the source list names with its own inst (Parliament, Council, Commission, advisory
       bodies); a generic europa.eu page or a national source needs the double check like press reporting. */
    const sure = (x) => { const r = resolveSource(x.url); return !!(r && r.group === "institutions" && r.entry.inst && r.entry.inst === x.inst); };
    const before = loadPending();
    const v = classifyPress(fresh, undefined, { pending: before, idOf, sure });
    fs.writeFileSync(autoOut, JSON.stringify(v.auto, null, 1) + "\n");
    fs.writeFileSync(reviewOut, JSON.stringify(v.review, null, 1) + "\n");
    const done = () => console.log(JSON.stringify({ auto: v.auto.length, waiting: v.pending.length, review: v.review.length, alreadyPublished: items.length - fresh.length, overLimit: v.overLimit, reasons: v.reasons }, null, 1));
    if (!args.includes("--log")) { done(); return; }
    /* Waiting items: this run's, plus earlier ones this run did not submit again, for cfg.pendingDays at most. */
    const keepFrom = addDays(today, -(cfg.pendingDays || 14)), now = new Set(fresh.map(idOf)), published = new Set(v.auto.map(idOf));
    const carried = before.filter((p) => !now.has(p.id) && !published.has(p.id) && p.firstSeen >= keepFrom && !(doc.files[p.item.file] || []).some((y) => y.id === p.id));
    savePending([...carried, ...v.pending]);
    if (v.auto.length) logAuto(path.join(ROOT, "data-cache"), { source: "press", changes: v.auto.map((x) => ({ type: "published", name: `${x.file}: ${x.source} ${x.date}`, url: x.url, check: x.kind === "institutional" && x.stage !== true && sure(x) ? "institution's own page" : x.confirm ? "second source" : "verified on two runs" })) }).then(done);
    else done();
    return;
  }
  if (args[0] === "--pending") { console.log(JSON.stringify(loadPending().map((p) => ({ ...p.item, firstSeen: p.firstSeen })), null, 1)); return; }
  if (!args[0]) { console.error("usage: press-merge.mjs <items.json> | --remove <id> | --prune"); process.exit(2); }
  const items = JSON.parse(fs.readFileSync(args[0], "utf8"));
  if (!Array.isArray(items)) { console.error("items file must hold a JSON array"); process.exit(2); }
  const c = ctx(), refused = [];
  items.forEach((x, i) => { const p = checkItem(x, c); if (p.length) refused.push(`item ${i + 1} (${x.url || "no url"}): ${p.join("; ")}`); });
  if (refused.length) { console.error("Refused, nothing written:\n" + refused.join("\n")); process.exit(1); }
  let added = 0, kept = 0;
  for (const x of items) {
    const id = idOf(x), list = (doc.files[x.file] = doc.files[x.file] || []);
    if (list.some((y) => y.id === id)) { kept++; continue; }
    const { file, confirm, firstSeen, ...rest } = x; // confirm and firstSeen belong to the double check, not to the app
    list.push({ id, ...rest, people: rest.people || [], stage: !!rest.stage, paywall: !!rest.paywall, added: today });
    added++;
  }
  const out = save(doc);
  const total = Object.values(out.files).reduce((n, xs) => n + xs.length, 0);
  console.log(`added ${added}, already there ${kept}; press.json holds ${total} items on ${Object.keys(out.files).length} files`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
