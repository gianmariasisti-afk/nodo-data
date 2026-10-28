#!/usr/bin/env node
/* In the press, step 1 of 2: collect candidates from public feeds (runs every day on GitHub, .github/workflows/press.yml).

   Reads the feeds in tools/press/config.json, keeps the entries that name one of the pilot files (title or summary
   match a file's search terms: short name, procedure numbers, Commission reference, aliases), and writes them to
   data-cache/press/candidates.json. Nothing here reaches the app: the Mon/Thu cloud task reads the candidates, adds
   web search, applies the inclusion test and proposes items through scripts/press-merge.mjs.

   node scripts/press-feeds.mjs            collect
   node scripts/press-feeds.mjs --packs    print the search pack of every pilot file (used by the cloud task) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "data-cache", "press");
const args = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/press/config.json"), "utf8"));
const files = JSON.parse(fs.readFileSync(path.join(ROOT, "v1/files.json"), "utf8")).files;
const meps = JSON.parse(fs.readFileSync(path.join(ROOT, "v1/meps.json"), "utf8")).meps;
const MEP = new Map(meps.map((m) => [String(m.id), m]));
const today = new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- search packs ---------- */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* Short or all-caps terms (IAA, MFF, AI Act) match case-sensitively; longer ones ignore case. */
const termRe = (t) => new RegExp(`(^|[^\\p{L}\\p{N}])${reEsc(t)}(?=$|[^\\p{L}\\p{N}])`, t.length <= 6 || t === t.toUpperCase() ? "u" : "iu");
export function packOf(f) {
  const terms = new Set([f.short, ...(cfg.aliases[f.id] || [])]);
  for (const p of [f.procedure, ...(f.procedures || []), ...(f.parts || []).map((x) => x.procedure)]) if (p) terms.add(p);
  if (f.proposal) terms.add(String(f.proposal));
  const docs = [...String(f.status || "").matchAll(/\b(\d{4,5}\/\d{2})\b/g)].map((m) => m[1]);
  docs.forEach((d) => terms.add(d));
  const people = (f.meps || []).filter((m) => m.role === "rapporteur" || m.role === "shadow").map((m) => {
    const o = MEP.get(String(m.id)); return o ? { key: "ep:" + m.id, name: o.given + " " + o.family, family: o.family, group: o.group, role: m.role } : null;
  }).filter(Boolean);
  return { id: f.id, short: f.short, title: f.title, terms: [...terms].filter(Boolean), exclude: cfg.exclude[f.id] || [], people, councilDocs: docs };
}
const PACKS = cfg.pilot.map((id) => files.find((f) => f.id === id)).filter(Boolean).map(packOf);

if (args.includes("--packs")) { console.log(JSON.stringify(PACKS, null, 1)); process.exit(0); }

/* ---------- feeds ---------- */
const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (block, names) => { for (const n of names) { const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i")); if (m) return m[1]; } return ""; };
const isoOf = (s) => { const d = new Date(decode(s)); return isNaN(d) ? null : d.toISOString().slice(0, 10); };
export function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const b = m[2];
    let link = decode(tag(b, ["link"]));
    if (!link) { const a = b.match(/<link[^>]*href="([^"]+)"/i); link = a ? a[1] : ""; }
    out.push({ title: decode(tag(b, ["title"])), url: link.trim(), date: isoOf(tag(b, ["pubDate", "published", "updated", "dc:date"])), summary: decode(tag(b, ["description", "summary", "content"])).slice(0, 600) });
  }
  return out.filter((x) => x.title && /^https:\/\//.test(x.url));
}
export function matchFiles(entry, packs = PACKS) {
  const text = entry.title + " " + entry.summary;
  return packs.filter((p) => !p.exclude.some((t) => termRe(t).test(text)) && p.terms.some((t) => termRe(t).test(text)))
    .map((p) => ({ file: p.id, people: p.people.filter((x) => termRe(x.family).test(text)).map((x) => x.key) }));
}
async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": "nodo-data/1.0 (+https://gianmariasisti-afk.github.io/nodo-data/)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(25000), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(t.slice(0, 2000))) throw new Error("not a feed (bot check or HTML page)");
  return t;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const candPath = path.join(CACHE, "candidates.json"), statPath = path.join(CACHE, "feeds.json");
  const prev = fs.existsSync(candPath) ? JSON.parse(fs.readFileSync(candPath, "utf8")) : { items: [] };
  const byUrl = new Map(prev.items.map((x) => [x.url, x]));
  const status = {};
  const from = addDays(today, -cfg.windowDays);
  for (const feed of cfg.feeds) {
    if (feed.skip) { status[feed.id] = { ok: false, skipped: feed.skip, checked: today }; continue; }
    let xml = null;
    try {
      xml = await get(feed.url);
      const entries = parseFeed(xml);
      let hits = 0;
      for (const e of entries) {
        if (!e.date || e.date < from || e.date > addDays(today, 1)) continue;
        const m = matchFiles(e); if (!m.length) continue;
        hits++;
        const old = byUrl.get(e.url);
        byUrl.set(e.url, { ...e, feed: feed.id, source: feed.name, inst: feed.inst, kind: feed.kind, files: m.map((x) => x.file), people: [...new Set(m.flatMap((x) => x.people))], seen: old ? old.seen : today });
      }
      status[feed.id] = { ok: true, entries: entries.length, matched: hits, checked: today };
    } catch (e) {
      status[feed.id] = { ok: false, error: String(e && e.message || e).slice(0, 160), checked: today };
    }
  }
  const keepFrom = addDays(today, -cfg.keepDays);
  const items = [...byUrl.values()].filter((x) => x.date >= keepFrom).sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
  fs.writeFileSync(candPath, JSON.stringify({ generated: new Date().toISOString(), windowDays: cfg.windowDays, items }, null, 1) + "\n");
  fs.writeFileSync(statPath, JSON.stringify({ checked: today, feeds: status }, null, 1) + "\n");
  const ok = Object.values(status).filter((s) => s.ok).length;
  console.log(`feeds: ${ok} of ${cfg.feeds.filter((f) => !f.skip).length} answered; candidates: ${items.length} (${items.filter((x) => x.seen === today).length} new today)`);
  for (const [id, s] of Object.entries(status)) console.log(` ${s.ok ? "ok  " : s.skipped ? "skip" : "FAIL"} ${id}${s.ok ? `: ${s.entries} entries, ${s.matched} on nodo files` : `: ${s.error || s.skipped}`}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
