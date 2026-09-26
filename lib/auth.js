// lib/auth.js — שכבת הזדהות רב-משתמשית לפריסה ציבורית.
//
// שני מנגנונים נפרדים, לא תלויים זה בזה:
//   1) שער-סיסמה כללי לכל האתר (config/gate) — מופעל רק כשמוגדרת סיסמה:
//        • משתנה סביבה  PNKS_AUTH_PASSWORD   (מומלץ לענן — Render/Railway/וכו')
//        • או קובץ      auth-config.json ב-PERSIST_DIR → { "password": "..." }
//      בלי סיסמה מוגדרת — השכבה שקופה לחלוטין, וההרצה המקומית (localhost) עובדת בלי חסימה.
//   2) זהות חשבון אישית (login/currentUser) — כל חשבון נרשם עם מייל+סיסמה משלו מול Postgres
//      (ראו lib/accounts.js). "אדמין" נקבע אוטומטית לפי ADMIN_EMAIL (משתנה סביבה, לא בקוד).
//
// עוגייה חתומה (HMAC, מפתח שרת-רחב קבוע — לא תלוי בסיסמה של אף חשבון), HttpOnly, תקפה 30 יום.
// פרטי החשבון (id/email/name/is_admin) חתומים ומוטמעים בטוקן עצמו — כך אימות בקשה הוא סנכרוני
// (בלי query ל-DB בכל בקשה); הם מתעדכנים מול המסד בכל התחברות מחדש.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./paths");
const accounts = require("./accounts");

const CONF = path.join(PERSIST_DIR, "auth-config.json");
const COOKIE = "pnks_session";
const DAY = 86400000;

function config() {
  const envPw = String(process.env.PNKS_AUTH_PASSWORD || "").trim();
  let filePw = "";
  try { filePw = String((JSON.parse(fs.readFileSync(CONF, "utf8")) || {}).password || "").trim(); } catch { /* אין קובץ */ }
  const password = envPw || filePw;
  return { enabled: password.length >= 4, password };
}

// מפתח החתימה של העוגייה — קבוע לכל השרת, לא תלוי בסיסמה של אף משתמש.
//
// חשוב: בלי PNKS_AUTH_SECRET מוגדר בסביבה, אסור ליפול ל-hostname של המכונה — בענן (Docker/Render)
// ה-hostname הוא מזהה הקונטיינר, שמשתנה בכל restart/redeploy. לכן הנפילה היא לקובץ סוד קבוע
// ב-PERSIST_DIR (אותו דיסק ששורד redeploy) — נוצר פעם אחת ולא זז.
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
    .update("pnks-auth-v3::" + (process.env.PNKS_AUTH_SECRET || persistedFallbackSecret()))
    .digest();
}

function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}
function b64urlDecode(str) {
  try { return JSON.parse(Buffer.from(str, "base64url").toString("utf8")); } catch { return null; }
}

// user: {id,email,name,is_admin} — נחתם ומוטמע בשלמותו בטוקן
function makeToken(user, days = 30) {
  const exp = Date.now() + days * DAY;
  const payload = exp + "." + b64urlEncode(user);
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
  return payload + "." + sig;
}
function validToken(tok) {
  if (!tok) return null;
  const parts = String(tok).split(".");
  if (parts.length !== 3) return null;
  const [exp, userB64, sig] = parts;
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return null;
  const payload = exp + "." + userB64;
  const want = crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null; } catch { return null; }
  return b64urlDecode(userB64);
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

// אובייקט {id,email,name,is_admin} של המשתמש המחובר, ישירות מהטוקן — סנכרוני, בלי DB.
function currentUser(req) {
  return validToken(parseCookies(req.headers.cookie)[COOKIE]);
}
function currentUserId(req) {
  return currentUser(req)?.id || null;
}
function isAuthed(req) {
  return !!currentUser(req);
}

function gate(req, res, next) {
  if (!config().enabled) return next();
  if (isOpen(req.path) || isAuthed(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "נדרשת התחברות", auth: true });
  return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl || "/"));
}

function setSession(res, user) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${makeToken(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
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

// התחברות אמיתית מול Postgres (lib/accounts.js) — מייל+סיסמה. מחזיר {ok, user} / {ok:false, error} /
// {ok:false, blocked:true} אם החשבון מושעה, / {ok:false, limited:true} אם חסום זמנית (ניסיונות רבים מדי).
async function login(email, password, ip) {
  if (await accounts.isRateLimited(email)) {
    return { ok: false, limited: true, error: `יותר מדי ניסיונות כושלים — נסו שוב בעוד כמה דקות (הגבלה: ${accounts.MAX_FAILED_ATTEMPTS} ניסיונות ב-${accounts.WINDOW_MINUTES} דקות).` };
  }
  const result = await accounts.login(email, password);
  await accounts.recordLoginAttempt(email, ip, !!(result && !result.blocked));
  if (!result) return { ok: false, error: "מייל או סיסמה שגויים" };
  if (result.blocked) return { ok: false, blocked: true, error: "החשבון הזה מושעה — פנו למנהל המערכת." };
  return { ok: true, user: result };
}

module.exports = {
  config, gate, setSession, clearSession, isAuthed, setPassword,
  login, currentUser, currentUserId, visitorToken: currentUserId
};
