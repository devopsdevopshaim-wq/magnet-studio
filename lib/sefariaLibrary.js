// lib/sefariaLibrary.js — "ספריית קודש": תנ"ך, סידור תפילה, רש"י/רמב"ם/אור החיים, תלמוד בבלי.
// כל התוכן נמשך חי מ-Sefaria (ציבורי, בלי מפתח) ונשמר במטמון זיכרון קל.
// אותה שיטת ניקוי טקסט וקריאה כמו lib/tehillim.js.

const https = require("https");

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

function fetchJson(path, timeout = 12000) {
  return new Promise((resolve) => {
    const req = https.get({
      host: "www.sefaria.org", path,
      headers: { "User-Agent": "magnet-studio" }, timeout
    }, (r) => {
      const bufs = [];
      r.on("data", (c) => bufs.push(c));
      r.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(bufs).toString("utf8"))); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

const textCache = new Map(); // ref -> {at, data}
const TEXT_TTL = 6 * 3600 * 1000;

async function getText(ref) {
  const key = String(ref || "").trim();
  if (!key) throw new Error("צריך ref");
  const hit = textCache.get(key);
  if (hit && Date.now() - hit.at < TEXT_TTL) return hit.data;

  const j = await fetchJson(`/api/texts/${encodeURIComponent(key)}?context=0&commentary=0&pad=0`);
  if (!j || j.error) throw new Error((j && j.error) || "הטקסט לא נמצא");

  const flatten = (x) => {
    if (Array.isArray(x)) return x.flatMap(flatten);
    return [x];
  };
  const he = flatten(j.he || []).map(cleanVerse).filter(Boolean);
  const en = flatten(j.text || []).map(cleanVerse).filter(Boolean);
  const data = { ref: j.ref || key, heRef: j.heRef || null, he, en, sections: j.sections || null };
  textCache.set(key, { at: Date.now(), data });
  return data;
}

// ---------- תנ"ך ----------
const TANAKH_BOOKS = [
  { en: "Genesis", he: "בראשית", group: "תורה" }, { en: "Exodus", he: "שמות", group: "תורה" },
  { en: "Leviticus", he: "ויקרא", group: "תורה" }, { en: "Numbers", he: "במדבר", group: "תורה" },
  { en: "Deuteronomy", he: "דברים", group: "תורה" },
  { en: "Joshua", he: "יהושע", group: "נביאים" }, { en: "Judges", he: "שופטים", group: "נביאים" },
  { en: "I Samuel", he: "שמואל א", group: "נביאים" }, { en: "II Samuel", he: "שמואל ב", group: "נביאים" },
  { en: "I Kings", he: "מלכים א", group: "נביאים" }, { en: "II Kings", he: "מלכים ב", group: "נביאים" },
  { en: "Isaiah", he: "ישעיהו", group: "נביאים" }, { en: "Jeremiah", he: "ירמיהו", group: "נביאים" },
  { en: "Ezekiel", he: "יחזקאל", group: "נביאים" },
  { en: "Hosea", he: "הושע", group: "תרי עשר" }, { en: "Joel", he: "יואל", group: "תרי עשר" },
  { en: "Amos", he: "עמוס", group: "תרי עשר" }, { en: "Obadiah", he: "עובדיה", group: "תרי עשר" },
  { en: "Jonah", he: "יונה", group: "תרי עשר" }, { en: "Micah", he: "מיכה", group: "תרי עשר" },
  { en: "Nahum", he: "נחום", group: "תרי עשר" }, { en: "Habakkuk", he: "חבקוק", group: "תרי עשר" },
  { en: "Zephaniah", he: "צפניה", group: "תרי עשר" }, { en: "Haggai", he: "חגי", group: "תרי עשר" },
  { en: "Zechariah", he: "זכריה", group: "תרי עשר" }, { en: "Malachi", he: "מלאכי", group: "תרי עשר" },
  { en: "Psalms", he: "תהלים", group: "כתובים" }, { en: "Proverbs", he: "משלי", group: "כתובים" },
  { en: "Job", he: "איוב", group: "כתובים" }, { en: "Song of Songs", he: "שיר השירים", group: "כתובים" },
  { en: "Ruth", he: "רות", group: "כתובים" }, { en: "Lamentations", he: "איכה", group: "כתובים" },
  { en: "Ecclesiastes", he: "קהלת", group: "כתובים" }, { en: "Esther", he: "אסתר", group: "כתובים" },
  { en: "Daniel", he: "דניאל", group: "כתובים" }, { en: "Ezra", he: "עזרא", group: "כתובים" },
  { en: "Nehemiah", he: "נחמיה", group: "כתובים" },
  { en: "I Chronicles", he: "דברי הימים א", group: "כתובים" }, { en: "II Chronicles", he: "דברי הימים ב", group: "כתובים" }
];

// פרשנים שזמינים כ-"<Commentator>_on_<Book>.<Chapter>.<Verse>" — נמשכים לצד פרק מתנ"ך
const COMMENTARIES = [
  { id: "rashi", he: "רש״י", prefix: "Rashi_on_" },
  { id: "orhachaim", he: "אור החיים", prefix: "Or_HaChaim_on_" },
  { id: "ibnezra", he: "אבן עזרא", prefix: "Ibn_Ezra_on_" },
  { id: "ramban", he: "רמב״ן", prefix: "Ramban_on_" }
];

// רמב״ם — משנה תורה, מדור נבחר (רשימה אצורה, לא כל 14 הספרים כדי לשמור פשוט)
const RAMBAM_SECTIONS = [
  { en: "Mishneh Torah, Foundations of the Torah", he: "יסודי התורה" },
  { en: "Mishneh Torah, De'ot", he: "דעות" },
  { en: "Mishneh Torah, Torah Study", he: "תלמוד תורה" },
  { en: "Mishneh Torah, Repentance", he: "תשובה" },
  { en: "Mishneh Torah, Prayer and the Priestly Blessing", he: "תפילה וברכת כהנים" },
  { en: "Mishneh Torah, Sabbath", he: "שבת" },
  { en: "Mishneh Torah, Ethical Conduct", he: "דעות (הלכות מידות)" },
  { en: "Mishneh Torah, Gifts to the Poor", he: "מתנות עניים" },
  { en: "Mishneh Torah, Marriage", he: "אישות" },
  { en: "Mishneh Torah, Kings and Wars", he: "מלכים ומלחמותיהם" }
];

// תלמוד בבלי — מסכתות נפוצות
const TALMUD_TRACTATES = [
  { en: "Berakhot", he: "ברכות" }, { en: "Shabbat", he: "שבת" }, { en: "Eruvin", he: "עירובין" },
  { en: "Pesachim", he: "פסחים" }, { en: "Yoma", he: "יומא" }, { en: "Sukkah", he: "סוכה" },
  { en: "Beitzah", he: "ביצה" }, { en: "Rosh Hashanah", he: "ראש השנה" }, { en: "Taanit", he: "תענית" },
  { en: "Megillah", he: "מגילה" }, { en: "Moed Katan", he: "מועד קטן" }, { en: "Chagigah", he: "חגיגה" },
  { en: "Yevamot", he: "יבמות" }, { en: "Ketubot", he: "כתובות" }, { en: "Nedarim", he: "נדרים" },
  { en: "Gittin", he: "גיטין" }, { en: "Kiddushin", he: "קידושין" },
  { en: "Bava Kamma", he: "בבא קמא" }, { en: "Bava Metzia", he: "בבא מציעא" }, { en: "Bava Batra", he: "בבא בתרא" },
  { en: "Sanhedrin", he: "סנהדרין" }, { en: "Makkot", he: "מכות" }, { en: "Avodah Zarah", he: "עבודה זרה" },
  { en: "Avot", he: "אבות" }
];

// ---------- סידור תפילה — עץ ניווט חי מ-Sefaria (Siddur Ashkenaz) ----------
let siddurTreeCache = null;
async function getSiddurTree() {
  if (siddurTreeCache) return siddurTreeCache;
  const j = await fetchJson(`/api/index/${encodeURIComponent("Siddur Ashkenaz")}`);
  if (!j || !j.schema) { siddurTreeCache = []; return []; }

  function walk(node, pathTitles) {
    const enT = node.title || (node.titles || []).find((x) => x.lang === "en")?.text;
    const heT = node.heTitle || (node.titles || []).find((x) => x.lang === "he")?.text || enT;
    const isRoot = pathTitles.length === 0;
    const full = isRoot ? [enT] : pathTitles.concat(enT ? [enT] : []);
    const kids = (node.nodes || []).map((n) => walk(n, full)).filter(Boolean);
    if (isRoot) return kids; // הצומת השורשי = שם הספר, לא חלק מה-ref
    return { he: heT, ref: full.join(", "), children: kids.length ? kids : null };
  }
  siddurTreeCache = walk(j.schema, []);
  return siddurTreeCache;
}

module.exports = {
  getText, getSiddurTree,
  TANAKH_BOOKS, COMMENTARIES, RAMBAM_SECTIONS, TALMUD_TRACTATES
};
