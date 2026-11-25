/* The app is local-first. Cache only the shell and this origin's build assets. */
const CACHE_NAME = "tempo-shell-v1";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
      // The first page loads before the worker controls it. Precache the Vite
      // entry assets from its HTML so its very next launch can work offline.
      const page = await cache.match("/");
      if (!page) throw new Error("The app shell could not be cached.");
      const html = await page.text();
      const assets = [
        ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
      ].map((match) => match[1]);
      await cache.addAll([...new Set(assets)]);
    })(),
  );
  // Keep an existing session on its current worker until all its tabs close.
});

self.addEventListener("activate", (event) => {
  // Intentionally retain earlier asset caches: an open tab may still need them.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const isNavigation = request.mode === "navigate";
  const isShellAsset =
    url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname);
  if (!isNavigation && !isShellAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          await cache.put(isNavigation ? "/" : request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(isNavigation ? "/" : request);
        return cached || Response.error();
      }
    })(),
  );
});
