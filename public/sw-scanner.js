/* Service worker Scanner: ALLEEN app-shell/statische bestanden. Nooit API-antwoorden, scanresultaten
   of persoonsgegevens cachen: de geldigheid wordt altijd live bij de server bepaald. */
const CACHE = "scanner-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/scanner/offline"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // nooit via de cache
  if (req.mode === "navigate" && url.pathname.startsWith("/scanner")) {
    e.respondWith(fetch(req).catch(() => caches.match("/scanner/offline")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone())), res))));
  }
});
