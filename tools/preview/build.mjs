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
#nxBadge{position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);right:10px;z-index:2147483000;pointer-events:none;padding:3px 9px;border-radius:999px;background:#141413;color:#fff;font:700 11px/16px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em}
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
  ["photos", "fetch(`photos/${f}.json`)", "fetch(`../photos/${f}.json`)"],
  ["supabase library", 'sc.src = "vendor/supabase.js"', 'sc.src = "../vendor/supabase.js"'],
  /* Preview events carry a session id starting "next-", so the usage dashboard can tell them apart. */
  ["usage tag", "sid: Math.random().toString(36).slice(2, 12)", 'sid: "next-" + Math.random().toString(36).slice(2, 10)'],
  /* Accounts not on the list stop here: no sync, no usage log, the private screen instead. */
  ["gate", "async function onSignedIn(user) {", "async function onSignedIn(user) {\n    if (!(window.NODO_PREVIEW && window.NODO_PREVIEW.accounts.includes(user.id))) { window.nodoPreviewDenied(); return; }"],
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
