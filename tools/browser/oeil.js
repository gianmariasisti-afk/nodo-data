/* nodo MEP-list check, browser part. Paste this whole file into the browser's JavaScript tool on a
   https://oeil.europarl.europa.eu tab. It loads no code. For every priority file in v1/files.json (read from the app's
   site as data) it reads the "Key players" of the Parliament's procedure file and lists the differences: names to add
   ("new"), names that are gone, rapporteurs whose committee moved. It changes nothing. The answer is short JSON. */
await (async () => {
  const FILES = "https://gianmariasisti-afk.github.io/nodo-data/v1/files.json";
  const ROLES = ["rapporteur", "shadow", "opinion-rapporteur"];
  const T = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const idOf = (a) => (a.getAttribute("href") || "").match(/meps\/en\/(\d+)/)?.[1] || null;
  /* [{id, name, role, committee}]; shadows of a joint committee carry the joint label ("ITRE-LIBE"). */
  async function keyPlayers(ref) {
    const r = await fetch("/oeil/en/procedure-file?reference=" + encodeURIComponent(ref), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = new DOMParser().parseFromString(await r.text(), "text/html");
    const out = [];
    for (const t of d.querySelectorAll("table")) {
      const head = T(t.querySelector("thead th")?.textContent);
      if (!/committee/i.test(head) || /budgetary/i.test(head)) continue;
      const opinion = /opinion/i.test(head), joint = /joint/i.test(head), rows = [];
      for (const tr of t.querySelectorAll("tbody > tr")) {
        const abbr = T(tr.querySelector(".es_badge-committee")?.textContent);
        if (abbr) {
          rows.push(abbr);
          const td = tr.querySelector("td");
          for (const a of td ? td.querySelectorAll("a.rapporteur") : []) out.push({ id: idOf(a), name: T(a.textContent), role: opinion ? "opinion-rapporteur" : "rapporteur", committee: abbr });
        }
        if (!opinion) for (const a of tr.querySelectorAll(":scope .collapse a.rapporteur")) out.push({ id: idOf(a), name: T(a.textContent), role: "shadow", committee: joint ? rows.join("-") : rows[rows.length - 1] });
      }
    }
    return out.filter((x) => x.id);
  }
  if (!/oeil\.europarl\.europa\.eu$/.test(location.hostname)) throw new Error("run this on an oeil.europarl.europa.eu tab");
  const files = (await (await fetch(FILES, { cache: "no-store" })).json()).files;
  const differences = [], errors = [];
  let procedures = 0;
  for (const f of files) {
    const targets = [...(f.procedures || []).map((ref) => ({ ref, part: null })), ...(f.parts || []).map((p) => ({ ref: p.procedure, part: p.id }))];
    if (!targets.length && f.procedure) targets.push({ ref: f.procedure, part: null });
    for (const { ref, part } of targets) {
      if (!ref) continue;
      let live;
      try { live = await keyPlayers(ref); procedures++; } catch (e) { errors.push(`${ref}: ${e.message}`); continue; }
      if (!live.length) continue; // no key players published yet
      const mine = (f.meps || []).filter((e) => ROLES.includes(e.role) && (!part || e.part === part));
      const key = (x) => `${x.id}|${x.role}`;
      const have = new Map(mine.map((e) => [key(e), e])), seen = new Set();
      for (const x of live) {
        seen.add(key(x));
        const e = have.get(key(x));
        if (!e) differences.push({ file: f.id, ref, change: "new", role: x.role, id: x.id, name: x.name, committee: x.committee });
        else if (x.role !== "shadow" && e.committee !== x.committee) differences.push({ file: f.id, ref, change: "committee", role: x.role, id: x.id, name: x.name, committee: x.committee, was: e.committee });
      }
      for (const e of mine) if (!seen.has(key(e))) differences.push({ file: f.id, ref, change: "gone", role: e.role, id: e.id, committee: e.committee });
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return JSON.stringify({ checked: new Date().toISOString().slice(0, 10), procedures, differences, errors });
})()
