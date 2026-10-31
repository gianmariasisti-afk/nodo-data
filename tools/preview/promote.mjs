#!/usr/bin/env node
/* Promotes everything in the private preview to the live app at the repository root.
 *
 *   node tools/preview/promote.mjs && node tools/preview/build.mjs
 *
 * It applies to the root index.html the preview patches that are features (not the ones that make the preview a
 * preview: gate, paths, name, PREVIEW marker, usage tag), injects next/features.js and next/features.css into the
 * live page as a marked block, moves the dot map to the root, bumps the live service worker and gives it the
 * page-first rule. Then it empties next/features.js and next/features.css, so the preview starts again from the
 * live app. Every patch must match exactly once, or nothing is written.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NEXT = join(ROOT, "next");
const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);

function patch(text, file, rules) {
  for (const [label, from, to] of rules) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`${file}: patch "${label}" matched ${n} times, expected 1`);
    text = text.replace(from, () => (typeof to === "function" ? to() : to));
  }
  return text;
}

/* The feature patches, as in build.mjs (same order, same text). */
const FEATURE_PATCHES = [
  ["file page attachés", '<p class="cap">Venue inferred, not confirmed.</p>` : ""}</div>`).join("")}</div>`; };',
    '<p class="cap">Venue inferred, not confirmed.</p>` : ""}</div>`).join("")}</div><p class="fp-att">Attachés who cover ${w.length > 1 ? "these working parties" : "this working party"} aren\'t in nodo. The Council doesn\'t publish them.${((f.council || {}).configs || []).find((c) => CONF_BY[c]) ? ` <button type="button" data-prwp="${esc(((f.council || {}).configs || []).find((c) => CONF_BY[c]))}">Add the ones you know</button>` : ""}</p>`; };'],
  ["notes count", 'notes.length + " on this device" : "saved on this device"', 'notes.length + " in your account" : "saved to your account"'],
  ["wp foot", "The names here are the ones you add, saved on this device.", "The names here are the ones you add, saved to your account."],
  ["added by you", '", saved on this device"', '", saved to your account"'],
  ["sheet note", "It is saved on this device and is not sent to anyone.", "It is saved to your account and is not shared with anyone."],
  ["delegation foot", "The names you add are saved on this device only.", "The names you add are saved to your account."],
  ["council note", "Any other name is one you added, saved on this device.", "Any other name is one you added, saved to your account."],
  ["sheet note 2", '"Saved on this device. Check a name', '"Saved to your account. Check a name'],
  ["file tab: council", '[["ep", "Parliament"], ["ec", "Commission"], ["next", "Next steps"], ["upd", "Timeline"]]',
    '[["ep", "Parliament"], ["ec", "Commission"], ...(fileHasCo(f) ? [["co", "Council"]] : [])]'],
  ["file tab: council body", '} else if (tab === "upd") {', '} else if (tab === "co") {\n      body = fileCoTab(f);\n    } else if (tab === "upd") {'],
  ["file tab: council out of next steps", '+ (cfs.length ? `<h3>In the Council</h3><div class="list">${cfs.map(confRow).join("")}</div>` : "") + wpBlock(f) + (f.council && f.council.note && (cfs.length || wpBlock(f)) ? `<p class="note">${esc(f.council.note)}</p>` : "")',
    '+ (fileHasCo(f) ? `<p class="note">The Council side of this file is on its <button type="button" class="fp-totab" data-ftab="co">Council tab</button>.</p>` : "")'],
  ["file page: spoke in committee", '+ (f.ep && f.ep.note ? `<p class="note">${esc(f.ep.note)}</p>` : "");', '+ spokeBlock(f) + (f.ep && f.ep.note ? `<p class="note">${esc(f.ep.note)}</p>` : "");'],
  ["file page: related texts", 'ROLE_ORDER.map((r) => sec(ROLE_MANY[r], baseEp.filter((x) => x.role === r))).join("")',
    'ROLE_ORDER.map((r) => (r === "relevant" ? relBlock(f, baseEp.filter((x) => x.role === r)) : sec(ROLE_MANY[r], baseEp.filter((x) => x.role === r)))).join("")'],
  ["file page: officials", 'body = dgBlock(f) + sec("Added by you", mineCo)', 'body = dgBlock(f) + offBlock(f) + sec("Added by you", mineCo)'],
  ["file page: dg caption", '${d.basis === "source" ? "Named in a Parliament or Commission document." : "Deduced from the Commissioner\'s portfolio. Verify before external use."}${d.note ? " " + esc(d.note) : ""}',
    '${mnDgCap(f) || ((d.basis === "source" ? "Named in a Parliament or Commission document." : "Deduced from the Commissioner\'s portfolio. Verify before external use.") + (d.note ? " " + esc(d.note) : ""))}'],
  ["no week: calendar hero", "This week in Parliament · W${isoWeek(mon)}", "This week in Parliament"],
  ["no week: calendar rows", "</b><span>W${isoWeek(w)}</span></div>", "</b></div>"],
  ["no week: calendar eyebrow", "This week · W${isoWeek(mon)} · ", "This week · "],
];

