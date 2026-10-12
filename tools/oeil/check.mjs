/* nodo MEP-list check: compares the MEPs in v1/files.json with the Parliament's Legislative Observatory.

   The Observatory blocks GitHub runners like the Council site, so this runs in a desktop browser tab opened on
   https://oeil.europarl.europa.eu during the weekly Council refresh. For every priority file with a procedure it reads
   the "Key players" of the procedure file (rapporteurs, shadows, rapporteurs for opinion, each linked to the MEP id)
   and lists the differences with files.json. It changes nothing: a session with repository access applies them.

   Use, in the tab (javascript):
     const src = await (await fetch('https://gianmariasisti-afk.github.io/nodo-data/tools/oeil/check.mjs', {cache: 'no-store'})).text();
     const m = await import(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
     JSON.stringify(await m.check())
   Result: {checked, procedures, differences: [{file, ref, change: "new"|"gone"|"committee", role, id, name, committee, was?}], errors} */

const SITE = "https://gianmariasisti-afk.github.io/nodo-data/";
const ROLES = ["rapporteur", "shadow", "opinion-rapporteur"];
const T = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const idOf = (a) => (a.getAttribute("href") || "").match(/meps\/en\/(\d+)/)?.[1] || null;

/* [{id, name, role, committee}] from one procedure file. Shadows of a joint committee carry the joint label
   ("ITRE-LIBE"): the Observatory lists them together. */
export async function keyPlayers(ref) {
  const r = await fetch("/oeil/en/procedure-file?reference=" + encodeURIComponent(ref), { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${ref}`);
  const d = new DOMParser().parseFromString(await r.text(), "text/html");
  const out = [];
  for (const t of d.querySelectorAll("table")) {
    const head = T(t.querySelector("thead th")?.textContent);
    if (!/committee/i.test(head) || /budgetary/i.test(head)) continue;
    const opinion = /opinion/i.test(head), joint = /joint/i.test(head);
    const rows = [];
    for (const tr of t.querySelectorAll("tbody > tr")) {
      const abbr = T(tr.querySelector(".es_badge-committee")?.textContent);
      if (abbr) {
        const td = tr.querySelector("td");
        rows.push(abbr);
        for (const a of td ? td.querySelectorAll("a.rapporteur") : []) out.push({ id: idOf(a), name: T(a.textContent), role: opinion ? "opinion-rapporteur" : "rapporteur", committee: abbr });
      }
      for (const a of tr.querySelectorAll(".collapse a.rapporteur")) {
        if (opinion) continue;
        out.push({ id: idOf(a), name: T(a.textContent), role: "shadow", committee: joint ? rows.join("-") : rows[rows.length - 1] });
      }
    }
  }
  return out.filter((x) => x.id);
}

export async function check(opts = {}) {
  if (!/oeil\.europarl\.europa\.eu$/.test(location.hostname)) throw new Error("run this on an oeil.europarl.europa.eu tab");
  const files = (await (await fetch(opts.files || SITE + "v1/files.json", { cache: "no-store" })).json()).files;
  const differences = [], errors = [];
  let procedures = 0;
  for (const f of files) {
    const targets = [...(f.procedures || []), ...(f.parts || []).map((p) => ({ ref: p.procedure, part: p.id }))]
      .map((x) => (typeof x === "string" ? { ref: x, part: null } : x));
    if (!targets.length && f.procedure) targets.push({ ref: f.procedure, part: null });
    for (const { ref, part } of targets) {
      if (!ref) continue;
      let live;
      try { live = await keyPlayers(ref); procedures++; } catch (e) { errors.push(`${ref}: ${e.message}`); continue; }
      if (!live.length) continue;   // no key players published (for example the consent file of the MFF)
      const mine = (f.meps || []).filter((e) => ROLES.includes(e.role) && (!part || e.part === part));
      const key = (x) => `${x.id}|${x.role}`;
      const have = new Map(mine.map((e) => [key(e), e]));
      const seen = new Set();
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
  return { checked: new Date().toISOString().slice(0, 10), procedures, differences, errors };
}
