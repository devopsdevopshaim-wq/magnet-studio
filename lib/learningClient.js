// לימוד יומי דרך Sefaria API (https://www.sefaria.org).
//  - לוח הלימוד היומי: פרשה, הפטרה, משנה יומית, דף יומי, תניא יומי (קבלה), הלכה יומית, 929
//  - טקסט מלא (עברית + אנגלית) לפריטים נבחרים
// הכל best-effort: אם Sefaria לא נגיש -> { available:false } בלי לזרוק.

const https = require("https");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const HOST = "www.sefaria.org";

function getJson(pathname, { timeout = 9000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: HOST, path: pathname, method: "GET", headers: { Accept: "application/json", "User-Agent": "magnet-studio/1.0" }, timeout },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Sefaria ${res.statusCode}`));
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error("Sefaria: תשובה לא תקינה"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Sefaria timeout")));
    req.on("error", reject);
    req.end();
  });
}

function flatten(x) {
  if (x == null) return "";
  if (Array.isArray(x)) return x.map(flatten).join(" ");
  return String(x);
}

function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(ref, maxChars = 700) {
  try {
    const enc = encodeURIComponent(ref.replace(/ /g, "_"));
    const data = await getJson(`/api/texts/${enc}?context=0&commentary=0&pad=0`);
    const he = stripHtml(flatten(data.he));
    const en = stripHtml(flatten(data.text));
    const trunc = (s) => (s.length > maxChars ? s.slice(0, maxChars).replace(/\s\S*$/, "") + "…" : s);
    return { he: trunc(he), en: trunc(en), ref: data.ref || ref };
  } catch {
    return null;
  }
}

// מיפוי הכותרות ב-Sefaria לשמות עבריים ולמפתחות שלנו
const WANTED = {
  "Parashat Hashavua": { key: "parasha", he: "פרשת השבוע" },
  Haftarah: { key: "haftarah", he: "הפטרה" },
  "Daily Mishnah": { key: "mishnah", he: "משנה יומית", withText: true },
  "Daf Yomi": { key: "dafYomi", he: "דף יומי" },
  "Tanya Yomi": { key: "tanya", he: "תניא יומי (קבלה וחסידות)", withText: true },
  "Halakhah Yomit": { key: "halacha", he: "הלכה יומית", withText: true },
  "929": { key: "929", he: 'תנ"ך 929' },
  "Chok LeYisrael": { key: "chok", he: "חוק לישראל" }
};

async function getDailyLearning(date = new Date()) {
  const dateKey = date.toISOString().slice(0, 10);
  const cacheFile = path.join(DATA_DIR, `learning-${dateKey}.json`);
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (cached && cached.date === dateKey) return cached;
  } catch {
    /* אין מטמון */
  }

  let cal;
  try {
    cal = await getJson(`/api/calendars?diaspora=0`);
  } catch (err) {
    return { available: false, error: err.message };
  }

  const items = {};
  const textJobs = [];
  for (const it of cal.calendar_items || []) {
    const title = it.title?.en;
    const map = WANTED[title];
    if (!map) continue;
    const entry = {
      title: map.he,
      ref: it.ref || null,
      displayHe: it.displayValue?.he || "",
      displayEn: it.displayValue?.en || "",
      url: it.url ? `https://www.sefaria.org/${it.url}` : it.ref ? `https://www.sefaria.org/${encodeURIComponent(it.ref.replace(/ /g, "_"))}` : null
    };
    items[map.key] = entry;
    if (map.withText && it.ref) {
      textJobs.push(
        fetchText(it.ref).then((t) => {
          if (t) entry.text = t;
        })
      );
    }
  }

  await Promise.allSettled(textJobs);

  const result = { available: true, date: dateKey, generatedAt: new Date().toISOString(), items };
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), "utf8");
    cleanupOld();
  } catch {
    /* מטמון הוא נוחות */
  }
  return result;
}

function cleanupOld() {
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => /^learning-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const f of files.slice(0, -5)) fs.unlinkSync(path.join(DATA_DIR, f));
  } catch {
    /* bonus */
  }
}

// עליית היום בפרשה: יום ראשון=עלייה 1 ... שבת=עלייה 7
const ALIYAH_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי"];
function aliyahOfToday(date = new Date()) {
  const dow = date.getDay(); // 0=ראשון .. 6=שבת
  return { number: dow + 1, name: ALIYAH_NAMES[dow] };
}

module.exports = { getDailyLearning, aliyahOfToday };
