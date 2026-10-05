/* Diagnostic: fetch API paths listed in PROBE_PATHS (comma separated) and store the answers in data-cache/agenda-probe-paths.json. */
import fs from "node:fs/promises";
const API = "https://data.europarl.europa.eu/api/v2";
const out = {};
for (const p of (process.env.PROBE_PATHS || "").split(",").map((x) => x.trim()).filter(Boolean)) {
  try {
    const r = await fetch(API + p, { headers: { "User-Agent": "nodo-prd-1.0", Accept: "application/ld+json, application/json" } });
    const t = await r.text();
    out[p] = { status: r.status, bytes: t.length, body: t.slice(0, Number(process.env.PROBE_MAX || 30000)) };
  } catch (e) { out[p] = { error: String(e) }; }
  await new Promise((r) => setTimeout(r, 700));
}
await fs.mkdir("data-cache", { recursive: true });
await fs.writeFile("data-cache/agenda-probe-paths.json", JSON.stringify(out, null, 1) + "\n");
console.log(Object.entries(out).map(([k, v]) => `${v.status || v.error} ${v.bytes} ${k}`).join("\n"));
