// lib/hubProxy.js — מגיש אתרים סטטיים שחיים ב-repo נפרד (devopsdevopshaim-wq/devops-hub)
// ישירות מ-raw.githubusercontent.com, בלי תלות בהפעלת GitHub Pages ובלי להעתיק את קוד המקור
// לתוך ה-repo הזה. מטמון קצר בזיכרון (5 דק') כדי לא להכביד על GitHub בכל טעינת עמוד.
// כל אתר (חופשות/עיצוב פנים/סטודיו ספרים) הוא מופע נפרד עם ה-branch/תיקייה שלו-עצמו.

const https = require("https");

const OWNER_REPO = "devopsdevopshaim-wq/devops-hub";
const CACHE_TTL_MS = 5 * 60 * 1000;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4"
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

/**
 * יוצר proxy לאתר סטטי אחד בתוך devops-hub.
 * @param {string} branch - "gh-pages" (מפורסם) או "main" (עדיין לא סונכרן ל-Pages).
 * @param {string} basePath - תיקיית האתר בתוך ה-branch, ריק אם ה-branch כולו הוא האתר.
 * @param {string} proxyPrefix - הנתיב שדרכו האתר מוגש אצלנו, לדוגמה "/vacation".
 * @param {() => string} [extraScript] - HTML נוסף (למשל script סנכרון) להזריק לפני </body>.
 */
function createHubProxy({ branch, basePath = "", proxyPrefix, extraScript }) {
  const repoBase = `https://raw.githubusercontent.com/${OWNER_REPO}/${branch}${basePath ? "/" + basePath : ""}`;
  const cache = new Map(); // relPath -> { buf, at }

  async function fetchCached(relPath) {
    const hit = cache.get(relPath);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.buf;
    const buf = await fetchBuffer(`${repoBase}/${relPath}`);
    cache.set(relPath, { buf, at: Date.now() });
    return buf;
  }

  // מנתב קישורי css/js/vendor/api/assets יחסיים דרך <proxyPrefix>/asset/... כדי שיעבדו תמיד
  // (גם בלי GitHub Pages), ומוסיף <base target="_parent"> כדי שקישורי הזמנה חיצוניים ייפתחו
  // מחוץ ל-iframe.
  //
  // בעיה ותיקון: <base href> פותר גם הפניות יחסיות שלא נתפסות ע"י הרג'קס לעיל (url() ב-CSS,
  // fetch() יחסי, גופנים) — אבל אתרים כמו "מסע" מנווטים פנימית עם עוגני hash בלבד
  // (href="#dest-jerusalem"). בלי טיפול מיוחד, ה-base href הופך קליק על עוגן כזה לניווט אמיתי
  // אל "<proxyPrefix>/asset/#dest-jerusalem" (עמוד שלא קיים) במקום סתם לשנות את ה-hash באותו
  // עמוד — זו בדיוק התקלה "נותן תקלה" שדווחה בלחיצה על יעדים בארץ. הפתרון: תופסים קליקים על
  // קישורי hash-בלבד לפני שהדפדפן מנווט, ומעדכנים location.hash ידנית (שלא מושפע מ-base href).
  const HASH_FIX_SCRIPT = `
<script>
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  var href = a.getAttribute("href");
  if (href && href.length > 1) {
    e.preventDefault();
    location.hash = href;
  }
}, true);
</script>`;

  async function landingHtml() {
    const buf = await fetchCached("index.html");
    let html = buf.toString("utf8");
    html = html.replace(/(href|src)=(["'])(css|js|vendor|api|assets|img|images)\//g, `$1=$2${proxyPrefix}/asset/$3/`);
    if (!/<base\s/i.test(html)) {
      const baseTag = `<base href="${proxyPrefix}/asset/" target="_parent">`;
      html = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`)
        : `${baseTag}\n${html}`;
    }
    const scripts = HASH_FIX_SCRIPT + (extraScript ? extraScript() : "");
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scripts}\n</body>`) : html + scripts;
    return html;
  }

  async function asset(relPath) {
    const buf = await fetchCached(relPath);
    const ext = relPath.slice(relPath.lastIndexOf(".")).toLowerCase();
    return { buf, contentType: CONTENT_TYPES[ext] || "application/octet-stream" };
  }

  return { landingHtml, asset };
}

module.exports = { createHubProxy };
