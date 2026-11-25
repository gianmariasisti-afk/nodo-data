/* Committee votes, pilot (25 Nov 2026).
   For each report in REPORTS (comma separated, e.g. A-10-2026-0185), read the Word file from the Parliament's
   Open Data Portal, take the "final vote by roll call by the committee responsible" table and the result line of
   the procedure table, match every name to an MEP id in v1/meps.json, and check the sums.
   Writes data-cache/committee-votes.json. Nothing in v1/ or in the app reads it yet.
   Why the Word file: doceo (www.europarl.europa.eu/doceo) answers scripts with an AWS WAF challenge (probe of 25 Nov). */
import fs from "node:fs/promises";
import zlib from "node:zlib";

const API = process.env.EP_API || "https://data.europarl.europa.eu/api/v2";
const DIST = "https://data.europarl.europa.eu/";
const REPORTS = (process.env.REPORTS || "A-10-2026-0185").split(",").map((s) => s.trim()).filter(Boolean);
const H = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "en" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Group labels as the reports print them -> nodo's group names */
const GROUPS = { PPE: "EPP", "S&D": "S&D", Renew: "Renew", "Verts/ALE": "Greens/EFA", "The Left": "The Left", ECR: "ECR", PfE: "PfE", ESN: "ESN", NI: "NI" };

/* ---------- names ---------- */
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/ø/g, "o").replace(/đ/g, "d")
  .toLowerCase().replace(/[^a-z]+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean).sort().join(" ");
const meps = JSON.parse(await fs.readFile("v1/meps.json", "utf8")).meps;
const byName = new Map(), byTokens = new Map();
for (const m of meps) {
  byName.set(norm(m.name), m);
  const t = tokens(m.name); byTokens.set(t, byTokens.has(t) ? null : m);
}
function match(name, group) {
  const n = norm(name);
  if (byName.has(n)) return { m: byName.get(n), how: "name" };
  const t = byTokens.get(tokens(name)); if (t) return { m: t, how: "tokens" };
  /* last resort: same group and every printed token inside the directory name (e.g. a second surname left out) */
  const parts = n.split(" ");
  const cands = meps.filter((m) => (!group || m.group === group) && parts.every((p) => norm(m.name).split(" ").includes(p)));
  if (cands.length === 1) return { m: cands[0], how: "partial" };
  return null;
}

/* ---------- a minimal .docx (zip) reader: central directory -> word/document.xml ---------- */
function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    if (name === wanted) {
      const lnlen = buf.readUInt16LE(local + 26), lxlen = buf.readUInt16LE(local + 28);
      const data = buf.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
      return (method === 0 ? data : zlib.inflateRawSync(data)).toString("utf8");
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error(wanted + " not in the file");
}

