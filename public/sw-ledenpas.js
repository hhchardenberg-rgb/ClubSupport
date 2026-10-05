/* Service worker Ledenpas: cachet ALLEEN de app-shell en niet-persoonlijke bestanden.
   Nooit pagina's met ledengegevens, API-antwoorden, beheer of scanresultaten. */
const CACHE = "ledenpas-shell-v1";
const SHELL = ["/ledenpas/offline"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Alleen navigaties binnen /ledenpas/: online -> netwerk (nooit cachen); offline -> neutrale offline-pagina.
  if (req.mode === "navigate" && url.pathname.startsWith("/ledenpas")) {
    e.respondWith(fetch(req).catch(() => caches.match("/ledenpas/offline")));
    return;
  }
  // Statische, niet-persoonlijke bestanden: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone())), res))));
  }
});
