// lib/accounts.js — חשבונות מבוססי-מייל ב-Postgres (מחליף את lib/users.js הישן שהיה מבוסס
// שם+קובץ JSON). סיסמה מגובבת (scrypt) + salt, לעולם לא בטקסט גלוי — אותה שיטה שהייתה בשימוש
// קודם, רק שהאחסון עבר מקובץ למסד נתונים.
//
// "אדמין" נקבע אוטומטית: כל חשבון שהמייל שלו תואם ל-ADMIN_EMAIL (משתנה סביבה, לא בקוד) מקבל
// is_admin=true בכל התחברות/הרשמה - כך שאם ADMIN_EMAIL משתנה, מספיק להתחבר מחדש.

const crypto = require("crypto");
const db = require("./db");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(pw, salt, wantHash) {
  const { hash } = hashPassword(pw, salt);
  try { return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(wantHash)); } catch { return false; }
}
function isAdminEmail(email) {
  const admin = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return !!admin && String(email || "").trim().toLowerCase() === admin;
}
function publicShape(row) {
  return {
    id: row.id, email: row.email, name: row.name,
    is_admin: row.is_admin, account_status: row.account_status,
    created_at: row.created_at, last_login_at: row.last_login_at
  };
}

async function register(email, password, name) {
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");
  name = String(name || "").trim() || email.split("@")[0];
  if (!EMAIL_RE.test(email)) throw new Error("כתובת מייל לא תקינה");
  if (password.length < 8) throw new Error("סיסמה קצרה מדי — לפחות 8 תווים");

  const existing = await db.query("SELECT id FROM accounts WHERE email = $1", [email]);
  if (existing.rows.length) throw new Error("כתובת המייל הזאת כבר רשומה");

  const { salt, hash } = hashPassword(password);
  const admin = isAdminEmail(email);
  const r = await db.query(
    `INSERT INTO accounts (email, name, password_hash, password_salt, is_admin, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id, email, name, is_admin, account_status, created_at, last_login_at`,
    [email, name, hash, salt, admin]
  );
  return publicShape(r.rows[0]);
}

async function login(email, password) {
  email = String(email || "").trim().toLowerCase();
  const r = await db.query("SELECT * FROM accounts WHERE email = $1", [email]);
  const row = r.rows[0];
  if (!row) return null;
  if (!verifyPassword(password, row.password_salt, row.password_hash)) return null;
  if (row.account_status !== "active") return { blocked: true, account_status: row.account_status };

  const admin = isAdminEmail(email);
  const upd = await db.query(
    `UPDATE accounts SET last_login_at = now(), is_admin = $2 WHERE id = $1
     RETURNING id, email, name, is_admin, account_status, created_at, last_login_at`,
    [row.id, admin]
  );
  return publicShape(upd.rows[0]);
}

async function getAccount(id) {
  const r = await db.query(
    "SELECT id, email, name, is_admin, account_status, created_at, last_login_at FROM accounts WHERE id = $1",
    [id]
  );
  return r.rows[0] ? publicShape(r.rows[0]) : null;
}

async function listAccounts() {
  const r = await db.query(
    "SELECT id, email, name, is_admin, account_status, created_at, last_login_at FROM accounts ORDER BY created_at DESC"
  );
  return r.rows.map(publicShape);
}

async function setAccountStatus(id, status) {
  const allowed = new Set(["active", "suspended", "trial"]);
  if (!allowed.has(status)) throw new Error("סטטוס לא מוכר");
  const r = await db.query(
    "UPDATE accounts SET account_status = $2 WHERE id = $1 RETURNING id, account_status",
    [id, status]
  );
  if (!r.rows.length) throw new Error("חשבון לא נמצא");
  return r.rows[0];
}

async function deleteAccount(id) {
  const r = await db.query("DELETE FROM accounts WHERE id = $1 RETURNING id", [id]);
  if (!r.rows.length) throw new Error("חשבון לא נמצא");
  return { ok: true };
}

// ---------- הגבלת ניסיונות התחברות ----------

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

async function recordLoginAttempt(email, ip, success) {
  await db.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)", [
    String(email || "").trim().toLowerCase(), ip || null, !!success
  ]);
}

async function isRateLimited(email) {
  const r = await db.query(
    `SELECT count(*) FROM login_attempts
     WHERE email = $1 AND success = false AND occurred_at > now() - interval '${WINDOW_MINUTES} minutes'`,
    [String(email || "").trim().toLowerCase()]
  );
  return Number(r.rows[0].count) >= MAX_FAILED_ATTEMPTS;
}

// ---------- מעקב שימוש (אילו לשוניות, מתי) ----------

async function trackUsage(accountId, tab) {
  if (!accountId || !tab) return;
  try { await db.query("INSERT INTO usage_events (account_id, tab) VALUES ($1, $2)", [accountId, tab]); }
  catch { /* לא קריטי - לא נופלים בגלל תיעוד */ }
}

async function usageSummary(accountId) {
  const [tabs, count, last] = await Promise.all([
    db.query(
      `SELECT tab, count(*) AS visits, max(occurred_at) AS last_at FROM usage_events
       WHERE account_id = $1 GROUP BY tab ORDER BY visits DESC`,
      [accountId]
    ),
    db.query("SELECT count(*) FROM usage_events WHERE account_id = $1", [accountId]),
    db.query("SELECT max(occurred_at) AS last_at FROM usage_events WHERE account_id = $1", [accountId])
  ]);
  return {
    tabs: tabs.rows.map((r) => ({ tab: r.tab, visits: Number(r.visits), lastAt: r.last_at })),
    totalEvents: Number(count.rows[0].count),
    lastActivity: last.rows[0].last_at
  };
}

module.exports = {
  register, login, getAccount, listAccounts, setAccountStatus, deleteAccount,
  recordLoginAttempt, isRateLimited, trackUsage, usageSummary, isAdminEmail,
  MAX_FAILED_ATTEMPTS, WINDOW_MINUTES
};
