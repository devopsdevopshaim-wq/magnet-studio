// lib/users.js — ניהול תיקיות נתונים פר-חשבון (data/persist/users/<id>/...) בלבד.
// זהות/הרשמה/התחברות עברו ל-lib/accounts.js (Postgres, מייל+סיסמה). הקובץ הזה רק ממפה
// מזהה חשבון (עכשיו UUID מ-Postgres, בעבר slug מבוסס-שם) לתיקיית הנתונים הפרטית שלו.

const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./paths");

const USERS_DIR = path.join(PERSIST_DIR, "users");

// מחיקה רקורסיבית ידנית (readdir+unlink+rmdir) — עוקפת תקלה ספציפית בווינדוס שבה
// fs.rmSync({recursive:true}) "מצליח" בשקט (לא זורק) בלי בפועל למחוק תיקייה עם שם בעברית.
function removeDirRecursive(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) removeDirRecursive(p);
    else { try { fs.unlinkSync(p); } catch {} }
  }
  try { fs.rmdirSync(dir); } catch {}
}

// תיקיית הנתונים הפרטית של חשבון — data/persist/users/<id>/...
function userDir(id) {
  const dir = path.join(USERS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// מחיקת כל הנתונים הפרטיים של חשבון (עסק, AIA, וואטסאפ וכו'). בלתי הפיך.
// מחיקת רשומת החשבון עצמה (מייל/סיסמה) היא ב-lib/accounts.js — זה רק מוחק את הקבצים.
function deleteUserData(id) {
  removeDirRecursive(path.join(USERS_DIR, id));
  return { ok: true };
}

function listUserDirs() {
  try { return fs.readdirSync(USERS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch { return []; }
}

module.exports = { userDir, deleteUserData, listUserDirs };
