// lib/analytics.js — מדדי שימוש פרטיים: כניסות לאתר (לפי יום), מבקרים ייחודיים (לפי עוגיית ההתחברות),
// עמודים פופולריים, והורדות של אפליקציית האנדרואיד. נראה רק לבעל האתר (מאחורי אותו שער-סיסמה של כל האתר).
// נשמר ב-PERSIST_DIR כדי לשרוד פריסה מחדש בענן (עם דיסק קבוע מחובר).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PERSIST_DIR } = require("./paths");

const FILE = path.join(PERSIST_DIR, "analytics.json");
const FLUSH_MS = 30000;

function todayKey() { return new Date().toISOString().slice(0, 10); }

function blank() { return { days: {}, appDownloads: { total: 0, days: {} } }; }

function load() {
  try { return { ...blank(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; }
  catch { return blank(); }
}

let state = load();
// מבקרים ייחודיים של היום הנוכחי — Set זמני בזיכרון (לא נשמר גולמי, רק הגודל שלו)
let uniqueToday = new Set();
let uniqueDayKey = todayKey();
let dirty = false;

function dayBucket(key) {
  if (!state.days[key]) state.days[key] = { views: 0, uniqueVisitors: 0, pages: {} };
  return state.days[key];
}

function hashVisitor(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 16);
}

// נקרא מ-middleware על כל טעינת עמוד HTML אמיתית (לא API/assets) — track(path, visitorToken)
function track(pagePath, visitorToken) {
  const key = todayKey();
  if (key !== uniqueDayKey) { uniqueToday = new Set(); uniqueDayKey = key; }
  const bucket = dayBucket(key);
  bucket.views++;
  bucket.pages[pagePath] = (bucket.pages[pagePath] || 0) + 1;
  if (visitorToken) {
    const h = hashVisitor(visitorToken);
    if (!uniqueToday.has(h)) { uniqueToday.add(h); bucket.uniqueVisitors++; }
  }
  dirty = true;
}

function trackDownload() {
  const key = todayKey();
  state.appDownloads.total++;
  state.appDownloads.days[key] = (state.appDownloads.days[key] || 0) + 1;
  dirty = true;
}

function flush() {
  if (!dirty) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
    dirty = false;
  } catch { /* ננסה שוב בפעם הבאה */ }
}
setInterval(flush, FLUSH_MS).unref();
process.on("SIGTERM", flush);
process.on("SIGINT", flush);

// ---------- קריאה לדשבורד ----------

function sumRange(days) {
  const keys = Object.keys(state.days).sort().slice(-days);
  let views = 0, visitors = 0;
  const pages = {};
  for (const k of keys) {
    const b = state.days[k];
    views += b.views; visitors += b.uniqueVisitors;
    for (const [p, n] of Object.entries(b.pages)) pages[p] = (pages[p] || 0) + n;
  }
  return { views, visitors, pages };
}

function getStats() {
  const allDays = Object.keys(state.days).sort();
  const today = todayKey();
  const totalViews = allDays.reduce((s, k) => s + state.days[k].views, 0);
  const totalVisitorsApprox = allDays.reduce((s, k) => s + state.days[k].uniqueVisitors, 0);
  const last7 = sumRange(7);
  const last30 = sumRange(30);
  const todayBucket = state.days[today] || { views: 0, uniqueVisitors: 0, pages: {} };

  const topPages = Object.entries(last30.pages).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([p, n]) => ({ page: p, views: n }));

  const daily = allDays.slice(-30).map((k) => ({
    date: k, views: state.days[k].views, visitors: state.days[k].uniqueVisitors
  }));

  return {
    today: { views: todayBucket.views, visitors: todayBucket.uniqueVisitors },
    last7,
    last30,
    allTime: { views: totalViews, visitors: totalVisitorsApprox, sinceDay: allDays[0] || today },
    topPages,
    daily,
    appDownloads: {
      total: state.appDownloads.total,
      today: state.appDownloads.days[today] || 0,
      last7: Object.keys(state.appDownloads.days).sort().slice(-7)
        .reduce((s, k) => s + state.appDownloads.days[k], 0)
    }
  };
}

module.exports = { track, trackDownload, getStats, flush };
