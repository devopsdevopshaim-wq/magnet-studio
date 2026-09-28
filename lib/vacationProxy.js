// lib/vacationProxy.js — מגיש את אתר "מסע · מערכת לניהול חופשות" (repo נפרד:
// devopsdevopshaim-wq/devops-hub, תיקיית vacation-hub/) ישירות מ-raw.githubusercontent.com,
// בלי תלות בהפעלת GitHub Pages ובלי להעתיק את קוד המקור לתוך ה-repo הזה. מטמון קצר בזיכרון
// (5 דק') כדי לא להכביד על GitHub בכל טעינת עמוד.

const https = require("https");

const REPO_BASE = "https://raw.githubusercontent.com/devopsdevopshaim-wq/devops-hub/main/vacation-hub";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // path -> { buf, at }

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 15000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub החזיר ${res.statusCode} עבור ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("timeout", function () { this.destroy(new Error("timeout")); })
      .on("error", reject);
  });
}

async function fetchCached(relPath) {
  const hit = cache.get(relPath);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.buf;
  const buf = await fetchBuffer(`${REPO_BASE}/${relPath}`);
  cache.set(relPath, { buf, at: Date.now() });
  return buf;
}

// סקריפט סנכרון "החופשות שלי": האתר שומר trips רק ב-localStorage (עובד מכל דפדפן, גם בלי
// חשבון) — הסקריפט הזה בנוסף מסנכרן ל-/api/vacations/sync (אותו origin, כי הכל מוגש דרך
// ה-proxy הזה) כך שהחשבון המחובר ב-HKDAILY שומר עותק שרתי ומקבל התראות "דקה 90" גם כשהמכשיר
// כבוי. בעליית העמוד: אם אין עדיין trips מקומיים אך יש בשרת — מושך ומרענן. אחרי זה: דוחף כל
// שינוי מקומי לשרת כל כמה שניות.
const SYNC_SCRIPT = `
<script>
(function(){
  var KEY = "masa.trips";
  function readLocal(){ try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch(e){ return []; } }
  function writeLocal(t){ try { localStorage.setItem(KEY, JSON.stringify(t)); } catch(e){} }
  var lastSynced = null;
  function pushIfChanged(){
    var trips = readLocal();
    var s = JSON.stringify(trips);
    if (s === lastSynced) return;
    lastSynced = s;
    fetch("/api/vacations/sync", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: s }).catch(function(){});
  }
  fetch("/api/vacations/sync", { credentials: "same-origin" }).then(function(r){ return r.json(); }).then(function(data){
    var serverTrips = (data && data.trips) || [];
    var local = readLocal();
    if (!local.length && serverTrips.length) { writeLocal(serverTrips); location.reload(); }
    else { lastSynced = JSON.stringify(local); }
  }).catch(function(){});
  setInterval(pushIfChanged, 4000);
  window.addEventListener("beforeunload", pushIfChanged);
})();
</script>`;

// index.html: מנתב קישורי css/js/vendor/api יחסיים דרך /vacation/asset/... כדי שהם ימשיכו
// לעבוד גם בלי GitHub Pages, ומוסיף <base target="_parent"> כדי שקישורי הזמנה ייפתחו מחוץ ל-iframe.
async function landingHtml() {
  const buf = await fetchCached("index.html");
  let html = buf.toString("utf8");
  html = html.replace(/(href|src)=(["'])(css|js|vendor|api)\//g, `$1=$2/vacation/asset/$3/`);
  if (!/<base\s/i.test(html)) {
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => `${m}\n<base target="_parent">`)
      : `<base target="_parent">\n${html}`;
  }
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${SYNC_SCRIPT}\n</body>`) : html + SYNC_SCRIPT;
  return html;
}

async function asset(relPath) {
  const buf = await fetchCached(relPath);
  const ext = relPath.slice(relPath.lastIndexOf(".")).toLowerCase();
  return { buf, contentType: CONTENT_TYPES[ext] || "application/octet-stream" };
}

module.exports = { landingHtml, asset };
