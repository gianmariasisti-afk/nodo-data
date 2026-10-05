/* Commission and cabinets updater.
   Reads the College page and each commissioner's team page on commission.europa.eu, compares them with v1/commission.json and
   - merges small changes (phone, responsibilities, outside-portfolio items, country coordination) into v1/commission.json,
   - writes structural changes (people added or removed, role changes, commissioner added or removed) to data-cache/commission-structural.json
     and the full proposal to data-cache/commission-proposed.json, for the workflow to put on a review branch.
   data-cache/commission-report.json says what the run parsed, for diagnosis. REPORT_ONLY=1 writes nothing else. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V1 = path.join(ROOT, "v1"), CACHE = path.join(ROOT, "data-cache");
const BASE = "https://commission.europa.eu";
const COLLEGE = BASE + "/about/organisation/college-commissioners_en";
const H = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", Accept: "text/html,*/*;q=0.8", "Accept-Language": "en" };
const REPORT_ONLY = process.env.REPORT_ONLY === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p, d) => { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return d; } };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const nk = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const COUNTRY = { austria: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY", czechia: "CZ", "czech republic": "CZ", denmark: "DK", estonia: "EE", finland: "FI", france: "FR", germany: "DE", greece: "GR", hungary: "HU", ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT", luxembourg: "LU", malta: "MT", netherlands: "NL", poland: "PL", portugal: "PT", romania: "RO", slovakia: "SK", slovenia: "SI", spain: "ES", sweden: "SE" };

