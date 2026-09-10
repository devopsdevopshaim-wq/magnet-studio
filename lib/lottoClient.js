// הגרלת לוטו קרובה (מפעל הפיס). מקור: קובץ ה-CSV הרשמי של כל תוצאות הלוטו.
//  - ההגרלה האחרונה + ההגרלה הקרובה (יום ג' / שבת)
//  - מספרים חמים/קרים לפי שכיחות ב-100 ההגרלות האחרונות
//  - 3 טורים בבחירה משוקללת לפי שכיחות (שיטת lotto-agents.html)
//
// חשוב: זו לא תחזית. כל צירוף חוקי שווה בהסתברות. משחקים באחריות ובתקציב קבוע.

const https = require("https");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CSV_URL = "https://www.pais.co.il/lotto/lotto_resultsdownload.aspx";

const MAIN_MIN = 1;
const MAIN_MAX = 37;
const STRONG_MIN = 1;
const STRONG_MAX = 7;
const DRAW_DAYS = [2, 6]; // יום שלישי, שבת

function fetchCsv(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: "www.pais.co.il", path: "/lotto/lotto_resultsdownload.aspx", method: "GET", headers: { "User-Agent": "Mozilla/5.0" }, timeout },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`פיס ${res.statusCode}`));
          resolve(Buffer.concat(chunks).toString("latin1")); // רק העמודות המספריות חשובות - ASCII
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("פיס timeout")));
    req.on("error", reject);
    req.end();
  });
}

function parseDraws(csv) {
  const rows = csv.split(/\r?\n/).slice(1);
  const draws = [];
  for (const line of rows) {
    const f = line.split(",");
    if (f.length < 9) continue;
    const id = parseInt(f[0], 10);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((f[1] || "").trim());
    if (!Number.isFinite(id) || !m) continue;
    const date = new Date(+m[3], +m[2] - 1, +m[1]);
    const nums = f.slice(2, 8).map((x) => parseInt(x, 10));
    const strong = parseInt(f[8], 10);
    if (nums.some((n) => !Number.isFinite(n) || n < 1 || n > 45)) continue;
    draws.push({ id, date, nums, strong: Number.isFinite(strong) ? strong : null });
  }
  draws.sort((a, b) => b.date - a.date);
  return draws;
}

function nextDrawDate(after, now = new Date()) {
  // ההגרלה הקרובה = יום הגרלה הבא (ג'/שבת) שהוא גם אחרי ההגרלה האחרונה וגם מהיום והלאה
  const start = new Date(Math.max(after.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()));
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (DRAW_DAYS.includes(d.getDay())) return new Date(d);
  }
  return d;
}

function frequency(draws, poolMax, key) {
  const freq = new Array(poolMax + 1).fill(0);
  for (const d of draws) {
    const vals = key === "strong" ? [d.strong] : d.nums;
    for (const v of vals) if (Number.isFinite(v) && v >= 1 && v <= poolMax) freq[v]++;
  }
  return freq;
}

// שכיחות עם דעיכה מעריכית — הגרלות אחרונות משפיעות יותר
function recencyWeighted(draws, poolMax, key, halfLife = 40) {
  const w = new Array(poolMax + 1).fill(0);
  draws.forEach((d, i) => {
    const decay = Math.pow(0.5, i / halfLife);
    const vals = key === "strong" ? [d.strong] : d.nums;
    for (const v of vals) if (Number.isFinite(v) && v >= 1 && v <= poolMax) w[v] += decay;
  });
  return w;
}

// כמה הגרלות עברו מאז שמספר הופיע לאחרונה (overdue)
function gaps(draws, poolMax, key) {
  const g = new Array(poolMax + 1).fill(draws.length);
  for (let i = 0; i < draws.length; i++) {
    const vals = key === "strong" ? [draws[i].strong] : draws[i].nums;
    for (const v of vals) if (Number.isFinite(v) && v >= 1 && v <= poolMax && g[v] === draws.length) g[v] = i;
  }
  return g;
}

