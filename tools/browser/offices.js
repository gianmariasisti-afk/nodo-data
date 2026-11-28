/* nodo MEP offices and teams, browser part. Paste this whole file into the browser's JavaScript tool on a
   https://www.europarl.europa.eu tab. For every current MEP in v1/lite/meps.json it reads the MEP's "Assistants" page,
   which carries both the contact cards (Brussels and Strasbourg: building, office, telephone) and the assistants by
   category. Names only: the Parliament publishes no emails or roles for assistants. Everything is reduced in the tab
   to a compact record per MEP; tools/offices/pull.py checks it and writes v1/offices.json.

   Same protocol as tools/browser/minutes.js: the first call answers "started"; then call  await window.__nodoNext()
   again and again. "WAIT ..." = call again in about 20 seconds; "RESULT sha256=... part=i of=n more=..." = one slice
   (saved to a file by the harness), keep every file until more=false; "FAILED ..." = the reading stopped. */
await (async () => {
  const OPTS = { only: null, pause: 350 }; // only: [MEP ids]; pause: ms between pages
  const SITE = "https://gianmariasisti-afk.github.io/nodo-data/";
  const SLICE = 180000, PAD = 150000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
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
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  /* A contact card: its city, the address lines and the first telephone. */
  function card(e) {
    const span = e.querySelector(".es_contact-card-list > span");
    const lines = span ? span.innerHTML.split(/<br\s*\/?>/i).map((l) => clean(l.replace(/<[^>]+>/g, ""))).filter(Boolean) : [];
    const tel = e.querySelector('a[href^="tel:"]');
    return { city: clean((e.querySelector(".es_title-h3") || {}).textContent), lines, phone: tel ? clean(tel.textContent) : "" };
  }

  async function collect(S) {
    S.step = "MEP list";
    const meps = JSON.parse(await get(SITE + "v1/lite/meps.json")).meps.map((m) => m.id).filter((id) => !OPTS.only || OPTS.only.includes(id));
    const out = [], errors = [];
    for (const [i, id] of meps.entries()) {
      S.step = `MEP ${i + 1} of ${meps.length}`;
      try {
        const h = await get(`/meps/en/${id}/x/assistants`);
        if (!h) { errors.push({ id, error: "not found" }); continue; }
        const d = new DOMParser().parseFromString(h, "text/html");
        const cards = [...d.querySelectorAll(".es_contact-card")].map(card);
        const teams = [...d.querySelectorAll(".erpl_type-assistants")].map((g) => ({
          type: clean((g.querySelector("h4") || {}).textContent),
          names: [...g.querySelectorAll(".erpl_assistant")].map((s) => clean(s.textContent)).filter(Boolean),
        }));
        out.push({ id, cards, teams });
      } catch (e) { errors.push({ id, error: String(e && e.message || e).slice(0, 200) }); }
      await sleep(OPTS.pause);
    }
    S.text = JSON.stringify({ fetched: today, count: meps.length, meps: out, errors });
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(S.text));
    S.sha = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    S.n = Math.max(1, Math.ceil(S.text.length / SLICE));
    S.i = 0;
  }

  if (location.hostname !== "www.europarl.europa.eu") throw new Error("run this on a www.europarl.europa.eu tab");
  const S = (window.__nodoOffices = { step: "starting", started: new Date().toISOString() });
  collect(S).catch((e) => { S.error = String(e && e.stack || e).slice(0, 500); });
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