async function get(url) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { headers: H, redirect: "follow" }); if (r.ok) return await r.text(); if (r.status === 404) return null; } catch { /* retry */ }
    await sleep(2500 * (a + 1));
  }
  throw new Error("fetch failed " + url);
}
const ENT = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#039;": "'", "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&rsquo;": "’", "&lsquo;": "‘", "&ndash;": "–", "&mdash;": "—" };
const dec = (s) => s.replace(/&[a-z]+;|&#\d+;/gi, (m) => ENT[m] ?? (/^&#(\d+);$/.test(m) ? String.fromCharCode(+m.slice(2, -1)) : m));
export function toLines(html) {
  const main = (html.match(/<main[\s\S]*<\/main>/) || [html])[0];
  return dec(main.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<\/(p|li|div|h[1-6]|tr|ul|ol|section|article)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const deob = (s) => s.replace(/\s*\[\s*dot\s*\]\s*/gi, ".").replace(/\s*\[\s*at\s*\]\s*/gi, "@");
const isRole = (l) => /^[A-Z][A-Z0-9 /,&()'’.:-]{2,90}$/.test(l) && /[A-Z]{3}/.test(l) && !/^(EMAIL|PHONE|RESPONSIBILITIES|PRESS CONTACTS)\b/.test(l);

/* A team page lists people as: Name / ROLE / Email: … / Phone number: … / Responsibilities / items / Responsibilities outside the portfolio / items / Country coordinator: … */
export function parseTeam(lines) {
  const people = []; let cur = null, mode = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isRole(l) && lines[i - 1] && /^(Email:|Email\b)/i.test(lines[i + 1] || "") && !/^(Email|Phone)/i.test(lines[i - 1])) {
      const rawName = lines[i - 1], ann = (rawName.match(/\(([^)]*)\)\s*$/) || [])[1] || "";
      if (/^vacant$/i.test(rawName.replace(/\(.*$/, "").trim())) { cur = null; continue; }
      cur = { name: rawName.replace(/\s*\([^)]*\)\s*$/, "").trim(), note: ann, role: l, email: "", phone: "", resp: [], outside: [], countries: [] }; people.push(cur); mode = ""; continue;
    }
    if (!cur) continue;
    if (/^Email:/i.test(l)) { const m = deob(l.replace(/^Email:\s*/i, "")); const mm = m.match(/([\w.+-]+)(?:@|\s+)((?:ec|ext\.ec)\.europa\.eu)/); const e = mm ? mm[1] + "@" + mm[2] : ""; const raw = (l.match(/\(([^)]*\[at\][^)]*)\)/) || [])[1]; cur.email = e || (raw ? deob(raw) : ""); mode = ""; continue; }
    if (/^Phone number:/i.test(l)) { cur.phone = l.replace(/^Phone number:\s*/i, "").trim(); mode = ""; continue; }
    if (/^Responsibilities outside the portfolio/i.test(l)) { mode = "outside"; continue; }
    if (/^Responsibilities$/i.test(l)) { mode = "resp"; continue; }
    if (/^Country coordinator:?/i.test(l)) { cur.countries = l.replace(/^Country coordinator:?\s*/i, "").split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((x) => COUNTRY[x.toLowerCase()] || x); mode = ""; continue; }
    if (isRole(lines[i + 1] || "") && /^Email/i.test(lines[i + 2] || "")) continue; /* next person's name */
    if (mode === "resp") cur.resp.push(l); else if (mode === "outside") cur.outside.push(l);
  }
  return people;
}
const keepEmail = (e) => (/^cab-/.test(e) ? e : "");
const roleClass = (role) => (/head of cabinet|director of coordination|cabinet expert/i.test(role) ? "lead" : /assistant|officer|logistics|secretary|registry|document|mission/i.test(role) && !/adviser|member/i.test(role) ? "office" : "policy");
const tidyRole = (r) => r.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bOf\b/g, "of").replace(/\bAnd\b/g, "and").replace(/\bTo\b/g, "to").replace(/\//g, " / ").replace(/\s+/g, " ").trim();

async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  const cm = await readJson(path.join(V1, "commission.json"), null);
  if (!cm) throw new Error("v1/commission.json missing");
  const report = { run: new Date().toISOString(), college: {}, teams: {} };
  const html = await get(COLLEGE);
  const NOT_PEOPLE = /^(commissioners-project-groups|calendar-items|former-|college-commissioners)/;
  const slugs = [...new Set([...html.matchAll(/href="(?:https:\/\/commission\.europa\.eu)?\/about\/organisation\/college-commissioners\/([a-z0-9-]+)_en"/g)].map((m) => m[1]).filter((x) => !NOT_PEOPLE.test(x)))];
  const have = new Set(cm.college.filter((m) => m.kind !== "president").map((m) => m.slug));
  report.college = { found: slugs.length, added: slugs.filter((s) => !have.has(s)), removed: [...have].filter((s) => !slugs.includes(s)) };
  const structural = [], auto = [];
  const next = JSON.parse(JSON.stringify(cm)), proposed = JSON.parse(JSON.stringify(cm));
  let failed = 0;

  for (const m of cm.college) {
    if (m.kind === "president") { report.teams[m.slug] = { skipped: "president: cabinet page not covered yet" }; continue; }
    const idx = cm.college.indexOf(m);
    let teamUrl = null;
    try {
      const page = await get(`${BASE}/about/organisation/college-commissioners/${m.slug}_en`);
      const t = page && page.match(new RegExp(`href="((?:https://commission\\.europa\\.eu)?/about/organisation/college-commissioners/${m.slug}/[^"]*team_en)"`));
      if (t) teamUrl = t[1].startsWith("http") ? t[1] : BASE + t[1];
    } catch { failed++; report.teams[m.slug] = { error: "commissioner page" }; continue; }
    await sleep(900);
    if (!teamUrl) { report.teams[m.slug] = { error: "no team link" }; continue; }
    let people;
    try { people = parseTeam(toLines(await get(teamUrl))); } catch { failed++; report.teams[m.slug] = { error: "team page" }; continue; }
    await sleep(900);
    const old = new Map(m.cabinet.map((p) => [nk(p.name), p]));
    const nw = new Map(people.map((p) => [nk(p.name), p]));
    const added = people.filter((p) => !old.has(nk(p.name))), removed = m.cabinet.filter((p) => !nw.has(nk(p.name)));
    report.teams[m.slug] = { url: teamUrl, parsed: people.length, existing: m.cabinet.length, added: added.map((p) => p.name), removed: removed.map((p) => p.name) };
    if (people.length < Math.max(3, Math.floor(m.cabinet.length * 0.5))) { report.teams[m.slug].skipped = "parsed far fewer people than before; page layout probably changed"; failed++; continue; }

    for (const p of people) {
      const o = old.get(nk(p.name)); if (!o) continue;
      if (nk(tidyRole(p.role)) !== nk(o.role) && nk(p.role) !== nk(o.role)) structural.push({ type: "role", commissioner: m.slug, name: p.name, from: o.role, to: p.role });
      const np = next.college[idx].cabinet.find((x) => x.k === o.k), pp = proposed.college[idx].cabinet.find((x) => x.k === o.k);
      const upd = {};
      if (p.phone && p.phone !== o.phone) upd.phone = p.phone;
      if ((p.note || "") !== (o.note || "")) upd.note = p.note || "";
      if (JSON.stringify(p.resp) !== JSON.stringify(o.resp) && p.resp.length) upd.resp = p.resp;
      if (JSON.stringify(p.outside) !== JSON.stringify(o.outside)) upd.outside = p.outside;
      if (JSON.stringify(p.countries) !== JSON.stringify(o.countries)) upd.countries = p.countries;
      const em = keepEmail(p.email); if (em && em !== o.email) upd.email = em;
      if (Object.keys(upd).length) { Object.assign(np, upd); Object.assign(pp, upd); auto.push({ commissioner: m.slug, name: p.name, fields: Object.keys(upd), diff: Object.fromEntries(Object.keys(upd).map((k) => [k, { from: o[k], to: upd[k] }])) }); }
    }
    for (const p of added) {
      structural.push({ type: "added", commissioner: m.slug, name: p.name, role: p.role });
      proposed.college[idx].cabinet.push({ k: `${m.slug}~${slugify(p.name)}`, name: p.name, note: p.note || "", role: tidyRole(p.role), cls: roleClass(p.role), team: "", email: keepEmail(p.email), phone: p.phone, resp: p.resp, outside: p.outside, countries: p.countries });
    }
    for (const p of removed) {
      structural.push({ type: "removed", commissioner: m.slug, name: p.name, role: p.role });
      proposed.college[idx].cabinet = proposed.college[idx].cabinet.filter((x) => x.k !== p.k);
    }
  }
  for (const s of report.college.added) structural.push({ type: "commissioner-added", slug: s });
  for (const s of report.college.removed) structural.push({ type: "commissioner-removed", slug: s });

  report.auto = auto.slice(0, 60); report.structural = structural;
  report.summary = { auto: auto.length, structural: structural.length, failed };
  await fs.writeFile(path.join(CACHE, "commission-report.json"), JSON.stringify(report, null, 1) + "\n");
  if (!REPORT_ONLY) {
    const today = new Date().toISOString().slice(0, 10);
    if (auto.length) {
      next.fetched = today; next.source = cm.source;
      const buf = Buffer.from(JSON.stringify(next));
      await fs.writeFile(path.join(V1, "commission.json"), buf);
      const mp = path.join(V1, "manifest.json"), man = await readJson(mp, null);
      if (man && man.files && man.files.commission) { man.files.commission = { ...man.files.commission, bytes: buf.length, sha256: sha(buf) }; man.generated = new Date().toISOString(); await fs.writeFile(mp, JSON.stringify(man, null, 1) + "\n"); }
    }
    if (structural.length) {
      proposed.fetched = today;
      await fs.writeFile(path.join(CACHE, "commission-structural.json"), JSON.stringify({ at: today, changes: structural }, null, 1) + "\n");
      await fs.writeFile(path.join(CACHE, "commission-proposed.json"), JSON.stringify(proposed));
    } else { await fs.rm(path.join(CACHE, "commission-structural.json"), { force: true }); await fs.rm(path.join(CACHE, "commission-proposed.json"), { force: true }); }
  }
  console.log(JSON.stringify({ college: report.college, summary: report.summary }, null, 1));
  if (failed > 5) process.exit(1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
