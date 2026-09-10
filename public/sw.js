// Service Worker — "הפנקס היומי"
// אסטרטגיה: קליפה (app shell) ב-cache-first, נתונים תמיד מהרשת עם נפילה ל-cache.
// המערכת עובדת גם אופליין — התוכן האחרון שנטען נשמר.

const VERSION = "pnks-v4";
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

// דפים וקבצים שנשמרים מראש — כדי שהאפליקציה תעבוד גם כשהמחשב כבוי / מחוץ לרשת
const SHELL_ASSETS = [
  // עמודים
  "/daily.html", "/index.html", "/finance.html", "/library.html",
  "/library/tehillim.html", "/library/haggadah.html", "/library/megillah.html",
  "/setup.html",
  // סגנונות
  "/css/style.css", "/css/dockbar.css", "/css/daily.css", "/css/finance.css",
  "/css/library.css", "/library/reader.css",
  // סקריפטים
  "/js/pnks-core.js", "/js/pnks-offline.js", "/js/dockbar.js", "/js/voice.js",
  "/js/pwa.js", "/js/daily.js", "/js/finance.js", "/js/library.js", "/js/avatar.js",
  "/library/reader.js",
  // ספריות ותוכן
  "/vendor/hebcal-core.min.js",
  "/library/tehillim-full.json", "/library/haggadah.json", "/library/megillah.json",
  // מניפסט ואייקונים
  "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png",
  "/icons/apple-touch-180.png", "/icons/favicon-64.png"
];

// נתוני API ששווה למשוך מראש בהתקנה כדי שיהיה תוכן ליום הראשון גם בלי רשת
const API_WARMUP = [
  "/api/daily-brief", "/api/tehillim", "/api/market", "/api/lotto",
  "/api/library", "/api/news"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => Promise.all(
        SHELL_ASSETS.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))
      ))
      .then(() => caches.open(RUNTIME).then((c) => Promise.all(
        API_WARMUP.map((u) => fetch(u).then((r) => r.ok && c.put(u, r.clone())).catch(() => {}))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith("/api/");
}
function isShell(url) {
  return url.origin === location.origin &&
    (url.pathname.endsWith(".html") || url.pathname.endsWith(".css") ||
     url.pathname.endsWith(".js") || url.pathname.startsWith("/icons/") ||
     url.pathname.startsWith("/library/") || url.pathname === "/manifest.webmanifest");
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // חיצוני (יוטיוב, ספריא) — לא נוגעים

  // API: network-first, נפילה ל-cache אם אין רשת
  if (isApi(url)) {
    e.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(request).then((m) => m || new Response(
        JSON.stringify({ offline: true, error: "אין חיבור — מוצג מידע שמור" }),
        { headers: { "Content-Type": "application/json" }, status: 503 }
      )))
    );
    return;
  }

  // קליפה: cache-first + רענון ברקע
  if (isShell(url)) {
    e.respondWith(
      caches.match(request).then((cached) => {
        const net = fetch(request).then((res) => {
          if (res && res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone())).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // ניווט (פתיחת עמוד): רשת, ואם אין — העמוד מהמטמון, ואם אין — מענה יומי
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((m) => m || caches.match("/daily.html"))
      )
    );
    return;
  }

  // ברירת מחדל: נסה רשת, נפול ל-cache
  e.respondWith(fetch(request).catch(() => caches.match(request)));
});

// עדכון מיידי כשעמוד מבקש
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
