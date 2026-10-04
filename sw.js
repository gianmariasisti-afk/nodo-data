/* nodo service worker: app shell works offline, data refreshes whenever there is a connection. */
const VERSION = "nodo-v6";
const SHELL = ["./", "index.html", "config.js", "avatars.js", "vendor/supabase.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const networkFirst = (req) => fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => caches.match(req));
const staleWhileRevalidate = (req) => caches.match(req).then((hit) => {
  const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
  return hit || net;
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.includes("/v1/")) return e.respondWith(networkFirst(req));
  if (url.origin === location.origin || /(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname)) return e.respondWith(staleWhileRevalidate(req));
});