// מטריצת הופעה-משותפת של זוגות
function pairMatrix(draws, poolMax) {
  const m = Array.from({ length: poolMax + 1 }, () => new Array(poolMax + 1).fill(0));
  for (const d of draws) {
    for (let a = 0; a < d.nums.length; a++) {
      for (let b = a + 1; b < d.nums.length; b++) {
        const x = d.nums[a], y = d.nums[b];
        if (x >= 1 && x <= poolMax && y >= 1 && y <= poolMax) { m[x][y]++; m[y][x]++; }
      }
    }
  }
  return m;
}

const norm = (arr) => { const mx = Math.max(...arr, 1); return arr.map((v) => v / mx); };

// ציון מורכב לכל מספר: שכיחות + עדכניות + overdue מתון
function compositeWeights(draws, poolMax, key) {
  const f = norm(frequency(draws, poolMax, key));
  const r = norm(recencyWeighted(draws, poolMax, key, key === "strong" ? 20 : 40));
  const gp = gaps(draws, poolMax, key);
  const gMax = Math.max(...gp.slice(1), 1);
  const overdue = gp.map((v) => v / gMax); // 0..1, גבוה = מזמן לא הופיע
  const out = new Array(poolMax + 1).fill(0);
  for (let n = 1; n <= poolMax; n++) {
    out[n] = 0.45 * f[n] + 0.4 * r[n] + 0.15 * overdue[n];
  }
  return out;
}

// mulberry32 - RNG דטרמיניסטי לפי seed (התאריך), כדי שאותו יום יראה אותם טורים
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(weights, count, rng, min = 1) {
  const items = weights.map((w, i) => ({ n: i, w: w + 1 })).filter((x) => x.n >= min);
  const chosen = [];
  while (chosen.length < count && items.length) {
    const total = items.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    let idx = 0;
    while (r > items[idx].w) {
      r -= items[idx].w;
      idx++;
    }
    chosen.push(items[idx].n);
    items.splice(idx, 1);
  }
  return chosen.sort((a, b) => a - b);
}

function suggestLines(weights, strongW, dateKey, lines = 3) {
  const seed = parseInt(dateKey.replace(/-/g, ""), 10);
  const out = [];
  for (let i = 0; i < lines; i++) {
    const rng = seededRng(seed + i * 7919);
    const nums = weightedPick(weights.slice(0, MAIN_MAX + 1), 6, rng, MAIN_MIN);
    const strong = weightedPick(strongW.slice(0, STRONG_MAX + 1), 1, rng, STRONG_MIN)[0];
    out.push({ nums, strong });
  }
  return out;
}

// הטור ה"מדויק" — 6 המספרים בעלי הציון המורכב הגבוה + החזק הגבוה. דטרמיניסטי, לא אקראי.
function primaryLine(weights, strongW) {
  const top = weights.map((w, n) => ({ n, w })).slice(1).sort((a, b) => b.w - a.w).slice(0, 6).map((x) => x.n).sort((a, b) => a - b);
  const strong = strongW.map((w, n) => ({ n, w })).slice(1).sort((a, b) => b.w - a.w)[0].n;
  return { nums: top, strong };
}

