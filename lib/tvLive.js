// lib/tvLive.js — מאתר את מזהה הסרטון החי הנוכחי של ערוץ יוטיוב.
// embed/live_stream?channel= לא אמין (יוטיוב לעיתים לא טוען את הנגן דרכו).
// לכן: שולפים את דף /live של הערוץ, ומוצאים בתוכו את ה-videoId הראשון —
// זה תמיד הסרטון המוצג תחת הלשונית "Live" של הערוץ (חי עכשיו, או האחרון ששודר).
// התוצאה נשמרת ב-cache לכמה דקות כדי לא להעמיס בקשות על יוטיוב בכל טעינת עמוד.

const https = require("https");

const CACHE_TTL_MS = 4 * 60 * 1000;
const cache = new Map(); // channelId -> { videoId, live, at }

function fetchHtml(url, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout
    }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return fetchHtml(r.headers.location, timeout).then(resolve, reject);
      }
      const bufs = [];
      r.on("data", (c) => bufs.push(c));
      r.on("end", () => resolve(Buffer.concat(bufs).toString("utf8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function resolveLiveVideoId(channelId) {
  const cached = cache.get(channelId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;

  let result = { videoId: null, live: false, at: Date.now() };
  try {
    const html = await fetchHtml(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`);
    // ה-videoId הראשון בדף הוא תמיד זה שמוצג תחת הלשונית "Live" של הערוץ (title:"Live",selected:true) —
    // כלומר השידור החי הנוכחי, או האחרון שהיה חי אם אין כרגע שידור פעיל.
    const m = /"videoId":"([a-zA-Z0-9_-]{11})"/.exec(html);
    if (m) result = { videoId: m[1], live: true, at: Date.now() };
  } catch { /* נשאר null — הלקוח יציג "לא נמצא שידור חי" */ }

  cache.set(channelId, result);
  return result;
}

module.exports = { resolveLiveVideoId };
