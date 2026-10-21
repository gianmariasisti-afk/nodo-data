#!/usr/bin/env node
/* Builds the private preview copy of nodo in next/ from the live app at the repository root.
 *
 *   node tools/preview/build.mjs
 *
 * The preview is the live app plus the patches below. It is served at
 * https://gianmariasisti-afk.github.io/nodo-data/next/ and reads the same data (v1/) and the same
 * Supabase project as the live app. Only the accounts in PREVIEW_ACCOUNTS get past sign-in.
 *
 * Every patch must match exactly once. If the live app changes so that a patch no longer matches,
 * the build stops and names the patch, instead of shipping a preview that half works.
 *
 * Preview features live in next/features.js and next/features.css; this build injects them. next/index.html
 * is generated: edit the feature files, never the generated page. See next/README.md.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "next");

/* Files in testing (21 Oct 2026): next/files-next.json is merged into the live files list as it loads, so only the
   preview shows them. "files" adds new files (a live file with the same id wins); "extend" adds parts, MEPs, next steps,
   working parties, caveats and sources to a live file, and statusAdd is appended to its status. Without the file, or if
   it fails to load, the preview shows the live list unchanged. */
const MERGE_FILES = `((d, x) => {
      const out = { ...d, files: [...(d.files || [])] }, have = new Set(out.files.map((f) => f.id));
      for (const f of x.files || []) if (!have.has(f.id)) out.files.push({ ...f, asOf: f.asOf || x.asOf });
      for (const e of x.extend || []) {
        const i = out.files.findIndex((f) => f.id === e.id); if (i < 0) continue;
        const f = { ...out.files[i], council: { ...(out.files[i].council || {}) } }, by = (k) => (a, b) => { const s = new Set(a.map(k)); return [...a, ...b.filter((y) => !s.has(k(y)))]; };
        f.parts = by((p) => p.id)(f.parts || [], e.parts || []);
        f.meps = by((m) => [m.id, m.role, m.part || ""].join("|"))(f.meps || [], e.meps || []);
        f.next = [...(f.next || []), ...(e.next || [])].sort((a, b) => (a.date || "9999") < (b.date || "9999") ? -1 : (a.date || "9999") > (b.date || "9999") ? 1 : 0);
        f.council.workingParties = [...(f.council.workingParties || []), ...(e.workingParties || [])];
        f.caveats = [...(f.caveats || []), ...(e.caveats || [])];
        f.sources = by((s) => s.id)(f.sources || [], e.sources || []);
        if (e.statusAdd) f.status = (f.status ? f.status + " " : "") + e.statusAdd;
        out.files[i] = f;
      }
      return out;
    })`;

/* Who can open the preview: Supabase user ids. Add a tester's id here to let them in. */
const PREVIEW_ACCOUNTS = ["16f3b8c5-9a37-492e-81af-1c89792751df"];

function patch(text, file, rules) {
  for (const [label, from, to] of rules) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`${file}: patch "${label}" matched ${n} times, expected 1`);
    text = text.replace(from, () => (typeof to === "function" ? to() : to));
  }
  return text;
}

/* The gate and the Preview marker. Client-side only: the preview's code is public like the live app's.
   What protects people's data is Supabase row-level security, unchanged. The gate keeps other
   accounts out of unreleased features; it is not a security boundary. */
const gateScript = `<script>
window.NODO_PREVIEW = { accounts: ${JSON.stringify(PREVIEW_ACCOUNTS)} };
window.nodoPreviewDenied = function () {
  if (document.getElementById("nxDenied")) return;
  const d = document.createElement("div");
  d.id = "nxDenied";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.innerHTML = '<h1>This preview is private</h1><p>It holds features that are still being tested. Your account and your lists are safe in the main app.</p><a href="../">Open nodo</a>';
  document.body.appendChild(d);
};
</script>`;

