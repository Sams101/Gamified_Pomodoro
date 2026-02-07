/* Offline-first app-shell cache (no network calls are required for core UX). */
const CACHE_NAME = "pomodoro-quest-v4";

const ASSETS = [
  "./",
  "./index.html",
  "./about.html",
  "./signin.html",
  "./signup.html",
  "./styles.css",
  "./manifest.json",
  "./assets/icon.svg",
  "./src/main.js",
  "./src/auth.js",
  "./src/db.js",
  "./src/timer.js",
  "./src/scoring.js",
  "./src/ui.js",
  "./src/chart.js",
  "./src/settings.js",
  "./src/sounds.js",
  "./src/signin.js",
  "./src/signup.js",
  "./src/utils.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        // If offline and not in cache, fall back to app shell.
        const shell = await cache.match("./index.html");
        return shell || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
