const CACHE_NAME = "pannes-historiques-v0.2.8-post-archive-stability";
const APP_SHELL_URLS = [
  "/static/app.css",
  "/static/app.js",
  "/static/detail-panels.js",
  "/static/icons.svg",
  "/static/icons.js",
  "/static/map-layers.js",
  "/static/outage-map.js",
  "/static/search.js",
  "/static/side-panel.js",
  "/static/ui-format.js",
  "/static/vendor/leaflet/leaflet.css",
  "/static/vendor/leaflet/leaflet.js",
  "/static/vendor/leaflet/images/layers-2x.png",
  "/static/vendor/leaflet/images/layers.png",
  "/static/vendor/leaflet/images/marker-icon-2x.png",
  "/static/vendor/leaflet/images/marker-icon.png",
  "/static/vendor/leaflet/images/marker-shadow.png",
  "/static/app-icon-180.png",
  "/static/app-icon-192.png",
  "/static/app-icon-512.png",
  "/static/app-icon.svg",
  "/static/app-icon-maskable.svg",
  "/static/favicon.svg",
  "/static/manifest.webmanifest",
  "/static/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/static/offline.html")));
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    if (url.search) {
      event.respondWith(fetch(request).catch(() => caches.match(url.pathname)));
      return;
    }

    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