const gate = `<style>
#nxBadge{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);left:10px;z-index:2147483000;pointer-events:none;padding:3px 9px;border-radius:999px;background:#141413;color:#fff;font:700 11px/16px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em}
#nxDenied{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;background:#0E1B4D;color:#fff;text-align:center;font:16px/24px -apple-system,BlinkMacSystemFont,sans-serif}
#nxDenied h1{margin:0;font-size:28px;line-height:34px}
#nxDenied a{display:inline-block;padding:14px 24px;border-radius:999px;background:#fff;color:#0E1B4D;font-weight:600;text-decoration:none}
</style>
<div id="nxBadge" aria-hidden="true">PREVIEW</div>
</body>`;

const html = patch(readFileSync(join(ROOT, "index.html"), "utf8"), "index.html", [
  ["noindex and gate", "<meta charset=utf8>", '<meta charset=utf8><meta name=robots content="noindex,nofollow">' + gateScript],
  ["home screen name", "<meta name=apple-mobile-web-app-title content=nodo>", "<meta name=apple-mobile-web-app-title content=\"nodo next\">"],
  ["touch icon", "href=icons/apple-touch-icon.png", "href=../icons/apple-touch-icon.png"],
  ["favicon", "href=icons/icon-192.png", "href=../icons/icon-192.png"],
  ["title", "<title>nodo</title>", "<title>nodo preview</title>"],
  ["config", '<script src="config.js">', '<script src="../config.js">'],
  ["avatars", '<script src="avatars.js">', '<script src="../avatars.js">'],
  ["data", '? "v1/" :', '? "../v1/" :'],
  /* A file in testing shows the day its own data was checked, not the live list's. */
  ["files in testing: checked badge", "const asOf = DATA.fl && DATA.fl.asOf, n =", "const asOf = f.asOf || (DATA.fl && DATA.fl.asOf), n ="],
  ["files in testing", 'getData("files").catch(() => ({ files: [] })),', 'getData("files").catch(() => ({ files: [] })).then((d) => fetchJson("files-next.json").then((x) => ' + MERGE_FILES + '(d, x)).catch(() => d)),'],
  ["photos", "fetch(`photos/${f}.json`)", "fetch(`../photos/${f}.json`)"],
  ["monument photos", 'const MON_BASE = "monuments/";', 'const MON_BASE = "../monuments/";'],
  ["supabase library", 'sc.src = "vendor/supabase.js"', 'sc.src = "../vendor/supabase.js"'],
  /* Preview events carry a session id starting "next-", so the usage dashboard can tell them apart. */
  ["usage tag", "sid: Math.random().toString(36).slice(2, 12)", 'sid: "next-" + Math.random().toString(36).slice(2, 10)'],
  /* Accounts not on the list stop here: no sync, no usage log, the private screen instead. */
  ["gate", "async function onSignedIn(user) {", "async function onSignedIn(user) {\n    if (!(window.NODO_PREVIEW && window.NODO_PREVIEW.accounts.includes(user.id))) { window.nodoPreviewDenied(); return; }"],
  /* Attachés on the file page and Council names that sync to the account (20 Oct 2026). Copy only; the sync is in features.js. */
  ["file page attachés", '<p class="cap">Venue inferred, not confirmed.</p>` : ""}</div>`).join("")}</div>`; };',
    '<p class="cap">Venue inferred, not confirmed.</p>` : ""}</div>`).join("")}</div><p class="fp-att">Attachés who cover ${w.length > 1 ? "these working parties" : "this working party"} aren\'t in nodo. The Council doesn\'t publish them.${((f.council || {}).configs || []).find((c) => CONF_BY[c]) ? ` <button type="button" data-prwp="${esc(((f.council || {}).configs || []).find((c) => CONF_BY[c]))}">Add the ones you know</button>` : ""}</p>`; };'],
  ["notes count", 'notes.length + " on this device" : "saved on this device"', 'notes.length + " in your account" : "saved to your account"'],
  ["wp foot", "The names here are the ones you add, saved on this device.", "The names here are the ones you add, saved to your account."],
  ["added by you", '", saved on this device"', '", saved to your account"'],
  ["sheet note", "It is saved on this device and is not sent to anyone.", "It is saved to your account and is not shared with anyone."],
  ["delegation foot", "The names you add are saved on this device only.", "The names you add are saved to your account."],
  ["council note", "Any other name is one you added, saved on this device.", "Any other name is one you added, saved to your account."],
  ["sheet note 2", '"Saved on this device. Check a name', '"Saved to your account. Check a name'],
  /* No week numbers anywhere (21 Oct 2026). */
  ["no week: calendar hero", "This week in Parliament · W${isoWeek(mon)}", "This week in Parliament"],
  ["no week: calendar rows", "</b><span>W${isoWeek(w)}</span></div>", "</b></div>"],
  ["no week: calendar eyebrow", "This week · W${isoWeek(mon)} · ", "This week · "],
  ["marker", "</body>", gate],
  /* The preview's features (next/features.js, next/features.css) run inside the app's script, just before start-up. */
  ["features", "  initHome(); initEp(); initEc();", () => readFileSync(join(OUT, "features.js"), "utf8") + "\n  initHome(); initEp(); initEc();"],
  ["feature styles", "<div id=\"nxBadge\"", () => "<style>\n" + readFileSync(join(OUT, "features.css"), "utf8") + "</style>\n<div id=\"nxBadge\""],
]);

