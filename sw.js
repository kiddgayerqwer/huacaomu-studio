// 離線快取：網頁檔案存在 iPad 上，沒網路也能打開
const VERSION = 'v8';
const CACHE = 'huacaomu-' + VERSION;
const FILES = [
  './', './index.html', './css/style.css', './js/app.js', './js/db.js', './js/sync.js', './js/config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './icons/logo.png', './icons/logo-wreath.png', './icons/sprig-tl.png', './icons/sprig-br.png', './icons/marble.jpg', './icons/icon-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 雲端 API 不快取
  // 先用網路拿最新版，沒網路時用快取
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // 每次向伺服器確認最新版，避免新舊檔案混用
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
