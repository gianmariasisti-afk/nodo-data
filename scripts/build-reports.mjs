#!/usr/bin/env node
/* Builds v1/reports.json: every Parliament report and opinion found in the MEP activity files
 * (v1/activity/<mepId>.json), with its rapporteur and shadows. The app uses it for automatic pages:
 * a file that has no curated page still shows who handles it.
 *
 *   node scripts/build-reports.mjs
 *
 * Source: the Parliament's open data, as already collected by the "Update MEP activity" workflow.
 * Nothing is fetched here. Re-run after the activity data refreshes to bring the index up to date.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACT = join(ROOT, "v1", "activity");
const OUT = join(ROOT, "v1");

/* "DRAFT REPORT on the proposal for a regulation … amending X" → "Regulation amending X". Keeps the words that name the file. */
function shortTitle(t) {
  let s = String(t || "").replace(/\s+/g, " ").trim();
  const second = /SECOND READING on the Council position at first reading with a view to the adoption of an? /i;
  if (second.test(s)) s = "Second reading: " + s.split(second)[1];
  /* Drop the all-capitals label at the start ("DRAFT REPORT", "BUDGETARY ASSESSMENT", "OPINION") and a linking "on the". */
  else s = s.replace(/^(?:[A-Z][A-Z'’-]+\s+)+(?:(?:on|for|of|containing|with)\s+(?:the\s+)?)?/, "");
  s = s.replace(/^proposal for an? (regulation|directive|decision) of the European Parliament and of the Council /i, (m, k) => k[0].toUpperCase() + k.slice(1) + " ");
  s = s.replace(/^proposal for an? (council )?(regulation|directive|decision) /i, (m, c, k) => (c ? "Council " : "") + k + " ");
  s = s.replace(/^(Second reading: )(regulation|directive|decision) of the European Parliament and of the Council /i, (m, a, k) => a + k + " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const kindOf = (it) => {
  const draft = /^DRAFT/i.test(it.title || "") || /-PR-/.test(it.id);
  if (it.type === "opinion") return draft ? "Draft opinion" : "Opinion";
  return draft ? "Draft report" : "Report";
};

const docs = new Map();
for (const f of readdirSync(ACT)) {
  if (!f.endsWith(".json")) continue;
  let d;
  try { d = JSON.parse(readFileSync(join(ACT, f), "utf8")); } catch { continue; }
  if (!Array.isArray(d.items)) continue;
  const mep = String(d.id);
  for (const it of d.items) {
    if (it.type !== "report" && it.type !== "opinion") continue;
    let doc = docs.get(it.id);
    if (!doc) {
      const meta = String(it.meta || "");
      doc = { id: it.id, kind: kindOf(it), cmte: meta.split(" · ")[0] || it.id.split("-")[0], date: it.date || "", title: shortTitle(it.title), full: it.title,
        ref: it.ref || "", pdf: it.pdf || "", rap: [], sh: [], rapName: "" };
      docs.set(it.id, doc);
    }
    if (it.date && it.date > doc.date) doc.date = it.date;
    if (/^rapporteur$/i.test(it.role || "")) { if (!doc.rap.includes(mep)) doc.rap.push(mep); }
    else if (!doc.sh.includes(mep)) doc.sh.push(mep);
    const named = /Rapporteur:\s*([^·]+)/.exec(it.meta || "");
    if (named && !doc.rapName) doc.rapName = named[1].trim();
  }
}

const list = [...docs.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)));
const out = { generated: new Date().toISOString(), source: "European Parliament open data, via nodo's MEP activity files (v1/activity)", count: list.length, docs: list };
writeFileSync(join(OUT, "reports.json"), JSON.stringify(out));
console.log(`reports.json: ${list.length} documents, ${list.filter((d) => d.rap.length).length} with a rapporteur in nodo's MEP list`);