const js = readFileSync(join(NEXT, "features.js"), "utf8").replace("/* ======================= nodo preview features =======================",
  `/* ======================= Features promoted from the preview on ${DATE} =======================`);
const css = readFileSync(join(NEXT, "features.css"), "utf8");

const html = patch(readFileSync(join(ROOT, "index.html"), "utf8"), "index.html", [
  ...FEATURE_PATCHES,
  ["features", "  initHome(); initEp(); initEc();", () => js + "\n  initHome(); initEp(); initEc();"],
  ["feature styles", "</body>", () => `<style>\n/* Promoted from the preview on ${DATE} (was next/features.css). */\n${css}</style>\n</body>`],
]);

const sw = patch(readFileSync(join(ROOT, "sw.js"), "utf8"), "sw.js", [
  ["version", /const VERSION = "nodo-v(\d+)";/.exec(readFileSync(join(ROOT, "sw.js"), "utf8"))[0],
    () => `const VERSION = "nodo-v${Number(/const VERSION = "nodo-v(\d+)";/.exec(readFileSync(join(ROOT, "sw.js"), "utf8"))[1]) + 1}";`],
  /* The page comes from the network first (the saved copy after 3 seconds or offline), so a new release reaches
     a Home Screen app on its next open. */
  ["page helper", "self.addEventListener(\"fetch\", (e) => {", "const pageFirst = (req) => new Promise((resolve) => {\n  let done = false; const settle = (r) => { if (!done && r) { done = true; resolve(r); } };\n  const saved = caches.match(req); const t = setTimeout(() => saved.then(settle), 3000);\n  fetch(req, { cache: \"no-cache\" }).then((r) => { clearTimeout(t); if (r.ok) { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); } settle(r); })\n    .catch(() => { clearTimeout(t); saved.then((h) => settle(h || Response.error())); });\n});\nself.addEventListener(\"fetch\", (e) => {"],
  ["page network first", "  if (url.origin === location.origin || /(^|\\.)(googleapis|gstatic)\\.com$/.test(url.hostname)) return e.respondWith(staleWhileRevalidate(req));",
    "  if (url.origin === location.origin && (req.mode === \"navigate\" || /\\/nodo-data\\/(index\\.html)?$/.test(url.pathname) || /\\/europe-dots\\.json$/.test(url.pathname))) return e.respondWith(pageFirst(req));\n  if (url.origin === location.origin || /(^|\\.)(googleapis|gstatic)\\.com$/.test(url.hostname)) return e.respondWith(staleWhileRevalidate(req));"],
]);

writeFileSync(join(ROOT, "index.html"), html);
writeFileSync(join(ROOT, "sw.js"), sw);
if (existsSync(join(NEXT, "europe-dots.json"))) renameSync(join(NEXT, "europe-dots.json"), join(ROOT, "europe-dots.json"));
writeFileSync(join(NEXT, "features.js"), `  /* ======================= nodo preview features =======================
     Source: next/features.js. tools/preview/build.mjs injects this file into the app's main script just before
     start-up, so it runs inside the same scope and uses the app's own helpers. Nothing here reaches the live app
     until it is promoted (tools/preview/promote.mjs). Everything up to ${DATE} was promoted on ${DATE}. */
`);
writeFileSync(join(NEXT, "features.css"), `/* nodo preview styles (next/features.css). Everything up to ${DATE} was promoted to the live app on ${DATE}. */\n`);
console.log("Promoted the preview to the live app.");
