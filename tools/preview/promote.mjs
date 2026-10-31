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

/* The feature patches, as in build.mjs. The ones promoted on 31 Oct 2026 are already in the live page and left this list then. */
const FEATURE_PATCHES = [
  ["speech card link", 'Question PDF</a>` : ""}` : "";', 'Question PDF</a>` : ""}` : fdSpeechAct(it);'],
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