/* ---------- document.xml -> blocks in order: { p: "text" } or { rows: [[cell text]] } ---------- */
const dec = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const paraText = (x) => dec((x.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
  .map((t) => (t === "<w:tab/>" ? " " : t === "<w:br/>" ? "\n" : t.replace(/<[^>]+>/g, ""))).join("")).replace(/[  ]+/g, " ").trim();
const cellText = (x) => (x.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(paraText).filter(Boolean).join("\n");
function blocks(xml) {
  const body = xml.slice(xml.indexOf("<w:body>"));
  const out = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const x = m[0];
    if (x.startsWith("<w:tbl>")) out.push({ rows: (x.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((r) => (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(cellText)) });
    else { const t = paraText(x); if (t) out.push({ p: t }); }
  }
  return out;
}

/* ---------- the two sections ---------- */
const num = (s) => (/^\d+$/.test((s || "").trim()) ? Number(s.trim()) : null);
const SIGN = { "+": "for", "-": "against", "–": "against", "−": "against", "0": "abstention" };

function lastHeading(bl, re) {
  for (let i = bl.length - 1; i >= 0; i--) if (bl[i].p && re.test(bl[i].p)) return i;
  return -1;
}
function procedureFacts(bl) {
  /* the committee responsible's procedure table follows the LAST heading "PROCEDURE – COMMITTEE RESPONSIBLE"
     (the first is in the table of contents; each opinion has its own procedure table, read before it) */
  const from = lastHeading(bl, /^PROCEDURE\s*[–-]\s*COMMITTEE RESPONSIBLE/i);
  if (from < 0) return null;
  for (const b of bl.slice(from + 1)) {
    if (!b.rows) continue;
    const flat = b.rows.map((r) => r.join(" | "));
    if (!flat.some((r) => /Date adopted/i.test(r)) || !flat.some((r) => /Result of final vote/i.test(r))) continue;
    const facts = { raw: flat.slice(0, 40) };
    for (const r of b.rows) {
      const label = r[0] || "";
      if (/Date adopted/i.test(label)) facts.dateAdopted = r.slice(1).join(" ").trim();
      if (/Result of final vote/i.test(label)) {
        /* either "+: | 43" style in one cell with line breaks, or three rows; take the numbers in order */
        const nums = r.slice(1).join("\n").split(/\s+/).map(num).filter((x) => x !== null);
        if (nums.length >= 3) facts.result = { for: nums[0], against: nums[1], abstention: nums[2] };
      }
      if (/Committee responsible|Committee on the merits/i.test(label) && !facts.committee) facts.committee = r.slice(1).join(" ").trim();
    }
    if (!facts.result) {
      /* rows after "Result of final vote": "+:" | "43", "-:" | "14", "0:" | "1" */
      const i = b.rows.findIndex((r) => /Result of final vote/i.test(r[0] || ""));
      const res = {};
      for (const r of b.rows.slice(i, i + 4)) {
        const cells = r.join(" ");
        const m = cells.match(/([+\-–−0])\s*:\s*(\d+)/g);
        if (m) for (const s of m) { const [, sg, n] = s.match(/([+\-–−0])\s*:\s*(\d+)/); res[SIGN[sg]] = Number(n); }
      }
      if (Object.keys(res).length === 3) facts.result = res;
    }
    return facts;
  }
  return null;
}

function rollCall(bl) {
  const start = lastHeading(bl, /FINAL\s+VOTE\s+BY\s+ROLL\s+CALL\s+(BY|IN)\s+(THE\s+)?COMMITTEE\s+RESPONSIBLE/i);
  if (start < 0) return null;
  const columns = []; let cur = null;
  const raw = [];
  for (let i = start + 1; i < bl.length; i++) {
    const b = bl[i];
    if (b.p && /Key to symbols/i.test(b.p)) break;
    if (b.p) { raw.push(b.p); continue; }
    for (const r of b.rows) {
      const cells = r.map((c) => c.trim()).filter(Boolean);
      raw.push(cells.join(" | "));
      if (!cells.length) continue;
      /* a column header: count and sign, in either order */
      const joined = cells.join(" ").replace(/\s+/g, " ").trim();
      let hm = joined.match(/^(\d+) ([+\-–−0])$/), hv = null;
      if (hm) hv = { n: Number(hm[1]), s: hm[2] };
      else if ((hm = joined.match(/^([+\-–−0]) (\d+)$/))) hv = { n: Number(hm[2]), s: hm[1] };
      if (hv) { cur = { vote: SIGN[hv.s], printed: hv.n, groups: [] }; columns.push(cur); continue; }
      if (!cur) continue;
      const label = cells[0];
      if (GROUPS[label] !== undefined && cells.length >= 2) {
        const names = cells.slice(1).join(", ").split(/\s*,\s*|\n/).map((s) => s.trim()).filter(Boolean);
        cur.groups.push({ label, group: GROUPS[label], names });
      }
    }
  }
  return { columns, raw: raw.slice(0, 120) };
}

/* ---------- the Word file's address from the Open Data Portal ---------- */
async function getJson(url) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { headers: { ...H, Accept: "application/ld+json, application/json" } });
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    await sleep(3000 * (a + 1));
  }
  return null;
}
async function docxUrl(id) {
  /* the expression list differs by query: try with and without the language filter, keep the first that lists files */
  let work = null; const tried = [];
  const found = [];
  for (const q of ["format=application%2Fld%2Bjson", "format=application%2Fld%2Bjson&language=en", "format=application%2Fld%2Bjson&language=es"]) {
    const j = await getJson(`${API}/plenary-documents/${id}?${q}`);
    const w = j && (j.data || [])[0];
    if (!w) { tried.push(q + ": nothing"); continue; }
    work = work || w;
    const exprs = [].concat(w.is_realized_by || []);
    tried.push(`${q}: ${exprs.length} expression(s), keys ${Object.keys(w).slice(0, 30).join(",")}`);
    for (const ex of exprs) for (const man of [].concat((ex && ex.is_embodied_by) || []))
      if (man && /docx/i.test(String(man.format || man.id || "")) && man.is_exemplified_by) found.push({ lang: String(ex.language || "").slice(-3), url: DIST + String(man.is_exemplified_by).replace(/^\//, "") });
    if (found.length) break;
    await sleep(800);
  }
  const en = found.find((f) => f.lang === "ENG") || found.find((f) => /_en\.docx$/.test(f.url));
  if (en) return { url: en.url, work, tried };
  /* the list can be partial: build the English address from another language's */
  if (found[0]) return { url: found[0].url.replace(/_[a-z]{2}\.docx$/, "_en.docx"), work, built: true, tried };
  return { url: null, work, tried };
}

/* ---------- run ---------- */
const out = { generated: new Date().toISOString(), source: "Open Data Portal report (.docx): final vote by roll call by the committee responsible", reports: {} };
for (const id of REPORTS) {
  const rec = { id, ok: false, problems: [] };
  out.reports[id] = rec;
  try {
    const { url, work, built, tried } = await docxUrl(id);
    rec.docx = url; if (built) rec.docxBuilt = true; rec.apiTried = tried;
    if (work) {
      rec.label = work.label; rec.title = work.title_dcterms; rec.date = work.document_date;
      rec.procedure = ((work.inverse_created_a_realization_of || [])[0] || "").replace("eli/dl/proc/", "") || null;
      const rap = (work.workHadParticipation || []).filter((p) => /RAPPORTEUR$/.test(p.participation_role || ""));
      rec.rapporteurs = rap.map((p) => ({ id: String((p.had_participant_person || [""])[0]).replace("person/", ""), group: (p.politicalGroup || "").replace("org/", "") }));
      rec.committee = ((work.creator || []).find((c) => c.startsWith("org/")) || "").replace("org/", "") || null;
    }
    if (!url) { rec.problems.push("no Word file listed for this report"); continue; }
    const r = await fetch(url, { headers: H, redirect: "follow" });
    rec.http = r.status;
    if (!r.ok) { rec.problems.push(`Word file: HTTP ${r.status}`); continue; }
    const xml = unzipEntry(Buffer.from(await r.arrayBuffer()), "word/document.xml");
    const bl = blocks(xml);
    const proc = procedureFacts(bl);
    const rc = rollCall(bl);
    rec.dateAdopted = proc && proc.dateAdopted;
    rec.result = proc && proc.result;
    rec.debug = { procedureTable: proc && proc.raw, rollCallText: rc && rc.raw, headings: bl.map((b, i) => [i, b.p || (b.rows ? `[table ${b.rows.length} rows: ${(b.rows[0] || []).join(' | ').slice(0, 80)}]` : '')]).filter(([, t]) => /ROLL CALL|PROCEDURE|Key to symbols|^\[table/i.test(t)).slice(-40) };
    if (!rc) { rec.problems.push("roll-call section not found"); continue; }
    if (!rec.result) rec.problems.push("result of final vote not read from the procedure table");

    const votes = [], unmatched = [], tally = {};
    for (const col of rc.columns) {
      let n = 0;
      for (const g of col.groups) {
        tally[g.group] = tally[g.group] || { for: 0, against: 0, abstention: 0 };
        for (const name of g.names) {
          n++; tally[g.group][col.vote]++;
          const m = match(name, g.group);
          if (!m) { unmatched.push({ name, group: g.group, vote: col.vote }); votes.push({ id: null, name, group: g.group, vote: col.vote }); continue; }
          votes.push({ id: m.m.id, name: m.m.name, group: g.group, vote: col.vote, how: m.how === "name" ? undefined : m.how });
          if (m.m.group !== g.group) rec.problems.push(`${name}: printed under ${g.label}, nodo has ${m.m.group}`);
        }
      }
      col.counted = n;
      if (col.printed !== undefined && col.printed !== n) rec.problems.push(`${col.vote}: ${n} names under a printed ${col.printed}`);
      if (rec.result && rec.result[col.vote] !== undefined && rec.result[col.vote] !== n) rec.problems.push(`${col.vote}: ${n} names, result line says ${rec.result[col.vote]}`);
    }
    rec.columns = rc.columns.map((c) => ({ vote: c.vote, printed: c.printed, counted: c.counted }));
    rec.byGroup = tally;
    rec.votes = votes;
    rec.unmatched = unmatched;
    if (unmatched.length) rec.problems.push(`${unmatched.length} name(s) not matched to an MEP`);
    if (rc.columns.length !== 3) rec.problems.push(`${rc.columns.length} vote column(s) read, 3 expected`);
    /* committee membership check: every voter should sit on the committee, as member or substitute */
    if (rec.committee) {
      const off = votes.filter((v) => v.id).filter((v) => {
        const m = meps.find((x) => x.id === v.id);
        return !(m.committees || []).some((c) => c.abbr === rec.committee);
      });
      if (off.length) rec.notOnCommittee = off.map((v) => v.name); /* reported, not a failure: membership changes after the vote */
    }
    rec.ok = rec.problems.length === 0;
  } catch (e) { rec.problems.push(String(e && e.message || e)); }
  await sleep(1500);
}

await fs.mkdir("data-cache", { recursive: true });
await fs.writeFile("data-cache/committee-votes.json", JSON.stringify(out, null, 1) + "\n");
for (const r of Object.values(out.reports)) {
  console.log(`${r.id} ${r.ok ? "OK" : "CHECK"} ${r.committee || "?"} ${r.dateAdopted || "?"} result ${JSON.stringify(r.result || null)} columns ${JSON.stringify(r.columns || [])}`);
  for (const p of r.problems) console.log("  - " + p);
}
