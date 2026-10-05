/* Diagnostic: fetch the URLs in PROBE_URLS (comma separated) like a browser and report status, size, type, head of body and cabinet-related links. */
import fs from "node:fs/promises";
const H = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", Accept: "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8", "Accept-Language": "en" };
const out = {};
for (const u of (process.env.PROBE_URLS || "").split(",").map((x) => x.trim()).filter(Boolean)) {
  try {
    const r = await fetch(u, { headers: H, redirect: "follow" });
    const buf = Buffer.from(await r.arrayBuffer());
    const t = buf.toString("utf8");
    const links = [...new Set([...t.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => /cabinet|team|college-commissioners\/|document\/download|\.pdf/i.test(h)))].slice(0, 80);
    const ctx = []; for (const m of t.matchAll(/abinet/g)) { if (ctx.length >= 12) break; ctx.push(t.slice(Math.max(0, m.index - 160), m.index + 220).replace(/\s+/g, " ")); }
    out[u] = { ctx, status: r.status, bytes: buf.length, type: r.headers.get("content-type"), final: r.url, head: /pdf/i.test(r.headers.get("content-type") || "") ? "(pdf)" : t.slice(0, Number(process.env.PROBE_HEAD || 1200)), text: process.env.PROBE_TEXT ? (t.match(/<main[\s\S]*<\/main>/) || [t])[0].replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 9000) : undefined, links };
  } catch (e) { out[u] = { error: String(e) }; }
  await new Promise((r) => setTimeout(r, 800));
}
await fs.mkdir("data-cache", { recursive: true });
await fs.writeFile("data-cache/commission-probe.json", JSON.stringify(out, null, 1) + "\n");
console.log(Object.entries(out).map(([k, v]) => `${v.status || v.error} ${v.bytes} ${k}`).join("\n"));
