/* nodo's source list (v1/sources.json): which outlets and institutions may appear in the app.

   resolve(url)                 -> { group: "media"|"institutions"|"analysis", entry } | { excluded: why } | null
   checkPressSource(item, file) -> problems for one press.json item (domain, kind, tier-3 mapping, outlet name)
   checkCitation(url, file)     -> problems for one files.json source

   Used by press-merge.mjs (refuses a batch), press-feeds.mjs (only listed feeds) and validate-data.mjs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let REG = null;
export function registry(reg) {
  if (reg) REG = reg;
  if (!REG) REG = JSON.parse(fs.readFileSync(path.join(ROOT, "v1/sources.json"), "utf8"));
  return REG;
}
const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
const under = (host, d) => host === d || host.endsWith("." + d);

export function resolve(url, reg = registry()) {
  const host = hostOf(url);
  if (!host) return null;
  const ex = (reg.excluded || []).find((x) => under(host, x.domain));
  if (ex) return { excluded: ex.why, domain: ex.domain };
  let best = null;
  for (const group of ["media", "institutions", "analysis"]) for (const e of reg[group] || []) for (const d of e.domains) {
    if (under(host, d) && (!best || d.length > best.domain.length)) best = { group, entry: e, domain: d };
  }
  return best;
}

export function checkPressSource(x, file, reg = registry()) {
  const r = resolve(x.url, reg);
  if (!r) return [`${hostOf(x.url) || x.url} is not on nodo's source list (v1/sources.json)`];
  if (r.excluded) return [`${r.domain} is excluded from nodo's sources: ${r.excluded}`];
  const p = [];
  if (x.kind === "press") {
    if (r.group !== "media") p.push(`${r.entry.name} is listed as ${r.group}, not media; it cannot be a press item`);
    else {
      if (r.entry.tier === 3 && !(r.entry.files || []).includes(file)) p.push(`${r.entry.name} is tier 3 and not mapped to ${file}`);
      if (x.source !== r.entry.name) p.push(`source "${x.source}" should be "${r.entry.name}" as in the source list`);
      if (x.inst !== "press") p.push(`inst should be "press" for ${r.entry.name}`);
    }
  } else if (x.kind === "institutional") {
    if (r.group !== "institutions") p.push(`${r.entry.name} is listed as ${r.group}, not an institution`);
    else if (r.entry.inst && x.inst !== r.entry.inst) p.push(`inst should be "${r.entry.inst}" for ${r.entry.name}`);
  } else if (x.kind === "analysis") {
    p.push("analysis items are not shown in 'In the press'");
  }
  return p;
}

export function checkCitation(url, file, reg = registry()) {
  const r = resolve(url, reg);
  if (!r) return [`${hostOf(url) || url} is not on nodo's source list (v1/sources.json)`];
  if (r.excluded) return [`${r.domain} is excluded from nodo's sources: ${r.excluded}`];
  if (r.group === "media" && r.entry.tier === 3 && !(r.entry.files || []).includes(file)) return [`${r.entry.name} is tier 3 and not mapped to ${file}`];
  return [];
}

/* Shape of the list itself */
export function checkRegistry(reg, fileIds) {
  const p = [], ids = new Set(), doms = new Map();
  for (const group of ["media", "institutions", "analysis"]) for (const e of reg[group] || []) {
    if (!e.id || ids.has(e.id)) p.push(`sources.json: missing or duplicate id ${e.id}`);
    ids.add(e.id);
    if (!e.name || !Array.isArray(e.domains) || !e.domains.length) p.push(`sources.json ${e.id}: name and domains are required`);
    for (const d of e.domains || []) { if (doms.has(d)) p.push(`sources.json: domain ${d} listed twice (${doms.get(d)}, ${e.id})`); doms.set(d, e.id); }
    if (group === "media") {
      if (![1, 2, 3].includes(e.tier)) p.push(`sources.json ${e.id}: tier must be 1, 2 or 3`);
      if (e.tier === 3 && !(e.files || []).length) p.push(`sources.json ${e.id}: tier 3 needs a files list`);
      for (const f of e.files || []) if (fileIds && !fileIds.has(f)) p.push(`sources.json ${e.id}: unknown file ${f}`);
      if (typeof e.paywall !== "boolean") p.push(`sources.json ${e.id}: paywall must be true or false`);
    }
  }
  for (const x of reg.excluded || []) if (doms.has(x.domain)) p.push(`sources.json: ${x.domain} is both listed and excluded`);
  return p;
}
