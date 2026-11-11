// Builds app/www from the live web app at the repo root, for Capacitor.
// The app code is bundled; directory data still comes from GitHub Pages at run time,
// with a bundled copy in www/data as the offline fallback (the web app already reads data/ when the host fails).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(APP, "..");
const WWW = join(APP, "www");

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

// Files and folders the root index.html loads by relative path.
for (const p of ["config.js", "avatars.js", "europe-dots.json", "manifest.webmanifest", "icons", "vendor", "monuments", "fonts"]) {
  if (existsSync(join(ROOT, p))) cpSync(join(ROOT, p), join(WWW, p), { recursive: true });
}
cpSync(join(APP, "native", "native.js"), join(WWW, "native.js"));
// Capacitor's JavaScript runtime (registerPlugin and friends). The web app is not bundled, so it is loaded as a script.
// Without it native.js stops on Capacitor.registerPlugin and the app falls back to the web sign-in options.
const CAP_JS = join(APP, "node_modules", "@capacitor", "core", "dist", "capacitor.js");
if (!existsSync(CAP_JS)) throw new Error("Run npm install in app/ first: @capacitor/core/dist/capacitor.js is missing");
cpSync(CAP_JS, join(WWW, "capacitor.js"));

// Offline fallback for the six files the app needs to open.
mkdirSync(join(WWW, "data"), { recursive: true });
for (const f of ["meps", "commission", "calendar", "council", "agenda", "files"]) {
  cpSync(join(ROOT, "v1", f + ".json"), join(WWW, "data", f + ".json"));
}

// index.html: load the native bridge right after config.js so it can adjust the configuration.
let html = readFileSync(join(ROOT, "index.html"), "utf8");
const tag = '<script src="config.js"></script>';
if (!html.includes(tag)) throw new Error("config.js script tag not found in index.html");
html = html.replace(tag, tag + '\n<script src="capacitor.js"></script>\n<script src="native.js"></script>');
writeFileSync(join(WWW, "index.html"), html);

console.log("www built from", ROOT);