// טור מורכב (system bet) של k מספרים: k המספרים בעלי הציון הגבוה, עם הטיה קלה לזוגות שמופיעים יחד.
function systemBet(weights, strongW, pairs, k) {
  const ranked = weights.map((w, n) => ({ n, w })).slice(1).sort((a, b) => b.w - a.w);
  const picked = ranked.slice(0, Math.min(k, ranked.length)).map((x) => x.n);
  // שיפור זוגי: מחליף את המספר החלש ביותר במועמד עם אפיניות זוגית גבוהה לשאר, אם קיים
  if (picked.length === k && ranked.length > k) {
    const pool = ranked.slice(k, k + 6).map((x) => x.n);
    let bestSwap = null, bestGain = 0;
    for (const cand of pool) {
      const affinity = picked.reduce((s, p) => s + (pairs[cand]?.[p] || 0), 0);
      const worst = picked[picked.length - 1];
      const worstAff = picked.slice(0, -1).reduce((s, p) => s + (pairs[worst]?.[p] || 0), 0);
      if (affinity - worstAff > bestGain) { bestGain = affinity - worstAff; bestSwap = cand; }
    }
    if (bestSwap) { picked[picked.length - 1] = bestSwap; }
  }
  const strong = strongW.map((w, n) => ({ n, w })).slice(1).sort((a, b) => b.w - a.w)[0].n;
  return { k, nums: picked.sort((a, b) => a - b), strong, combos: comb(k, 6) };
}
function comb(n, r) { let x = 1; for (let i = 0; i < r; i++) x = x * (n - i) / (i + 1); return Math.round(x); }

function hotCold(freq, min, max, n = 6) {
  const arr = [];
  for (let i = min; i <= max; i++) arr.push({ n: i, count: freq[i] || 0 });
  arr.sort((a, b) => b.count - a.count);
  return { hot: arr.slice(0, n).map((x) => x.n), cold: arr.slice(-n).map((x) => x.n).reverse() };
}

const fmtDate = (d) => d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function getLotto(now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  const cacheFile = path.join(DATA_DIR, `lotto-${dateKey}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (c && c.date === dateKey) return c;
  } catch {
    /* אין מטמון */
  }

  let draws;
  try {
    draws = parseDraws(await fetchCsv());
  } catch (err) {
    return { available: false, error: err.message };
  }
  if (!draws.length) return { available: false, error: "לא הצלחתי לפרסר את תוצאות הפיס" };

  const last = draws[0];
  const recent = draws.slice(0, 150);
  const mainFreq = frequency(recent, MAIN_MAX, "main");
  const strongFreq = frequency(recent, STRONG_MAX, "strong");
  const mainW = compositeWeights(recent, MAIN_MAX, "main");
  const strongW = compositeWeights(recent, STRONG_MAX, "strong");
  const pairs = pairMatrix(recent, MAIN_MAX);

  const nd = nextDrawDate(last.date, now);
  const result = {
    available: true,
    date: dateKey,
    generatedAt: new Date().toISOString(),
    lastDraw: {
      id: last.id,
      date: localISO(last.date),
      dateHe: fmtDate(last.date),
      numbers: last.nums,
      strong: last.strong
    },
    nextDraw: {
      id: last.id + 1,
      date: localISO(nd),
      dateHe: fmtDate(nd),
      approxTime: "22:00",
      daysAway: Math.round((new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
    },
    frequencyWindow: recent.length,
    hotCold: {
      main: hotCold(mainFreq, MAIN_MIN, MAIN_MAX),
      strong: hotCold(strongFreq, STRONG_MIN, STRONG_MAX, 3)
    },
    primary: primaryLine(mainW, strongW),
    suggestions: suggestLines(mainW, strongW, dateKey),
    systemBets: {
      "8": systemBet(mainW, strongW, pairs, 8),
      "9": systemBet(mainW, strongW, pairs, 9),
      "10": systemBet(mainW, strongW, pairs, 10)
    },
    method: "ציון מורכב: שכיחות (45%) · עדכניות בדעיכה מעריכית (40%) · overdue (15%); טורים מורכבים עם הטיה זוגית.",
    disclaimer: "לא תחזית. כל צירוף חוקי שווה בהסתברות. הבחירה משוקללת לפי היסטוריה בלבד — אין לה יתרון סטטיסטי אמיתי. משחקים באחריות ובתקציב קבוע."
  };

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), "utf8");
    for (const f of fs.readdirSync(DATA_DIR).filter((x) => /^lotto-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().slice(0, -5)) {
      fs.unlinkSync(path.join(DATA_DIR, f));
    }
  } catch {
    /* מטמון = נוחות */
  }
  return result;
}

module.exports = { getLotto };
