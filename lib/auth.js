// lib/auth.js — שכבת הזדהות רב-משתמשית לפריסה ציבורית.
//
// מופעלת רק כשמוגדרת סיסמת בעלים:
//   • משתנה סביבה  PNKS_AUTH_PASSWORD   (מומלץ לענן — Render/Railway/וכו')
//   • או קובץ      auth-config.json ב-PERSIST_DIR (ראו lib/paths.js) → { "password": "..." }
//
// בלי סיסמה מוגדרת — השכבה שקופה לחלוטין, וההרצה המקומית (localhost) עובדת בדיוק כמו קודם.
//
// שני סוגי חשבון:
//   • "owner" — הסיסמה היחידה שהייתה קיימת מאז ומתמיד. נתוניו נשארים ב-PERSIST_DIR הרגיל (בלי הגירה).
//   • משתמש רשום — נוצר דרך /login (הרשמה), ראו lib/users.js. נתוניו בתיקייה פרטית משלו.
//
// עוגייה חתומה (HMAC, מפתח שרת-רחב קבוע — לא תלוי בסיסמה של אף חשבון), HttpOnly, תקפה 30 יום.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./paths");
const users = require("./users");

const CONF = path.join(PERSIST_DIR, "auth-config.json");
const COOKIE = "pnks_session";
const DAY = 86400000;
const OWNER_ID = "owner";

function config() {
  const envPw = String(process.env.PNKS_AUTH_PASSWORD || "").trim();
  let filePw = "";
  try { filePw = String((JSON.parse(fs.readFileSync(CONF, "utf8")) || {}).password || "").trim(); } catch { /* אין קובץ */ }
  const password = envPw || filePw;
  return { enabled: password.length >= 4, password };
}

// מפתח החתימה של העוגייה — קבוע לכל השרת, לא תלוי בסיסמה של אף משתמש (כי יש עכשיו כמה).
//
// חשוב: בלי PNKS_AUTH_SECRET מוגדר בסביבה, אסור ליפול ל-hostname של המכונה — בענן (Docker/Render)
// ה-hostname הוא מזהה הקונטיינר, שמשתנה בכל restart/redeploy. זה היה גורם לכל ה-sessions הפעילים
// להתבטל בבת אחת בכל פעם שהשירות עולה מחדש — בדיוק התופעה של "מתנתק מהאפליקציה בכל הפעלה".
// לכן הנפילה היא לקובץ סוד קבוע ב-PERSIST_DIR (אותו דיסק ששורד redeploy) — נוצר פעם אחת ולא זז.
const SECRET_FILE = path.join(PERSIST_DIR, "auth-secret.txt");
function persistedFallbackSecret() {
  try {
    const s = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (s) return s;
  } catch { /* עדיין לא נוצר */ }
  const s = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, s);
  return s;
}
function secret() {
  return crypto.createHash("sha256")
    .update("pnks-auth-v2::" + (process.env.PNKS_AUTH_SECRET || persistedFallbackSecret()))
    .digest();
}

function makeToken(uid, days = 30) {
  const exp = Date.now() + days * DAY;
  const payload = exp + "." + encodeURIComponent(uid);
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
  return payload + "." + sig;
}
function validToken(tok) {
  if (!tok) return null;
  const parts = String(tok).split(".");
  if (parts.length !== 3) return null;
  const [exp, uid, sig] = parts;
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return null;
  const payload = exp + "." + uid;
  const want = crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null; } catch { return null; }
  return decodeURIComponent(uid);
}

// בדיקת סיסמת הבעלים בלבד (התחברות עם שם ריק)
function checkOwnerPassword(input) {
  const { password } = config();
  if (!password) return false;
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

// נתיבים שנשארים פתוחים גם כשההזדהות פעילה (מסך התחברות ומשאביו)
const OPEN = new Set(["/login", "/manifest.webmanifest", "/favicon.ico", "/sw.js", "/.well-known/assetlinks.json", "/app/download"]);
function isOpen(p) {
  return OPEN.has(p) || p.startsWith("/api/auth/") || p.startsWith("/icons/") || p.startsWith("/.well-known/");
}

// מזהה המשתמש המחובר כרגע — "owner" / מזהה משתמש רשום / null אם לא מחובר
function currentUserId(req) {
  return validToken(parseCookies(req.headers.cookie)[COOKIE]);
}
function isAuthed(req) {
  return !!currentUserId(req);
}
// אובייקט {id, name} של המשתמש המחובר — לשימוש ב-UI ובתיוג אנליטיקס
function currentUser(req) {
  const uid = currentUserId(req);
  if (!uid) return null;
  if (uid === OWNER_ID) return { id: OWNER_ID, name: "חיים קריספין" };
  return users.getUser(uid) || null;
}

function gate(req, res, next) {
  if (!config().enabled) return next();
  if (isOpen(req.path) || isAuthed(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "נדרשת התחברות", auth: true });
  return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl || "/"));
}

function setSession(res, uid) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${makeToken(uid || OWNER_ID)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
}
function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function setPassword(pw) {
  pw = String(pw || "").trim();
  if (!pw) return config(); // ריק = לא לשנות
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONF, "utf8")) || {}; } catch { /* חדש */ }
  cfg.password = pw;
  fs.mkdirSync(path.dirname(CONF), { recursive: true });
  fs.writeFileSync(CONF, JSON.stringify(cfg, null, 2));
  return config();
}

// התחברות: שם ריק (או "owner") + סיסמת הבעלים → owner. אחרת שם+סיסמה מול מרשם המשתמשים.
function login(name, password) {
  const n = String(name || "").trim();
  if (!n || n.toLowerCase() === OWNER_ID) {
    if (checkOwnerPassword(password)) return { id: OWNER_ID, name: "חיים קריספין" };
    return null;
  }
  return users.login(n, password);
}

// טוקן ביקור גס לצרכי אנליטיקס בלבד (לא אימות) — מזהה המשתמש עצמו, אם מחובר
function visitorToken(req) {
  return currentUserId(req);
}

module.exports = {
  config, gate, setSession, clearSession, isAuthed, setPassword, visitorToken,
  login, currentUser, currentUserId, OWNER_ID
};
