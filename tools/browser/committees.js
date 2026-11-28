/* nodo committee agendas, browser part. Paste this whole file into the browser's JavaScript tool on a
   https://www.europarl.europa.eu tab. For every Parliament committee that works on nodo's files (lead and opinion
   committees, taken from v1/files.json) it reads the committee's "Latest documents" list, then:
   - each DRAFT AGENDA (OJ) for a meeting from today on, as lines of text (joint-committee agendas, CJxx, included);
   - each DRAFT REPORT (PR) or DRAFT OPINION (PA) whose deadline for tabling amendments is today or later, as the first
     lines of its text (the procedure number sits on the cover page).
   Only text leaves the tab. All parsing happens afterwards in tools/committees/from_browser.py.

   Same protocol as tools/browser/minutes.js: the first call answers "started"; then call  await window.__nodoNext()
   again and again. "WAIT ..." = call again in about 20 seconds; "RESULT sha256=... part=i of=n more=..." = one slice
   (saved to a file by the harness), keep every file until more=false; "FAILED ..." = the reading stopped. */
await (async () => {
  const OPTS = { from: null, only: null }; // from: "YYYY-MM-DD" (default today, Brussels); only: [committee codes]
  const SITE = "https://gianmariasisti-afk.github.io/nodo-data/";
  const SLICE = 180000, PAD = 150000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
  /* The Parliament's site sits behind an AWS WAF bot check: an expired token gives an empty 202. Loading the address
     once in a hidden frame renews it (as in minutes.js). */
  async function renew(url) {
    const f = document.createElement("iframe");
    f.style.display = "none"; f.setAttribute("aria-hidden", "true"); f.src = url;
    document.body.appendChild(f);
    await sleep(8000);
    f.remove();
  }
  async function get(url) {
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(url);
        if (r.status === 404) return null;
        if (r.status === 202 && url.startsWith("/")) { await renew(url); throw new Error(`HTTP 202 (bot check) for ${url}`); }
        if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${url}`);
        return await r.text();
      } catch (e) { if (i >= 4) throw e; await sleep(2000 * i); }
    }
  }
  const BLOCK = new Set(["P", "DIV", "TD", "TH", "TR", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "SECTION", "UL", "OL"]);
  /* A document's main text as lines: a break after each <br> and each block element. */
  function textLines(html) {
    const d = new DOMParser().parseFromString(html, "text/html");
    const root = d.querySelector("main") || d.body;
    root.querySelectorAll("script, style, nav, header, footer, svg, img").forEach((n) => n.remove());
    root.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    root.querySelectorAll("*").forEach((n) => { if (BLOCK.has(n.tagName)) n.append("\n"); });
    return root.textContent.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  const dmy = (s) => { const m = /(\d\d)-(\d\d)-(\d{4})/.exec(s || ""); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

  async function collect(S) {
    const from = OPTS.from || today;
    S.step = "nodo files";
    const files = JSON.parse(await get(SITE + "v1/files.json"));
    const codes = new Set();
    for (const f of files.files || []) {
      ((f.ep || {}).lead || []).forEach((c) => codes.add(c));
      (f.meps || []).forEach((m) => String(m.committee || "").split("-").forEach((c) => codes.add(c)));
    }
    const committees = [...codes].filter((c) => /^[A-Z]{4}$/.test(c) && (!OPTS.only || OPTS.only.includes(c))).sort();
    const listed = {}, agendaIds = new Set(), drafts = new Map(), errors = [];
    for (const [i, c] of committees.entries()) {
      S.step = `documents list ${i + 1} of ${committees.length} (${c})`;
      try {
        const h = await get(`/committees/en/${c.toLowerCase()}/documents/latest-documents`);
        const d = new DOMParser().parseFromString(h || "", "text/html");
        listed[c] = 0;
        for (const e of d.querySelectorAll(".es_document")) {
          const a = e.querySelector("a.es_document-subtitle-pdf");
          const href = (a && a.getAttribute("href")) || "";
          const id = (href.split("/").pop() || "").replace(/_[A-Z]{2}\.pdf$/, "");
          if (!id) continue;
          listed[c]++;
          const text = e.textContent.replace(/\s+/g, " ");
          const oj = /^([A-Z0-9]{4})-OJ-(\d{4}-\d\d-\d\d)-\d+$/.exec(id);
          if (oj && oj[2] >= from) agendaIds.add(id);
          const dl = dmy((/Deadline for tabling amendments\s*:\s*([\d-]+)/.exec(text) || [])[1]);
          if (dl && dl >= from && /-(PR|PA)-\d+$/.test(id)) {
            const authors = [...e.querySelectorAll(".es_document-subtitle-author")].map((a) => a.textContent.trim());
            drafts.set(id, { id, committee: c, deadline: dl, published: dmy(text), authors, title: (e.querySelector(".es_document-title, h3") || {}).textContent?.replace(/\s+/g, " ").trim().slice(0, 400) || "" });
          }
        }
      } catch (err) { errors.push({ committee: c, error: String(err && err.message || err).slice(0, 200) }); }
      await sleep(300);
    }
    const agendas = [];
    const ids = [...agendaIds].sort();
    for (const [i, id] of ids.entries()) {
      S.step = `agenda ${i + 1} of ${ids.length}`;
      try {
        const h = await get(`/doceo/document/${id}_EN.html`);
        agendas.push(h ? { id, lines: textLines(h) } : { id, error: "not found" });
      } catch (err) { agendas.push({ id, error: String(err && err.message || err).slice(0, 200) }); }
      await sleep(500);
    }
    const dl = [...drafts.values()];
    for (const [i, x] of dl.entries()) {
      S.step = `draft ${i + 1} of ${dl.length}`;
      try {
        const h = await get(`/doceo/document/${x.id}_EN.html`);
        x.lines = h ? textLines(h).slice(0, 60) : [];
      } catch (err) { x.error = String(err && err.message || err).slice(0, 200); }
      await sleep(500);
    }
    S.text = JSON.stringify({ fetched: today, from, committees, listed, agendas, drafts: dl, errors });
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(S.text));
    S.sha = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    S.n = Math.max(1, Math.ceil(S.text.length / SLICE));
    S.i = 0;
  }

  if (location.hostname !== "www.europarl.europa.eu") throw new Error("run this on a www.europarl.europa.eu tab");
  const S = (window.__nodoCommittees = { step: "starting", started: new Date().toISOString() });
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
