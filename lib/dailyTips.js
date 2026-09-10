// המלצות ניהול-יום — נבחרות דטרמיניסטית לפי היום בשנה, מקטגוריות שונות.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "daily-tips.json");

let cache = null;
function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = [];
  }
  return cache;
}

function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

/** n המלצות ליום, מקטגוריות שונות ככל האפשר */
function getDailyTips(date = new Date(), n = 3) {
  const list = load();
  if (!list.length) return [];
  const doy = dayOfYear(date);
  const picked = [];
  const usedCats = new Set();
  // מתחילים מהאינדקס של היום, ומתקדמים; מדלגים על קטגוריה שכבר נבחרה עד שנגמרות
  for (let step = 0; step < list.length && picked.length < n; step++) {
    const item = list[(doy * 7 + step) % list.length];
    if (usedCats.has(item.category)) continue;
    usedCats.add(item.category);
    picked.push(item);
  }
  // אם עדיין חסר (מעט קטגוריות) — נמלא בלי אילוץ הקטגוריה
  for (let step = 0; step < list.length && picked.length < n; step++) {
    const item = list[(doy * 7 + step) % list.length];
    if (picked.includes(item)) continue;
    picked.push(item);
  }
  return picked;
}

module.exports = { getDailyTips };
