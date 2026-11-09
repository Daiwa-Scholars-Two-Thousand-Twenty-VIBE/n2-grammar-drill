// Offline support. The drill's own files: network first, so a new version shows up straight away,
// with the cache as the fallback offline. Progress lives in localStorage, so nothing else is needed.
//
// Never cached: the sync relay (api/, on the Vercel copy) and anything on another site (the GitHub
// API, gist files). A device must never merge with an old copy of the gist.
//
// Other apps on the same github.io address share this browser's cache storage, so only caches
// named with this app's prefix are ever deleted.
const PREFIX = "n2-drill-";
const SHELL = `${PREFIX}shell-v1`;
const FILES = [
  "./",
  "index.html",
  "css/style.css",
  "js/data.js",
  "js/sound.js",
  "js/srs.js",
  "js/sync.js",
  "js/app.js",
  "manifest.webmanifest",
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        // 200 only: audio comes back as 206 (part of a file), which the cache refuses.
        if (res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))),
  );
});
