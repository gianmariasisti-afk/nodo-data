/* nodo Council refresh, browser part. Paste this whole file into the browser's JavaScript tool on a
   https://www.consilium.europa.eu tab. It loads no code. It reads the Council's meeting calendar, the Coreper I and II
   dates and the participant-list PDFs of recent formal Council meetings that the repository does not hold yet. All
   parsing happens afterwards in tools/council/from_browser.py.

   The first call starts the work in the tab and answers "started". Then call  await window.__nodoNext()  again and again:
   - "WAIT ..." means the tab is still reading; call again after about 20 seconds.
   - "RESULT sha256=... part=i of=n more=true|false len=..." is one slice of the collection, padded so the agent harness
     saves it to a file. Keep every saved file and call again until an answer says more=false.
   - "FAILED ..." means the reading stopped; the message says why.
   The device bridge cuts answers above about 260,000 characters, so the collection (PDFs included, about 230,000
   characters each) comes in slices of 180,000 characters. */
await (async () => {
  const OPTS = { since: null, all: false, only: null }; // since: "YYYY-MM-DD" re-reads lists from that date; all: ignore the repository cache; only: [hrefs] (tests)
  const SITE = "https://gianmariasisti-afk.github.io/nodo-data/";
  const FORMAL = /^\/en\/meetings\/(agrifish|compet|ecofin|eycs|epsco|env|fac|gac|jha|tte)\/\d{4}\//;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const SLICE = 180000, PAD = 150000;
  const T = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayOf = (t) => { const m = T(t).match(/^(\d{1,2}) ([A-Z][a-z]+) (20\d\d)$/); const i = m ? MONTHS.indexOf(m[2]) : -1; return i < 0 ? null : `${m[3]}-${pad(i + 1)}-${pad(m[1])}`; };
  const startOf = (href) => { const u = href.match(/\/(\d{4})\/(\d\d)\/(\d\d)/); return u ? `${u[1]}-${u[2]}-${u[3]}` : ""; };
  async function get(url, buffer) {
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        return buffer ? await r.arrayBuffer() : await r.text();
      } catch (e) { if (i >= 3) throw e; await sleep(1500 * i); }
    }
  }
  const doc = async (url) => { const t = await get(url); return t == null ? null : new DOMParser().parseFromString(t, "text/html"); };
  /* One calendar listing, all pages: [{href, title, days}] in page order. */
  async function calendar(params) {
    const found = new Map();
    let n = 1, last = 1;
    do {
      const d = await doc(`/en/meetings/calendar/?${params}&page=${n}`);
      if (!d) throw new Error(`calendar page ${n} missing (${params})`);
      let day = null;
      for (const el of (d.querySelector("main") || d.body).querySelectorAll("h2, h3, h4, a[href^='/en/meetings/']")) {
        if (el.tagName !== "A") { day = dayOf(el.textContent); continue; }
        const href = el.getAttribute("href");
        if (!day || href.startsWith("/en/meetings/calendar")) continue;
        const m = found.get(href) || { href, title: T(el.textContent), days: [] };
        if (!m.days.includes(day)) m.days.push(day);
        found.set(href, m);
      }
      if (n === 1) { const a = [...d.querySelectorAll("a")].find((x) => /last page/i.test(x.textContent)); const p = a && (a.getAttribute("href") || "").match(/[?&]page=(\d+)/); last = p ? Number(p[1]) : 1; }
      n++; await sleep(250);
    } while (n <= last);
    return [...found.values()];
  }
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

  async function collect(S) {
    const from = today.slice(0, 8) + "01";
    const yearEnd = `${today.slice(0, 4)}-12-31`, ahead = addDays(today, 183);
    const to = yearEnd > ahead ? yearEnd : ahead;
    const since = OPTS.since || addDays(today, -60);
    const q = (cat, a, b, extra = "") => `category=${cat}&DateFrom=${a.replaceAll("-", "/")}&DateTo=${b.replaceAll("-", "/")}${extra}`;
    const win = { meetings: [from, to], coreper: [from, addDays(today, 270)], lists: [since, today] };
    S.step = "meeting calendar"; const cal = await calendar(q("meeting", from, to));
    S.step = "Coreper dates"; const coreper = await calendar(q("mpo", from, addDays(today, 270), "&PreparatoryBody=-3"));
    S.step = "meetings held"; const held = (await calendar(q("meeting", since, addDays(today, 1)))).filter((m) => FORMAL.test(m.href) && !/^informal/i.test(m.title) && startOf(m.href) <= today);
    let cached = new Set();
    if (!OPTS.all) {
      try { const c = JSON.parse(await get(SITE + "data-cache/council-raw.json")); cached = new Set(c.parts.filter((p) => p.data != null).map((p) => p.href)); } catch { cached = new Set(); }
    }
    const todo = held.filter((m) => !cached.has(m.href) && (!OPTS.only || OPTS.only.includes(m.href))).map((m) => m.href);
    const lists = [];
    for (const [i, href] of todo.entries()) {
      S.step = `participant list ${i + 1} of ${todo.length}`;
      try {
        const d = await doc(href);
        const title = T(d && d.querySelector("h1") && d.querySelector("h1").textContent);
        const a = d && [...d.querySelectorAll("a")].find((x) => /list of participants/i.test(x.textContent));
        const pdf = a ? a.getAttribute("href").replace(/^https:\/\/www\.consilium\.europa\.eu/, "") : null;
        const buf = pdf ? await get(pdf, true) : null;
        lists.push({ href, title, pdf, b64: buf ? b64(buf) : null });
      } catch (e) { lists.push({ href, error: String(e && e.message || e).slice(0, 200) }); }
      await sleep(300);
    }
    S.text = JSON.stringify({ fetched: today, window: win, held: held.length, todo: todo.length, cal, coreper, lists });
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(S.text));
    S.sha = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    S.n = Math.max(1, Math.ceil(S.text.length / SLICE));
    S.i = 0;
  }

  if (!/consilium\.europa\.eu$/.test(location.hostname)) throw new Error("run this on a www.consilium.europa.eu tab");
  const S = (window.__nodoCouncil = { step: "starting", started: new Date().toISOString() });
  collect(S).catch((e) => { S.error = String(e && e.stack || e).slice(0, 500); });
  /* Next slice; window.__nodoNext(k) answers slice k again (1-based) if a saved file was lost. */
  window.__nodoNext = async (k) => {
    if (S.error) return `FAILED ${S.error}`;
    if (!S.text) return `WAIT ${S.step} (started ${S.started})`;
    const i = k ? k - 1 : Math.min(S.i++, S.n - 1);
    const slice = S.text.slice(i * SLICE, (i + 1) * SLICE);
    const more = i + 1 < S.n;
    return `RESULT sha256=${S.sha} part=${i + 1} of=${S.n} more=${more} len=${slice.length}\n${slice}\n${"#".repeat(Math.max(0, PAD - slice.length))}`;
  };
  return "started";
})()
