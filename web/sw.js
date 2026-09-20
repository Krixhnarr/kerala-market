// Minimal app-shell cache for the Kerala Market PWA.
// Static files (this shell, icons, vendor scripts) are cache-first so the app
// opens instantly and works offline; anything under /rest/ or /auth/ (Supabase
// data and sign-in) always goes to the network - rates and favourites must be
// current, never served stale.
const CACHE = "kerala-market-v3";
const SHELL = [
  "./",
  "./index.html",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== location.origin) return; // let cross-origin CDN requests hit the network normally
  if (url.hostname.endsWith(".supabase.co")) return; // never cache live data or auth

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp.ok) caches.open(CACHE).then((c) => c.put(event.request, resp.clone()));
        return resp;
      }).catch(() => cached);
    })
  );
});
