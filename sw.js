/* VAULT service worker — 앱 껍데기 오프라인 캐시 (데이터는 항상 온라인 동기화) */
const CACHE = "vault-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/config.js",
  "./js/allocation.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Supabase API 및 CDN 은 항상 네트워크 우선
  if (url.origin !== location.origin) return;
  // 앱 정적 파일: 네트워크 우선, 실패 시 캐시 (업데이트 즉시 반영 + 오프라인 대비)
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
