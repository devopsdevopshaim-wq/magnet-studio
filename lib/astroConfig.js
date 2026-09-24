// קונפיג פרטי לידה + מיקום, ל-lib/astroClient.js ו-lib/skyClient.js.
// מאוחסן ב-PERSIST_DIR (לא data/ הרגילה!) — היה כאן באג אמיתי: הקובץ נשמר קודם תחת data/
// הרגילה, לא על הדיסק הקבוע של Render, ולכן נמחק בכל redeploy/restart בענן. זו הסיבה
// הסבירה ל"אני חייב להזין את זה מחדש כל פעם" שדווח. אופציונלי baseDir לתמיכה עתידית
// בקונפיג פר-חשבון (ברירת מחדל: PERSIST_DIR, כמו כל שאר הקריאות הקיימות).
const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./paths");

function fileFor(baseDir) { return path.join(baseDir || PERSIST_DIR, "astro-config.json"); }

// ערים נפוצות בישראל (lat, lon) - כדי שהמשתמש יזין שם עיר ולא קואורדינטות
const CITIES = {
  "ירושלים": [31.7683, 35.2137],
  "תל אביב": [32.0853, 34.7818],
  "חיפה": [32.7940, 34.9896],
  "באר שבע": [31.2518, 34.7913],
  "ראשון לציון": [31.9730, 34.7925],
  "פתח תקווה": [32.0840, 34.8878],
  "נתניה": [32.3215, 34.8532],
  "אשדוד": [31.8014, 34.6435],
  "בני ברק": [32.0807, 34.8338],
  "רמת גן": [32.0684, 34.8248],
  "אשקלון": [31.6688, 34.5715],
  "רחובות": [31.8928, 34.8113],
  "בת ים": [32.0171, 34.7457],
  "כפר סבא": [32.1750, 34.9070],
  "הרצליה": [32.1624, 34.8447],
  "חדרה": [32.4340, 34.9196],
  "מודיעין": [31.8969, 35.0104],
  "נצרת": [32.7021, 35.2978],
  "רעננה": [32.1848, 34.8713],
  "טבריה": [32.7959, 35.5300],
  "אילת": [29.5577, 34.9519],
  "עפולה": [32.6078, 35.2897],
  "אריאל": [32.1058, 35.1878],
  "לוד": [31.9516, 34.8953],
  "רמלה": [31.9293, 34.8663]
};

function readAstroConfig(baseDir) {
  try {
    const c = JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8"));
    return c && c.birthDate ? c : null;
  } catch {
    return null;
  }
}

/**
 * מקבל { birthDate:"YYYY-MM-DD", birthTime:"HH:MM", birthPlace:"עיר",
 *        lat?, lon?, tzOffsetMinutes? } ומנרמל.
 */
function writeAstroConfig(input, baseDir) {
  const b = input || {};
  let lat = Number(b.lat);
  let lon = Number(b.lon);
  const place = (b.birthPlace || b.place || "").trim();

  if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && place && CITIES[place]) {
    [lat, lon] = CITIES[place];
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    [lat, lon] = CITIES["ירושלים"];
  }

  const clean = {
    birthDate: (b.birthDate || "").trim(),
    birthTime: (b.birthTime || "12:00").trim(),
    birthPlace: place || "ירושלים",
    lat,
    lon,
    // ברירת מחדל: ישראל. IST = UTC+2, IDT = UTC+3. אם לא נמסר, נגזור לפי התאריך.
    tzOffsetMinutes: Number.isFinite(Number(b.tzOffsetMinutes)) ? Number(b.tzOffsetMinutes) : null,
    savedAt: new Date().toISOString()
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.birthDate)) {
    throw new Error("תאריך לידה חייב להיות בפורמט YYYY-MM-DD");
  }
  if (!/^\d{1,2}:\d{2}$/.test(clean.birthTime)) clean.birthTime = "12:00";

  const file = fileFor(baseDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(clean, null, 2), "utf8");
  return clean;
}

/** קובע את היסט אזור-הזמן בישראל לתאריך נתון (DST: אחרון במרץ עד אחרון באוקטובר, בקירוב) */
function israelTzOffsetMinutes(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const m = d.getUTCMonth() + 1;
  // קירוב: אפריל-אוקטובר = שעון קיץ (UTC+3), אחרת UTC+2
  const isDST = m >= 4 && m <= 10;
  return isDST ? 180 : 120;
}

module.exports = { readAstroConfig, writeAstroConfig, israelTzOffsetMinutes, CITIES };
