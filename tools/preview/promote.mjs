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
  /* Self-hosted fonts (since 11 Nov 2026): Outfit and Figtree from fonts/, no request to Google. The old Bricolage
     Grotesque and Instrument Sans link goes too: the Dossier theme replaced them on 31 Oct. Same patches in promote.mjs. */
  ["self-hosted fonts", '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Instrument+Sans:wght@400..700&display=swap">', '<link rel="stylesheet" href="fonts/fonts.css">'],
  ["no google fonts import", '@import url("https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Outfit:wght@400;500&display=swap");', '/* Outfit and Figtree are self-hosted since 11 Nov 2026: fonts/fonts.css. */'],
  /* Portraits out of the first download (since 11 Nov 2026): MEPs and Commission load from v1/lite/ (no inline photos,
     scripts/split-portraits.mjs) and each portrait loads from v1/portraits/ when it is shown. The bundled copy in data/
     (iOS app, offline) still carries inline photos. A portrait that cannot load is hidden (features.js). Same patches in promote.mjs. */
  ["light data files", "const getData = (f) => fetchJson(DATA_BASE + f + \".json\")", "const getData = (f) => fetchJson(DATA_BASE + (f === \"meps\" || f === \"commission\" ? \"lite/\" : \"\") + f + \".json\")"],
  ["portrait addresses", "      DATA = { mep, ec, cal, co, ag, fl };", "      DATA = { mep, ec, cal, co, ag, fl };\n      /* Portraits as files: \"portraits/x.webp\" in the light files becomes an address next to the data. */\n      { const fix = (o) => { if (o && typeof o.photo === \"string\" && o.photo.startsWith(\"portraits/\")) o.photo = DATA_BASE + o.photo; };\n        (mep.meps || []).forEach(fix); (ec.college || []).forEach((c) => { fix(c); (c.cabinet || []).forEach(fix); }); }"],
  /* Error reporting (since 11 Nov 2026): a start-up failure shows the boot screen with Try again instead of a blank page
     (window.nxBootFailed in features.js); errors join the usage log, and the data notice says so. Same patches in promote.mjs. */
  ["startup catch", "  } finally { boot.hidden = true; }", "  } catch (e) { if (window.nxBootFailed) window.nxBootFailed(e); else throw e; } finally { boot.hidden = true; }"],
  ["notice: errors", "how many results came back, when you save or follow something, and whether you took the tour.", "how many results came back, when you save or follow something, whether you took the tour, and any error the app runs into (the message and where in the code it happened)."],
  ["notice: fonts", 'The typefaces load from Google Fonts"', 'The typefaces are copies kept on nodo\'s own site"'],
  /* Email sign-in hint (since 11 Nov 2026): people who joined with Apple or Google have no password; the email
     sign-in screen says so and repeats those buttons (socialAltHtml in features.js). Same patch in promote.mjs. */
  ["email sign-in hint", 'Forgot your password?</button>`;\n      foot = `<button class="eu-btn eu-btn--brand eu-btn--block" type="submit" form="fIn"', 'Forgot your password?</button>\n        ${socialAltHtml()}`;\n      foot = `<button class="eu-btn eu-btn--brand eu-btn--block" type="submit" form="fIn"'],
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

const SW0 = readFileSync(join(ROOT, "sw.js"), "utf8");
/* The page-first rule went live on 31 Oct 2026; later promotions only bump the version. */
const sw = patch(SW0, "sw.js", SW0.includes("const pageFirst") ? [
  ["version", /const VERSION = "nodo-v(\d+)";/.exec(SW0)[0], () => `const VERSION = "nodo-v${Number(/const VERSION = "nodo-v(\d+)";/.exec(SW0)[1]) + 1}";`],
] : [
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
