#!/usr/bin/env node
/* In the press, step 2 of 2: merge reviewed items into v1/press.json.

   node scripts/press-merge.mjs <items.json>     add items (a JSON array, see checkItem), rewrite press.json and its manifest entry
   node scripts/press-merge.mjs --remove <id>     drop one published item
   node scripts/press-merge.mjs --prune           only drop items older than keepDays

   Every item is checked here and again by scripts/validate-data.mjs. An item that fails is refused with the reason and
   nothing is written. Items already published (same file and url) are kept as they are. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkPressSource } from "./sources.mjs";

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
  m.files.press = { path: "press.json", description: "In the press: dated press and institutional items on nodo's files, each with nodo's own takeaway and a link to the source", bytes: Buffer.byteLength(body), sha256: crypto.createHash("sha256").update(body).digest("hex") };
  m.generated = new Date().toISOString();
  fs.writeFileSync(mPath, JSON.stringify(m, null, 1) + "\n");
  return out;
}

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
    const { file, ...rest } = x;
    list.push({ id, ...rest, people: rest.people || [], stage: !!rest.stage, paywall: !!rest.paywall, added: today });
    added++;
  }
  const out = save(doc);
  const total = Object.values(out.files).reduce((n, xs) => n + xs.length, 0);
  console.log(`added ${added}, already there ${kept}; press.json holds ${total} items on ${Object.keys(out.files).length} files`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
