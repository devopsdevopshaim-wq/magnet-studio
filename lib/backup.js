// ייצוא/ייבוא גיבוי — להעברת ההגדרות האישיות בין מחשבים (המערכת היא מקומית, אין ענן).
// מגבים רק מצב אישי שלא נוצר-מחדש אוטומטית. לא כולל:
//   • סודות / מפתחות API (הם ב-process.env בלבד, לעולם לא בקובץ)
//   • מטמוני יום (daily-brief-*, learning-*, lotto-*, astro-natal-cache) — נבנים מחדש
//   • מסד הדיור (DiraFinder) — מערכת נפרדת עם ה-seed שלה

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

// allowlist — בדיוק מה שנכנס לגיבוי
const BACKUP_FILES = [
  "user-config.json",   // שורש תיקיית העיצובים + תוכנות הפעלה מהירה (נתיבים — נקודת פתיחה למחשב חדש)
  "astro-config.json",  // תאריך/שעת/עיר לידה — לא ניתן לשחזור
  "jarvis-config.json", // יעד n8n (מקומי/ענן) + webhook
  "ambient-tracks.json" // רשימת מוזיקת הרקע (אם הותאמה אישית)
];

// קבצים שנעים איתם כי הם עוזרים למחשב חדש לעלות "מלא" מיד — אך לא קריטיים
const SOFT_FILES = ["email-status.json", "calendar-status.json", "n8n-inbox.json"];

function readJsonRaw(name) {
  try {
    const txt = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
    return { text: txt, json: JSON.parse(txt) };
  } catch {
    return null;
  }
}

function exportAll() {
  const files = {};
  for (const name of [...BACKUP_FILES, ...SOFT_FILES]) {
    const r = readJsonRaw(name);
    if (r) files[name] = r.json;
  }
  return {
    magnetStudioBackup: true,
    version: 1,
    exportedAt: new Date().toISOString(),
    hostname: require("os").hostname(),
    note: "גיבוי הגדרות אישי של הפנקס היומי. לא כולל סודות/מפתחות. לייבוא: מסך הגדרות → ייבוא גיבוי.",
    files
  };
}

function importAll(bundle) {
  if (!bundle || bundle.magnetStudioBackup !== true || typeof bundle.files !== "object") {
    return { ok: false, error: "קובץ לא תקין — צריך קובץ גיבוי של הפנקס היומי." };
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const allowed = new Set([...BACKUP_FILES, ...SOFT_FILES]);
  const restored = [];
  const skipped = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const [name, content] of Object.entries(bundle.files)) {
    if (!allowed.has(name) || name.includes("/") || name.includes("\\") || name.includes("..")) {
      skipped.push({ name, reason: "לא ברשימת הגיבוי" });
      continue;
    }
    const dest = path.join(DATA_DIR, name);
    try {
      // גיבוי הקובץ הקיים לפני דריסה
      if (fs.existsSync(dest)) {
        fs.copyFileSync(dest, path.join(DATA_DIR, `${name}.pre-import-${stamp}.bak`));
      }
      fs.writeFileSync(dest, JSON.stringify(content, null, 2), "utf8");
      restored.push(name);
    } catch (e) {
      skipped.push({ name, reason: e.message });
    }
  }

  return {
    ok: restored.length > 0,
    restored,
    skipped,
    hint: restored.length ? "הפעל מחדש את השרת כדי שכל ההגדרות ייכנסו לתוקף." : "לא שוחזר דבר."
  };
}

module.exports = { exportAll, importAll, BACKUP_FILES, SOFT_FILES };
