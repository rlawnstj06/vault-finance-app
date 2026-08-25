/* VAULT service worker — 오프라인 캐시 + 웹 푸시 */
const CACHE = "vault-v23";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./terms.html",
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
  // 앱 정적 파일: 네트워크 우선(HTTP 캐시 무시하고 항상 최신), 실패 시 캐시 (오프라인 대비)
  e.respondWith(
    fetch(e.request, { cache: "no-store" }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

// 웹 푸시 수신 → 알림 표시
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "VAULT";
  const opts = {
    body: d.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: d.url || "./" },
    tag: d.tag || "vault",
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
