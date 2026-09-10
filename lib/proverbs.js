// פתגם יומי - נבחר דטרמיניסטית לפי היום בשנה מתוך data/proverbs.json.
// אותו יום -> אותו פתגם; מסתובב לאורך השנה.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "proverbs.json");

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
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

function getDailyProverb(date = new Date()) {
  const list = load();
  if (!list.length) return null;
  const idx = dayOfYear(date) % list.length;
  return { ...list[idx], index: idx, total: list.length };
}

module.exports = { getDailyProverb };
