/* nodo service worker: the app shell works offline, and data refreshes whenever there is a connection. */
const VERSION = "nodo-v11";
/* Data has its own cache so an app update does not make every phone download the directory again. */
const DATA = "nodo-data-v1";
const SHELL = ["./", "index.html", "config.js", "avatars.js", "vendor/supabase.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Data: the network copy when it answers in time, the saved copy when the connection is slow or gone.
   A slow answer still lands in the cache, ready for the next start. Without a saved copy the request simply waits for the network. */
const WAIT_MS = 3000;
const networkFirst = (req) => new Promise((resolve) => {
  let settled = false;
  const settle = (r) => { if (!settled && r) { settled = true; resolve(r); } };
  const saved = caches.match(req);
  const timer = setTimeout(() => saved.then(settle), WAIT_MS);
  fetch(req).then((r) => {
    clearTimeout(timer);
    if (r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(req, copy)); }
    settle(r);
  }).catch(() => {
    clearTimeout(timer);
    saved.then((hit) => settle(hit || Response.error()));
  });
});
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
