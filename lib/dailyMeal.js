// lib/dailyMeal.js — מנה עיקרית וקינוח ליום: מתכון מלא (AI) + תמונה אמיתית (Wikimedia Commons, חינם, בלי מפתח).
// נשמר במטמון יומי — לא נוצר מחדש בכל טעינה.

const https = require("https");
const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "data");

function fetchJson(host, reqPath, timeout = 10000) {
  return new Promise((resolve) => {
    const req = https.get({ host, path: reqPath, headers: { "User-Agent": "magnet-studio/1.0" }, timeout }, (r) => {
      const bufs = [];
      r.on("data", (c) => bufs.push(c));
      r.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(bufs).toString("utf8"))); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function searchCommons(term) {
  const q = encodeURIComponent(term);
  const j = await fetchJson("commons.wikimedia.org",
    `/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url%7Csize%7Cmime&format=json`);
  const pages = (j && j.query && j.query.pages) || {};
  return Object.values(pages)
    .map((p) => (p.imageinfo || [])[0])
    .filter((ii) => ii && /^image\/(jpeg|png|webp)$/.test(ii.mime) && ii.width >= 400 && ii.width <= 8000);
}

// מנסה את החיפוש המלא, ואז מצטמצם למילה-שתיים המרכזיות אם לא נמצאה תמונה — חיפושים ספציפיים מדי
// (למשל "couscous vegetables hummus") נוטים להחזיר מסמכי PDF במקום תמונות.
async function findImage(query) {
  if (!query) return null;
  const words = String(query).trim().split(/\s+/).filter(Boolean);
  const attempts = [words.join(" ") + " food dish", words.slice(0, 2).join(" ") + " food", words[0] + " food"];
  for (const term of [...new Set(attempts)]) {
    const candidates = await searchCommons(term);
    if (candidates.length) {
      const best = candidates[0];
      return { url: best.url.split("?")[0], width: best.width, height: best.height, source: "Wikimedia Commons" };
    }
  }
  return null;
}

function buildPrompt() {
  return [
    "אתה שף שכותב הצעת תפריט יומית קצרה בעברית — מנה עיקרית וקינוח, שניתן להכין בבית בלי ציוד מיוחד.",
    "גוון בין מטבחים (ישראלי, איטלקי, אסייתי, ים-תיכוני וכו') מיום ליום. אל תבחר תמיד באותה מנה.",
    "",
    "כתוב בדיוק בפורמט הזה, שמור את כותרות ה-### כפי שהן:",
    "",
    "### MAIN",
    "name: (שם המנה בעברית)",
    "search: (שם המנה באנגלית, 2-4 מילים, לחיפוש תמונה — למשל: shakshuka, beef bourguignon)",
    "description: (משפט אחד קצר ומפתה)",
    "time: (זמן הכנה משוער, למשל '35 דקות')",
    "servings: (למספר סועדים, למשל '4')",
    "ingredients:",
    "- ...",
    "- ... (6-10 רכיבים עם כמויות)",
    "steps:",
    "1. ...",
    "2. ... (4-7 שלבים ברורים)",
    "",
    "### DESSERT",
    "name: ...",
    "search: ...",
    "description: ...",
    "time: ...",
    "servings: ...",
    "ingredients:",
    "- ...",
    "steps:",
    "1. ..."
  ].join("\n");
}

function parseSections(text) {
  const sec = {};
  const re = /^###\s*([A-Z]+)\s*$/gm;
  let m; const marks = [];
  while ((m = re.exec(text))) marks.push({ name: m[1].trim(), i: m.index, end: re.lastIndex });
  marks.forEach((mk, idx) => {
    sec[mk.name] = text.slice(mk.end, idx + 1 < marks.length ? marks[idx + 1].i : text.length).trim();
  });
  return sec;
}
function field(block, name) {
  const re = new RegExp("^" + name + ":\\s*(.+)$", "im");
  const m = re.exec(block || "");
  return m ? m[1].trim() : "";
}
function listAfter(block, label) {
  const idx = (block || "").search(new RegExp("^" + label + ":\\s*$", "im"));
  if (idx < 0) return [];
  const rest = block.slice(idx).split(/\r?\n/).slice(1);
  const out = [];
  for (const line of rest) {
    const t = line.trim();
    if (!t) continue;
    if (/^[a-z]+:/i.test(t)) break; // תחילת שדה הבא
    out.push(t.replace(/^[-•]\s*/, "").replace(/^\d+[.)]\s*/, ""));
  }
  return out;
}

function parseDish(block) {
  return {
    name: field(block, "name"),
    search: field(block, "search"),
    description: field(block, "description"),
    time: field(block, "time"),
    servings: field(block, "servings"),
    ingredients: listAfter(block, "ingredients"),
    steps: listAfter(block, "steps")
  };
}

async function generate() {
  const { askAI } = require("./dailyNarrative");
  const r = await askAI(buildPrompt(), { sessionTag: "daily-meal", timeout: 60000 });
  if (!r || !r.text) {
    const e = new Error("אין מנוע AI זמין כרגע");
    e.code = "NO_AI";
    throw e;
  }
  const sec = parseSections(r.text);
  const main = parseDish(sec.MAIN || "");
  const dessert = parseDish(sec.DESSERT || "");
  const [mainImg, dessertImg] = await Promise.all([
    findImage(main.search || main.name).catch(() => null),
    findImage(dessert.search || dessert.name).catch(() => null)
  ]);
  main.image = mainImg;
  dessert.image = dessertImg;
  return { main, dessert, source: r.source, generatedAt: new Date().toISOString() };
}

async function getDailyMeal(now = new Date(), refresh = false) {
  const dateKey = now.toISOString().slice(0, 10);
  const cacheFile = path.join(CACHE_DIR, `daily-meal-${dateKey}.json`);
  if (!refresh) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (cached && cached.date === dateKey) return cached;
    } catch { /* אין מטמון להיום */ }
  }
  const meal = await generate();
  const result = { date: dateKey, ...meal };
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 1));
  } catch { /* אי-אפשר לשמור מטמון — עדיין מחזירים תוצאה */ }
  return result;
}

module.exports = { getDailyMeal };
