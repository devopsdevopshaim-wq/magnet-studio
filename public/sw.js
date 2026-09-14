// Service Worker — "הפנקס היומי"
// אסטרטגיה: קליפה (app shell) ב-cache-first, נתונים תמיד מהרשת עם נפילה ל-cache.
// המערכת עובדת גם אופליין — התוכן האחרון שנטען נשמר.

const VERSION = "pnks-v5";
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

// כל עמודי הניווט — כדי שלחיצה על כל לשונית תמיד תיפתח, גם ברשת חלשה/לא זמינה בטלפון
// (בלי זה, ניווט לעמוד שלא הוזמן אף פעם היה נופל בשקט ל-daily.html כשהרשת נכשלת)
const NAV_PAGES = [
  "/daily.html", "/index.html", "/jarvis.html", "/housing.html", "/jobs.html",
  "/finance.html", "/health.html", "/fitness.html", "/devops.html", "/aia.html",
  "/torah.html", "/marketing.html", "/logo.html", "/business.html", "/tv.html",
  "/library.html", "/device.html", "/graphology.html", "/astro-full.html",
  "/editor.html", "/mail.html", "/setup.html",
  "/library/tehillim.html", "/library/haggadah.html", "/library/megillah.html"
];

// דפים וקבצים שנשמרים מראש — כדי שהאפליקציה תעבוד גם כשהמחשב כבוי / מחוץ לרשת
const SHELL_ASSETS = [
  ...NAV_PAGES,
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

function offlinePage() {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
    <body style="background:#1b1611;color:#e8ddc9;font-family:system-ui;text-align:center;padding:60px 20px">
    <h1>אין חיבור לרשת</h1>
    <p>העמוד הזה עדיין לא נשמר במכשיר לצפייה אופליין.</p>
    <p><a href="/daily.html" style="color:#db8b42">חזרה למענה היומי</a> · <a href="javascript:location.reload()" style="color:#db8b42">נסה שוב</a></p>
    </body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // חיצוני (יוטיוב, ספריא) — לא נוגעים

  // ניווט (פתיחת עמוד — לחיצה על לשונית): נבדק ראשון, לפני isShell, כי כל עמוד .html
  // גם עונה על isShell — אחרת הענף הזה לעולם לא היה מגיע לריצה בפועל.
  // רשת קודם, ואם אין — בדיוק העמוד המבוקש מהמטמון. לעולם לא מחליפים בשקט לעמוד אחר
  // (למשל daily.html) — אם גם הוא לא במטמון, מוצגת הודעת "אין רשת" ברורה.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).then((res) => {
        if (res && res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone())).catch(() => {});
        return res;
      }).catch(async () => (await caches.match(request)) || offlinePage())
    );
    return;
  }

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

  // קליפה (CSS/JS/אייקונים/מניפסט, ו-.html שנטען לא כניווט): cache-first + רענון ברקע
  if (isShell(url)) {
    e.respondWith(
      caches.match(request).then((cached) => {
        const net = fetch(request).then((res) => {
          if (res && res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone())).catch(() => {});
          return res;
        }).catch(() => cached || new Response("", { status: 504 }));
        return cached || net;
      })
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
