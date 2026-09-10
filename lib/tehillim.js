// lib/tehillim.js — פרקי תהילים ליום, לפי החלוקה המסורתית לימי החודש (תהילים לחודש).
// טקסט נמשך מ-Sefaria ונשמר במטמון יומי. עובד גם כשאין רשת — מציג לפחות אילו פרקים.

const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "data", "tehillim-cache");
const BUNDLE = path.join(__dirname, "..", "public", "library", "tehillim-full.json");

// ניקוי טקסט מ-Sefaria: ישויות HTML, רווחים דקים, סימוני פרשה
function cleanVerse(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&thinsp;|&#8201;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, "")
    .replace(/[‎‏]/g, "")
    .replace(/\s*\{[פס]\}\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

let bundleCache = null;
function loadBundle() {
  if (bundleCache) return bundleCache;
  try {
    const raw = JSON.parse(fs.readFileSync(BUNDLE, "utf8")).chapters || {};
    bundleCache = {};
    for (const k of Object.keys(raw)) bundleCache[k] = (raw[k] || []).map(cleanVerse);
  } catch { bundleCache = {}; }
  return bundleCache;
}

// חלוקת "תהילים לחודש" — יום בחודש העברי → טווח פרקים
const MONTHLY = {
  1: [1, 9], 2: [10, 17], 3: [18, 22], 4: [23, 28], 5: [29, 34], 6: [35, 38],
  7: [39, 43], 8: [44, 48], 9: [49, 54], 10: [55, 59], 11: [60, 65], 12: [66, 68],
  13: [69, 71], 14: [72, 76], 15: [77, 78], 16: [79, 82], 17: [83, 87], 18: [88, 89],
  19: [90, 96], 20: [97, 103], 21: [104, 105], 22: [106, 107], 23: [108, 112], 24: [113, 118],
  25: [119, 119], 26: [119, 119], 27: [120, 134], 28: [135, 139], 29: [140, 144], 30: [145, 150]
};
// פרק קי״ט מפוצל בין כ״ה (פס' א-צו) לכ״ו (פס' צז-קעו)
const P119_SPLIT = 96;

let hebcalPromise = null;
const loadHebcal = () => (hebcalPromise = hebcalPromise || import("@hebcal/core"));

function chapterList(day, monthLen) {
  // בחודש חסר (29 יום), ביום כ״ט אומרים גם את פרקי יום ל׳
  const days = day === 29 && monthLen === 29 ? [29, 30] : [day];
  const chapters = [];
  for (const d of days) {
    const [a, b] = MONTHLY[d] || [1, 1];
    for (let c = a; c <= b; c++) if (!chapters.includes(c)) chapters.push(c);
  }
  return { chapters, split119: days.includes(25) ? "first" : days.includes(26) ? "second" : null };
}

function fetchChapter(ch) {
  // קודם כל מהחבילה המקומית (מיידי, עובד אופליין); Sefaria רק אם חסר
  const local = loadBundle()[ch] || loadBundle()[String(ch)];
  if (local && local.length) return Promise.resolve(local);
  return new Promise((resolve) => {
    const https = require("https");
    const req = https.get({
      host: "www.sefaria.org",
      path: `/api/texts/Psalms.${ch}?context=0&commentary=0&pad=0`,
      headers: { "User-Agent": "magnet-studio" }, timeout: 10000
    }, (r) => {
      const bufs = [];
      r.on("data", (c) => bufs.push(c));
      r.on("end", () => {
        try {
          const j = JSON.parse(Buffer.concat(bufs).toString("utf8"));
          resolve((j.he || j.text || []).map(cleanVerse));
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
  });
}

async function getDailyTehillim(now = new Date()) {
  const { HDate } = await loadHebcal();
  const hd = new HDate(now);
  const day = hd.getDate();
  const monthLen = hd.daysInMonth();
  const { chapters, split119 } = chapterList(day, monthLen);

  const dateKey = now.toISOString().slice(0, 10);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${dateKey}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (c && c.date === dateKey) return c;
  } catch { /* אין מטמון */ }

  const HE_NUM = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ"];
  const heChap = (n) => n <= 20 ? HE_NUM[n] : n < 100 ? `${HE_NUM[Math.floor(n / 10) * 10 / 10 * 0] || ""}` : "";
  const chapName = (n) => {
    // שמות פרקים בעברית מלאה (ק, קי, קיט וכו')
    const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    if (n < 10) return ones[n];
    if (n < 100) { let t = tens[Math.floor(n / 10)], o = ones[n % 10]; if (n % 10 === 5 && Math.floor(n / 10) === 1) return "טו"; if (n % 10 === 6 && Math.floor(n / 10) === 1) return "טז"; return t + o; }
    const h = "ק" + (n >= 200 ? "ר" : ""); const rem = n % 100;
    return h + (rem < 10 ? ones[rem] : (rem === 15 ? "טו" : rem === 16 ? "טז" : tens[Math.floor(rem / 10)] + ones[rem % 10]));
  };

  const allVerses = await Promise.all(chapters.map(fetchChapter));
  const out = [];
  chapters.forEach((ch, ci) => {
    let verses = allVerses[ci];
    let range = null;
    if (ch === 119 && split119 === "first") { verses = verses.slice(0, P119_SPLIT); range = "פסוקים א׳–צ״ו"; }
    else if (ch === 119 && split119 === "second") { verses = verses.slice(P119_SPLIT); range = "פסוקים צ״ז–קע״ו"; }
    out.push({ n: ch, name: chapName(ch), range, verses: verses.map((v, i) => ({ n: (ch === 119 && split119 === "second" ? P119_SPLIT + 1 : 1) + i, he: v })) });
  });

  const result = {
    date: dateKey,
    hebrewDate: hd.render("he"),
    dayOfMonth: day,
    monthName: hd.render("he").split(" ").slice(1).join(" "),
    chapters: chapters.map(chapName),
    available: out.some((c) => c.verses.length),
    sections: out
  };

  try { fs.writeFileSync(cacheFile, JSON.stringify(result, null, 1)); } catch {}
  try {
    for (const f of fs.readdirSync(CACHE_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().slice(0, -7)) {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    }
  } catch {}
  return result;
}

// גרסה קלה — רק אילו פרקים היום, בלי למשוך טקסט (למענה היומי)
async function getDailyChapters(now = new Date()) {
  const { HDate } = await loadHebcal();
  const hd = new HDate(now);
  const { chapters } = chapterList(hd.getDate(), hd.daysInMonth());
  const chapName = (n) => {
    const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    if (n < 10) return ones[n];
    if (n < 100) { if (n === 15) return "טו"; if (n === 16) return "טז"; return tens[Math.floor(n / 10)] + ones[n % 10]; }
    const rem = n % 100;
    return "ק" + (rem === 0 ? "" : rem < 10 ? ones[rem] : rem === 15 ? "טו" : rem === 16 ? "טז" : tens[Math.floor(rem / 10)] + ones[rem % 10]);
  };
  return {
    hebrewDate: hd.render("he"),
    dayOfMonth: hd.getDate(),
    chapters: chapters.map(chapName),
    range: chapters.length > 1 ? `${chapName(chapters[0])}–${chapName(chapters[chapters.length - 1])}` : chapName(chapters[0])
  };
}

module.exports = { getDailyTehillim, getDailyChapters };
