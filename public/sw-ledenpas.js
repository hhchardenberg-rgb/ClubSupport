/* Service worker Ledenpas.
   Cachet de app-shell en een offline-pagina (zonder persoonsgegevens). Pasgegevens staan NIET in deze cache:
   de offline-pagina leest de bewaarde passen uit localStorage (zie src/lib/offline-store.ts) en toont die lokaal.
   Nooit cachen: API-antwoorden, ledenpagina's met gegevens, scanresultaten. */
const CACHE = "ledenpas-shell-v2";
const OFFLINE = "/ledenpas/offline";
const STAMP = "/__offline-stamp";
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const STATIC = [
  "/fonts/dinnext-light.woff2", "/fonts/dinnext-regular.woff2", "/fonts/dinnext-medium.woff2", "/fonts/dinnext-bold.woff2",
  "/fonts/din-medium-italic.woff2", "/fonts/din-black.woff2", "/brand/logo.png", "/icons/ledenpas-192.png",
];

/** Haalt de offline-pagina plus alle bestanden die daarvoor nodig zijn (scripts, stijl, lettertypen, logo) op. */
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(OFFLINE, { cache: "no-store" });
  if (!res.ok) throw new Error("offline-pagina niet beschikbaar");
  const html = await res.clone().text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
  await cache.put(OFFLINE, res);
  await Promise.all([...assets, ...STATIC].map((u) => cache.add(u).catch(() => undefined)));
  await cache.put(STAMP, new Response(String(Date.now())));
}

async function refreshIfStale() {
  const cache = await caches.open(CACHE);
  const stamp = await cache.match(STAMP);
  const t = stamp ? Number(await stamp.text()) : 0;
  if (Date.now() - t > REFRESH_AFTER_MS) await precache();
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // nooit via de cache
  // Navigaties binnen /ledenpas: online -> netwerk (nooit cachen); offline -> offline-pagina met bewaarde passen.
  if (req.mode === "navigate" && url.pathname.startsWith("/ledenpas")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) e.waitUntil(refreshIfStale().catch(() => undefined));
          return res;
        })
        .catch(() => caches.match(OFFLINE).then((hit) => hit || Response.error())),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok && caches.open(CACHE).then((c) => c.put(req, res.clone())), res))));
  }
});
