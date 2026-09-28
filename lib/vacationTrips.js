// lib/vacationTrips.js — עותק שרתי של "החופשות שלי" מאתר מסע (vacation-hub), פר-חשבון.
// האתר עצמו שומר רק בדפדפן (localStorage); הסקריפט שמוזרק ב-lib/vacationProxy.js מסנכרן
// לכאן כדי שהחופשות ישרדו מעבר למכשיר אחד, ו-lib/backgroundSync.js יוכל לבדוק תאריכים
// קרובים וליצור התראות "דקה 90" גם כשאף מכשיר לא פתוח.

const fs = require("fs");
const path = require("path");

function fileFor(baseDir) {
  return path.join(baseDir, "vacation-trips.json");
}

function read(baseDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8"));
    return { trips: Array.isArray(raw.trips) ? raw.trips : [], updatedAt: raw.updatedAt || null };
  } catch {
    return { trips: [], updatedAt: null };
  }
}

function write(baseDir, trips) {
  fs.mkdirSync(baseDir, { recursive: true });
  const payload = { trips: Array.isArray(trips) ? trips : [], updatedAt: new Date().toISOString() };
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(payload, null, 2));
  return { ok: true };
}

module.exports = { read, write };
