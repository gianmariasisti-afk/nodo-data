/* nodo committee minutes, browser part. Paste this whole file into the browser's JavaScript tool on a
   https://www.europarl.europa.eu tab. It reads the minutes pages of the Parliament committees that work on nodo's files
   (lead and opinion committees, taken from v1/files.json), fetches the minutes PDFs (PV) the repository does not hold
   yet and turns each into lines of text with pdf.js, imported from nodo's own site (vendor/pdfjs, version 4.4.168).
   Some minutes carry scanned annexes of 15 MB, so only text leaves the tab. All parsing happens afterwards in
   tools/minutes/from_browser.py.

   Same protocol as tools/browser/council.js: the first call answers "started"; then call  await window.__nodoNext()
   again and again. "WAIT ..." = call again in about 20 seconds; "RESULT sha256=... part=i of=n more=..." = one slice
   (saved to a file by the harness), keep every file until more=false; "FAILED ..." = the reading stopped. */
await (async () => {
  const OPTS = { since: null, all: false, only: null, max: 25, pdfjs: null }; // since: "YYYY-MM-DD" (default 75 days back); all: ignore the repository cache; only: [PV ids]; max: minutes per run; pdfjs: folder holding pdf.min.mjs (default nodo's vendor/pdfjs/)
  const SITE = "https://gianmariasisti-afk.github.io/nodo-data/";
  const SLICE = 180000, PAD = 150000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  /* The Parliament's site sits behind an AWS WAF bot check. When its token expires, fetch() gets an empty 202 (and it
     always does with cache:"no-store"). Loading the same address once in a hidden frame lets the check run and renew
     the token (cookie aws-waf-token); the next fetch then works. */
  async function renew(url) {
    const f = document.createElement("iframe");
    f.style.display = "none"; f.setAttribute("aria-hidden", "true"); f.src = url;
    document.body.appendChild(f);
    await sleep(8000);
    f.remove();
  }
  async function get(url, buffer) {
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(url);
        if (r.status === 404) return null;
        if (r.status === 202 && url.startsWith("/")) { await renew(url); throw new Error(`HTTP 202 (bot check) for ${url}`); }
        if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${url}`);
        if (buffer && !/pdf/i.test(r.headers.get("content-type") || "")) throw new Error(`not a PDF: ${url}`);
        return buffer ? await r.arrayBuffer() : await r.text();
      } catch (e) { if (i >= 4) throw e; await sleep(2000 * i); }
    }
  }
  /* One PDF as lines: text items grouped by their baseline, page by page. */
  async function lines(pdfjs, buf) {
    const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      let line = "", y = null;
      for (const it of tc.items) {
        if (y !== null && Math.abs(it.transform[5] - y) > 2) { out.push(line); line = ""; }
        line += it.str;
        if (it.hasEOL) { out.push(line); line = ""; y = null; continue; }
        y = it.transform[5];
      }
      out.push(line);
    }
    await doc.destroy();
    return out.map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  }

  async function collect(S) {
    const since = OPTS.since || addDays(today, -75);
    S.step = "pdf.js";
    const base = OPTS.pdfjs || SITE + "vendor/pdfjs/";
    const pdfjs = await import(base + "pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
    S.step = "nodo files";
    const files = JSON.parse(await get(SITE + "v1/files.json"));
    const codes = new Set();
    for (const f of files.files || []) {
      ((f.ep || {}).lead || []).forEach((c) => codes.add(c));
      (f.meps || []).forEach((m) => String(m.committee || "").split("-").forEach((c) => codes.add(c)));
    }
    const committees = [...codes].filter((c) => /^[A-Z]{4}$/.test(c)).sort();
    let cached = new Set();
    if (!OPTS.all) {
      try { const c = JSON.parse(await get(SITE + "data-cache/minutes-raw.json")); cached = new Set(Object.keys(c.pvs || {})); } catch { cached = new Set(); }
    }
    const listed = new Set();
    for (const [i, c] of committees.entries()) {
      S.step = `minutes page ${i + 1} of ${committees.length} (${c})`;
      const h = await get(`/committees/en/${c.toLowerCase()}/meetings/minutes`);
      if (h) for (const m of h.matchAll(/doceo\/document\/([A-Z0-9]{4}-PV-(\d{4}-\d\d-\d\d)-\d+)_EN\.pdf/g)) if (m[2] >= since) listed.add(m[1]);
      await sleep(250);
    }
    const open = [...listed].sort().filter((id) => !cached.has(id) && (!OPTS.only || OPTS.only.includes(id)));
    const todo = open.slice(0, OPTS.max);
    const pvs = [];
    for (const [i, id] of todo.entries()) {
      S.step = `minutes ${i + 1} of ${todo.length}`;
      try {
        const buf = await get(`/doceo/document/${id}_EN.pdf`, true);
        pvs.push(buf ? { id, lines: await lines(pdfjs, buf) } : { id, error: "not found" });
      } catch (e) { pvs.push({ id, error: String(e && e.message || e).slice(0, 200) }); }
      await sleep(800);
    }
    S.text = JSON.stringify({ fetched: today, since, committees, listed: [...listed].sort(), todo: todo.length, more: open.length > todo.length, reader: "pdfjs-4.4.168", pvs });
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(S.text));
    S.sha = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    S.n = Math.max(1, Math.ceil(S.text.length / SLICE));
    S.i = 0;
  }

  if (location.hostname !== "www.europarl.europa.eu") throw new Error("run this on a www.europarl.europa.eu tab");
  const S = (window.__nodoMinutes = { step: "starting", started: new Date().toISOString() });
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
