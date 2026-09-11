// lib/auth.js — שכבת הזדהות אופציונלית לפריסה ציבורית.
//
// מופעלת רק כשמוגדרת סיסמה:
//   • משתנה סביבה  PNKS_AUTH_PASSWORD   (מומלץ לענן — Render/Railway/וכו')
//   • או קובץ      data/auth-config.json  → { "password": "..." }
//
// בלי סיסמה מוגדרת — השכבה שקופה לחלוטין, וההרצה המקומית (localhost) עובדת בדיוק כמו קודם.
// עוגייה חתומה (HMAC), HttpOnly, תקפה 30 יום. אין תלות חיצונית.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CONF = path.join(__dirname, "..", "data", "auth-config.json");
const COOKIE = "pnks_session";
const DAY = 86400000;

function config() {
  const envPw = String(process.env.PNKS_AUTH_PASSWORD || "").trim();
  let filePw = "";
  try { filePw = String((JSON.parse(fs.readFileSync(CONF, "utf8")) || {}).password || "").trim(); } catch { /* אין קובץ */ }
  const password = envPw || filePw;
  return { enabled: password.length >= 4, password };
}

function secret() {
  const { password } = config();
  return crypto.createHash("sha256")
    .update("pnks-auth::" + password + "::" + (process.env.PNKS_AUTH_SECRET || ""))
    .digest();
}

function makeToken(days = 30) {
  const exp = Date.now() + days * DAY;
  const sig = crypto.createHmac("sha256", secret()).update(String(exp)).digest("hex").slice(0, 32);
  return exp + "." + sig;
}
function validToken(tok) {
  if (!tok || tok.indexOf(".") < 0) return false;
  const [exp, sig] = tok.split(".");
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return false;
  const want = crypto.createHmac("sha256", secret()).update(exp).digest("hex").slice(0, 32);
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)); } catch { return false; }
}
function checkPassword(input) {
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
const OPEN = new Set(["/login", "/manifest.webmanifest", "/favicon.ico"]);
function isOpen(p) {
  return OPEN.has(p) || p.startsWith("/api/auth/") || p.startsWith("/icons/");
}

function isAuthed(req) {
  return validToken(parseCookies(req.headers.cookie)[COOKIE]);
}

function gate(req, res, next) {
  if (!config().enabled) return next();
  if (isOpen(req.path) || isAuthed(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "נדרשת התחברות", auth: true });
  return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl || "/"));
}

function setSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
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

module.exports = { config, gate, checkPassword, setSession, clearSession, isAuthed, setPassword };
