// נתונים קלים לפס התחתון: המלצת היום + טראק המוזיקה של היום. ללא רשת, זול.

const fs = require("fs");
const path = require("path");
const { getDailyTips } = require("./dailyTips");

const TRACKS_FILE = path.join(__dirname, "..", "data", "ambient-tracks.json");

let cache = null;
function load() {
  if (cache) return cache;
  try {
    const j = JSON.parse(fs.readFileSync(TRACKS_FILE, "utf8"));
    cache = { tracks: j.tracks || [], moods: j.moods || [] };
  } catch {
    cache = { tracks: [], moods: [] };
  }
  return cache;
}
function tracks() { return load().tracks; }
function moods() { return load().moods; }

/** רשימת טראקים לפי מצב-רוח (mood key). ריק / "all" => הכל. */
function tracksByMood(mood) {
  const all = tracks();
  if (!mood || mood === "all") return all;
  const filtered = all.filter((t) => t.mood === mood);
  return filtered.length ? filtered : all;
}

function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

function getDockbar(date = new Date()) {
  const list = tracks();
  const track = list.length ? list[dayOfYear(date) % list.length] : null;
  const tip = getDailyTips(date, 1)[0] || null;
  return {
    date: date.toISOString().slice(0, 10),
    tip,
    ambient: track,
    ambientCount: list.length,
    moods: moods()
  };
}

/** מרענן את המטמון — לקריאה אחרי עריכת הקובץ מהמסך. */
function reload() { cache = null; return load(); }

module.exports = { getDockbar, tracks, moods, tracksByMood, reload };
