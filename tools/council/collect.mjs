/* nodo Council collector: the browser half of the weekly Council refresh.

   consilium.europa.eu answers 403 to GitHub runners, so this module runs in a desktop browser tab opened on
   https://www.consilium.europa.eu and reads, from that tab:
   - the meeting calendar (category=meeting) from the first day of this month to the end of the year, at least 6 months ahead
   - the Coreper I and II dates (category=mpo, PreparatoryBody=-3) over the same start and the next 9 months
   - the official list of participants (PDF, parsed with pdf.js) of every formal Council meeting of the last 60 days that the
     repository cache (data-cache/council-raw.json, read from GitHub Pages) does not hold yet
   tools/council/pull.py merges the collection into the cache and rebuilds v1/council.json with tools/build-council.py.

   Use, in the tab (javascript):
     const src = await (await fetch('https://gianmariasisti-afk.github.io/nodo-data/tools/council/collect.mjs', {cache: 'no-store'})).text();
     const m = await import(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
     m.start();                       // returns at once; the work goes on in the tab
     window.__nodoCouncil.summary     // poll until state is "done" or "failed"
     window.__nodoCouncil.payload     // the collection as one JSON string; summary.sha256 is its SHA-256
   start() options: {since: 'YYYY-MM-DD'} reads participant lists from that date; {all: true} ignores the cache;
   {post: true} also posts the collection to the Supabase table council_inbox (see tools/council/README.md). */