/* Its own service worker: scope next/, its own cache name, and it only clears its own old caches,
   so it never deletes the live app's caches on the same site. */
const sw = patch(readFileSync(join(ROOT, "sw.js"), "utf8"), "sw.js", [
  /* The cache name carries a fingerprint of the built page, so every rebuild reaches the phone on its next start. */
  ["cache name", 'const VERSION = "nodo-v', 'const VERSION = "nodo-next-' + createHash("sha256").update(html).digest("hex").slice(0, 8) + "-v"],
  ["shell", '"config.js", "avatars.js", "vendor/supabase.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"', '"../config.js", "../avatars.js", "../vendor/supabase.js", "manifest.webmanifest", "../icons/icon-192.png", "../icons/icon-512.png", "../icons/apple-touch-icon.png"'],
  ["cleanup", "ks.filter((k) => k !== VERSION && k !== DATA)", 'ks.filter((k) => k.startsWith("nodo-next-") && k !== VERSION)'],
  /* The page itself comes from the network first (the saved copy only after 3 seconds or offline), so a new preview
     build shows on the next open instead of the one after; the rest of the shell stays stale-while-revalidate. */
  ["page network first", "  if (url.origin === location.origin || /(^|\\.)(googleapis|gstatic)\\.com$/.test(url.hostname)) return e.respondWith(staleWhileRevalidate(req));",
    "  if (url.origin === location.origin && (req.mode === \"navigate\" || /\\/next\\/(index\\.html)?$/.test(url.pathname) || /\\/next\\/(europe-dots|files-next)\\.json$/.test(url.pathname))) return e.respondWith(pageFirst(req));\n  if (url.origin === location.origin || /(^|\\.)(googleapis|gstatic)\\.com$/.test(url.hostname)) return e.respondWith(staleWhileRevalidate(req));"],
  ["page helper", "self.addEventListener(\"fetch\", (e) => {", "const pageFirst = (req) => new Promise((resolve) => {\n  let done = false; const settle = (r) => { if (!done && r) { done = true; resolve(r); } };\n  const saved = caches.match(req); const t = setTimeout(() => saved.then(settle), 3000);\n  fetch(req, { cache: \"no-cache\" }).then((r) => { clearTimeout(t); if (r.ok) { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); } settle(r); })\n    .catch(() => { clearTimeout(t); saved.then((h) => settle(h || Response.error())); });\n});\nself.addEventListener(\"fetch\", (e) => {"],
]);

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.webmanifest"), "utf8"));
manifest.name = "nodo preview";
manifest.short_name = "nodo next";
manifest.description = "Private preview of nodo with features in testing.";
manifest.icons = manifest.icons.map((i) => ({ ...i, src: "../" + i.src }));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), html);
writeFileSync(join(OUT, "sw.js"), "/* Generated by tools/preview/build.mjs from ../sw.js. */\n" + sw);
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Preview built in next/ for " + PREVIEW_ACCOUNTS.length + " account(s).");
