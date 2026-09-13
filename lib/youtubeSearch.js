// lib/youtubeSearch.js — חיפוש חופשי ב-YouTube בלי מפתח API.
// שולף את דף תוצאות החיפוש הציבורי ומחלץ ממנו את ytInitialData (אותו JSON שהדף עצמו טוען).
// שימוש: נגן המוזיקה בפס התחתון — "חיפוש חופשי" מעבר לרשימה המתוקתקת, נגן באותו IFrame Player.

const https = require("https");

function fetchHtml(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8"
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

function secToClock(sec) {
  sec = Number(sec) || 0;
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** מחפש ב-YouTube. מחזיר [{id,title,channel,duration}] — רק סרטונים (לא פלייליסטים/ערוצים). */
async function searchYouTube(query, max = 12, { liveOnly = false } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  // sp=EgRAAVgD = מסנן התוצאות של יוטיוב ל"שידורים חיים" בלבד (מתוך תפריט הסינון של יוטיוב עצמו)
  const filter = liveOnly ? "&sp=EgRAAVgD" : "";
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=he${filter}`;
  const html = await fetchHtml(url);

  const m = /var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s.exec(html) ||
            /ytInitialData"\]\s*=\s*(\{.+?\});/s.exec(html);
  if (!m) return [];

  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }

  const out = [];
  const seen = new Set();
  (function walk(node) {
    if (out.length >= max || !node || typeof node !== "object") return;
    if (node.videoRenderer) {
      const v = node.videoRenderer;
      const id = v.videoId;
      const title = (v.title?.runs || []).map((r) => r.text).join("") || v.title?.simpleText || "";
      const channel = (v.ownerText?.runs || []).map((r) => r.text).join("") || v.shortBylineText?.runs?.[0]?.text || "";
      const dur = v.lengthText?.simpleText || "";
      const isLive = !!(v.badges || []).find((b) => /LIVE/i.test(b.metadataBadgeRenderer?.label || "")) ||
        !!(v.thumbnailOverlays || []).find((o) => /LIVE/i.test(o.thumbnailOverlayTimeStatusRenderer?.style || ""));
      const channelId = v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
        v.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || null;
      if (id && title && !seen.has(id)) {
        seen.add(id);
        out.push({ id, title: title.trim(), channel: channel.trim(), duration: dur, isLive, channelId });
      }
      return;
    }
    if (Array.isArray(node)) { for (const c of node) walk(c); return; }
    for (const k in node) walk(node[k]);
  })(data);

  return out.slice(0, max);
}

/** מוצא שידור חי נוכחי לפי שם ערוץ/חיפוש — למסך טלוויזיה. */
async function findLiveStream(query) {
  const items = await searchYouTube(String(query || "").trim(), 10, { liveOnly: true });
  return items.find((it) => it.isLive) || items[0] || null;
}

module.exports = { searchYouTube, secToClock, findLiveStream };