export const PARSER = "v4";
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
const SITE = "https://gianmariasisti-afk.github.io/nodo-data/";
const FORMAL = /^\/en\/meetings\/(agrifish|compet|ecofin|eycs|epsco|env|fac|gac|jha|tte)\/\d{4}\//;
const COUNTRY = {
  BELGIUM: "BE", BULGARIA: "BG", CZECHIA: "CZ", CZECHREPUBLIC: "CZ", DENMARK: "DK", GERMANY: "DE", ESTONIA: "EE", IRELAND: "IE",
  GREECE: "GR", SPAIN: "ES", FRANCE: "FR", CROATIA: "HR", ITALY: "IT", CYPRUS: "CY", LATVIA: "LV", LITHUANIA: "LT", LUXEMBOURG: "LU",
  HUNGARY: "HU", MALTA: "MT", NETHERLANDS: "NL", THENETHERLANDS: "NL", AUSTRIA: "AT", POLAND: "PL", PORTUGAL: "PT", ROMANIA: "RO",
  SLOVENIA: "SI", SLOVAKIA: "SK", FINLAND: "FI", SWEDEN: "SE",
};
const OTHERS = /^(COMMISSION|GENERAL SECRETARIAT|EUROPEAN|OTHER PARTICIPANTS|EEAS|HIGH REPRESENTATIVE)/;
const HONORIFIC = /^(Mr|Ms|Mrs|Dr|Mme|M\.|H\.E\.|Sir|Lady|Prof)\b/;
const SHORT = [
  [/^Employment, Social Policy, Health and Consumer Affairs Council/, "EPSCO"],
  [/^Transport, Telecommunications and Energy Council/, "TTE Council"],
  [/^Justice and Home Affairs Council/, "JHA Council"],
  [/^Education, Youth, Culture and Sports? Council/, "EYCS Council"],
  [/^Agriculture and Fisheries Council/, "AGRIFISH Council"],
  [/^Economic and Financial Affairs Council/, "ECOFIN"],
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const T = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
export const todayBrussels = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
export const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const maxIso = (a, b) => (a > b ? a : b);
export const dayOf = (t) => {
  const m = T(t).match(/^(\d{1,2}) ([A-Z][a-z]+) (20\d\d)$/);
  const i = m ? MONTHS.indexOf(m[2]) : -1;
  return i < 0 ? null : `${m[3]}-${pad(i + 1)}-${pad(m[1])}`;
};

async function get(url, as = "text", tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return as === "buffer" ? await r.arrayBuffer() : await r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}
const page = async (url) => { const t = await get(url); return t == null ? null : new DOMParser().parseFromString(t, "text/html"); };

/* One calendar listing, all pages. Returns [{href, title, days: [iso]}] in page order. */
export async function calendar(params) {
  const found = new Map();
  let n = 1, last = 1;
  do {
    const d = await page(`/en/meetings/calendar/?${params}&page=${n}`);
    if (!d) throw new Error(`calendar page ${n} missing (${params})`);
    const main = d.querySelector("main") || d.body;
    let day = null;
    for (const el of main.querySelectorAll("h2, h3, h4, a[href^='/en/meetings/']")) {
      if (el.tagName !== "A") { day = dayOf(el.textContent); continue; }
      const href = el.getAttribute("href");
      if (!day || href.startsWith("/en/meetings/calendar")) continue;
      const m = found.get(href) || { href, title: T(el.textContent), days: [] };
      if (!m.days.includes(day)) m.days.push(day);
      found.set(href, m);
    }
    if (n === 1) {
      const a = [...d.querySelectorAll("a")].find((x) => /last page/i.test(x.textContent));
      const p = a && (a.getAttribute("href") || "").match(/[?&]page=(\d+)/);
      last = p ? Number(p[1]) : 1;
    }
    n++;
    await sleep(250);
  } while (n <= last);
  return [...found.values()];
}

/* Calendar line "start[>end]|code|title|href". The dates come from the URL (/2026/09/30-01/ is 30 September to
   1 October), so a meeting that started before the window keeps its real start. */
export function calLine(m) {
  const code = m.href.split("/")[3];
  const days = [...m.days].sort();
  const u = m.href.match(/\/(\d{4})\/(\d\d)\/(\d\d)(?:-(\d\d))?\//);
  let start = days[0], end = days[days.length - 1];
  if (u) {
    start = `${u[1]}-${u[2]}-${u[3]}`;
    if (u[4]) {
      let y = Number(u[1]), mo = Number(u[2]);
      if (Number(u[4]) < Number(u[3])) { mo++; if (mo > 12) { mo = 1; y++; } }
      end = `${y}-${pad(mo)}-${u[4]}`;
    } else end = maxIso(start, end || start);
  }
  let title = m.title.replace(/,\s*\d{1,2}(\s+[A-Z][a-z]+)?(\s+20\d\d)?\s*[-–]\s*\d{1,2}\s+[A-Z][a-z]+\s+20\d\d\s*$/, "").replace(/,\s*\d{1,2}\s+[A-Z][a-z]+\s+20\d\d\s*$/, "");
  for (const [re, s] of SHORT) title = title.replace(re, s);
  return `${start}${end && end !== start ? ">" + end : ""}|${code}|${T(title)}|${m.href}`;
}

/* Text rows of a participants PDF: [{left, right}] top to bottom, page after page. Items within 2.5pt of height
   share a row; the name column is left of x=200, the function column right of it. */
async function pdfRows(buf, pdfjs) {
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      out.push({ left: T(r.items.filter((i) => i.x < 200).map((i) => i.s).join(" ")), right: T(r.items.filter((i) => i.x >= 200).map((i) => i.s).join(" ")) });
    }
  }
  return out;
}

/* {country: [[name, function], ...]} from the rows of an English list of participants. A list in French only
   gives {} (no English country headers). */
export function parseParticipants(rows) {
  const res = {};
  let cur = null, last = null;
  for (const { left: lt, right: rt } of rows) {
    const k = lt.replace(/\s+/g, "");
    if (k && k === k.toUpperCase() && COUNTRY[k]) { cur = COUNTRY[k]; res[cur] = res[cur] || []; last = null; continue; }
    if (OTHERS.test(lt)) { cur = null; last = null; continue; }
    if (!cur) continue;
    if (HONORIFIC.test(lt)) { last = [lt, rt]; res[cur].push(last); }
    else if (!lt && rt && last) last[1] = T(last[1] + " " + rt);
    else if (lt && last && !rt && !/^\d/.test(lt)) last[0] = T(last[0] + " " + lt);
  }
  for (const c of Object.keys(res)) if (!res[c].length) delete res[c];
  return res;
}

async function sha256Hex(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function post(body, sha) {
  const cfg = await get(SITE + "config.js");
  const url = cfg && cfg.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
  const key = cfg && cfg.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error("config.js has no Supabase project");
  const r = await fetch(url + "/rest/v1/council_inbox", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ sha256: sha, body }),
  });
  if (!r.ok) throw new Error(`council_inbox answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status;
}

export async function collect(opts = {}) {
  if (!/consilium\.europa\.eu$/.test(location.hostname)) throw new Error("run this on a www.consilium.europa.eu tab");
  const st = window.__nodoCouncil;
  const step = (s) => { st.summary.step = s; };
  const t = todayBrussels();
  const from = t.slice(0, 8) + "01";
  const to = maxIso(`${t.slice(0, 4)}-12-31`, addDays(t, 183));
  const q = (cat, a, b, extra = "") => `category=${cat}&DateFrom=${a.replaceAll("-", "/")}&DateTo=${b.replaceAll("-", "/")}${extra}`;

  step("meeting calendar");
  const cal = (await calendar(q("meeting", from, to))).map(calLine);
  cal.sort((a, b) => a.split("|")[0].slice(0, 10).localeCompare(b.split("|")[0].slice(0, 10)));

  step("Coreper dates");
  const cor = new Map();
  for (const m of await calendar(q("mpo", from, addDays(t, 270), "&PreparatoryBody=-3"))) {
    const k = T(m.title).match(/^Coreper (I|II)$/);
    if (!k) continue;
    for (const d of m.days) { const s = cor.get(d) || new Set(); s.add(k[1]); cor.set(d, s); }
  }
  const coreper = [...cor.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, s]) => [d, ["I", "II"].filter((x) => s.has(x))]);

  step("formal meetings held");
  const since = opts.since || addDays(t, -60);
  const held = (await calendar(q("meeting", since, t))).filter((m) => FORMAL.test(m.href) && !/^informal/i.test(m.title));
  let cache = null;
  if (!opts.all) {
    try { const c = await get(SITE + "data-cache/council-raw.json"); cache = c ? JSON.parse(c) : null; } catch { cache = null; }
  }
  const done = new Set(((cache && cache.parts) || []).filter((p) => p.data != null).map((p) => p.href));
  const todo = held.filter((m) => !done.has(m.href));

  const pdfjs = todo.length ? await import(PDFJS) : null;
  if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  const parts = [], noList = [], partial = [], errors = [];
  for (const [i, m] of todo.entries()) {
    step(`participant list ${i + 1} of ${todo.length}`);
    try {
      const d = await page(m.href);
      const title = T(d && d.querySelector("h1") && d.querySelector("h1").textContent) || m.title;
      const a = d && [...d.querySelectorAll("a")].find((x) => /list of participants/i.test(x.textContent));
      const pdf = a ? a.getAttribute("href").replace(/^https:\/\/www\.consilium\.europa\.eu/, "") : null;
      if (!pdf) { parts.push({ href: m.href, title, pdf: null, data: null }); noList.push(m.href); continue; }
      const buf = await get(pdf, "buffer");
      const data = buf ? parseParticipants(await pdfRows(buf, pdfjs)) : null;
      const n = data ? Object.keys(data).length : 0;
      if (data && n < 25) partial.push({ href: m.href, countries: n });
      parts.push({ href: m.href, title, pdf, data });
    } catch (e) {
      errors.push(`${m.href}: ${String(e && e.message || e).slice(0, 160)}`);
    }
    await sleep(300);
  }

  const payload = { fetched: t, parser: PARSER, window: { meetings: [from, to], coreper: [from, addDays(t, 270)], parts: [since, t] }, cal, coreper, parts };
  const body = JSON.stringify(payload);
  const sha = await sha256Hex(body);
  st.payload = body;
  Object.assign(st.summary, {
    fetched: t, sha256: sha, bytes: new TextEncoder().encode(body).length, meetings: cal.length, coreper: coreper.length,
    held: held.length, cached: held.length - todo.length, read: parts.filter((p) => p.data && Object.keys(p.data).length).length,
    noList, partial, errors,
  });
  if (opts.post) { step("posting"); st.summary.posted = await post(body, sha); }
  return st.summary;
}

/* Starts the collection without waiting for it, so each browser call stays short. */
export function start(opts = {}) {
  window.__nodoCouncil = { summary: { state: "running", started: new Date().toISOString(), step: "starting" }, payload: null };
  collect(opts).then(
    () => { window.__nodoCouncil.summary.state = "done"; },
    (e) => { Object.assign(window.__nodoCouncil.summary, { state: "failed", error: String(e && e.stack || e).slice(0, 600) }); },
  );
  return "started";
}
