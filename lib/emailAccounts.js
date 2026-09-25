// lib/emailAccounts.js — חיבור תיבת מייל אישית לכל חשבון (לא רק לבעלים) דרך IMAP.
// כל משתמש רשום יכול להזין את כתובת המייל שלו + סיסמה (או "סיסמת אפליקציה" — ראו הערה למטה)
// ולקבל את תיבת הדואר שלו-עצמו בתוך האתר, בלי תלות בחיבור Maton/Outlook המשותף של הבעלים.
//
// אבטחה: הסיסמה לעולם לא נשמרת בטקסט גלוי — מוצפנת (AES-256-GCM) עם מפתח שנוצר פעם אחת
// ונשמר ב-PERSIST_DIR (אותו דיסק קבוע שכבר הוכח שורד redeploy לאורך כל הפרויקט הזה), נפרד
// לגמרי ממפתח החתימה של ה-session (הפרדת תפקידים בין מפתחות).
//
// הערה חשובה שמוצגת גם למשתמש: Gmail/Outlook/Yahoo חוסמים כניסת IMAP עם הסיסמה הרגילה
// (מטעמי אבטחה) — צריך "סיסמת אפליקציה" ייעודית שנוצרת בהגדרות האבטחה של החשבון.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ImapFlow } = require("imapflow");
const nodemailer = require("nodemailer");
const { PERSIST_DIR } = require("./paths");

const KEY_FILE = path.join(PERSIST_DIR, "email-crypto-key.txt");
function cryptoKey() {
  try {
    const hex = fs.readFileSync(KEY_FILE, "utf8").trim();
    if (hex.length === 64) return Buffer.from(hex, "hex");
  } catch { /* עדיין לא נוצר */ }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, key.toString("hex"));
  return key;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}
function decrypt(packed) {
  const [ivHex, tagHex, dataHex] = String(packed || "").split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("נתון מוצפן פגום");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cryptoKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

// ---------- הגדרות ספק ידועות (host/port) — מזהים אוטומטית לפי הדומיין של הכתובת ----------
const KNOWN_PROVIDERS = [
  { test: /@gmail\.com$/i, host: "imap.gmail.com", port: 993, smtpHost: "smtp.gmail.com", smtpPort: 465, appPasswordUrl: "https://myaccount.google.com/apppasswords" },
  { test: /@(outlook|hotmail|live)\.[a-z.]+$/i, host: "outlook.office365.com", port: 993, smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, appPasswordUrl: "https://account.live.com/proofs/AppPassword" },
  { test: /@yahoo\.[a-z.]+$/i, host: "imap.mail.yahoo.com", port: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, appPasswordUrl: "https://help.yahoo.com/kb/SLN15241.html" },
  { test: /@walla\.co\.il$/i, host: "imap.walla.co.il", port: 993, smtpHost: "smtp.walla.co.il", smtpPort: 465 }
];
function detectProvider(email) {
  return KNOWN_PROVIDERS.find((p) => p.test.test(String(email || ""))) || null;
}

function fileFor(baseDir) { return path.join(baseDir, "email-account.json"); }
function readConfig(baseDir) {
  try { return JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8")) || {}; } catch { return {}; }
}
function writeConfig(baseDir, cfg) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(cfg, null, 2));
}

function status(baseDir) {
  const cfg = readConfig(baseDir);
  return {
    connected: !!cfg.email && !!cfg.passwordEnc,
    email: cfg.email || "",
    host: cfg.host || "",
    lastCheck: cfg.lastCheck || null,
    lastError: cfg.lastError || null
  };
}

// בודק את הפרטים מול השרת בפועל לפני שמירה — כדי לא לשמור סיסמה שגויה בשקט
async function connect(baseDir, { email, password, host, port } = {}) {
  email = String(email || "").trim();
  password = String(password || "");
  if (!email || !password) throw new Error("צריך כתובת מייל וסיסמה");

  const provider = detectProvider(email);
  const finalHost = (host || (provider && provider.host) || "").trim();
  const finalPort = Number(port) || (provider && provider.port) || 993;
  if (!finalHost) throw new Error("לא זוהה ספק אוטומטית — יש להזין כתובת שרת IMAP ידנית");

  const client = new ImapFlow({ host: finalHost, port: finalPort, secure: true, auth: { user: email, pass: password }, logger: false, socketTimeout: 15000, greetingTimeout: 15000 });
  // קריטי: ImapFlow פולט אירוע 'error' בנפרד מדחיית ה-promise (למשל כשהסוקט מתנתק אחרי
  // שגיאת אימות) — בלי מאזין כאן זו חריגה לא-מטופלת שמפילה את כל תהליך Node (לכל המשתמשים!).
  client.on("error", () => {});
  try {
    await client.connect();
    await client.logout();
  } catch (e) {
    const hint = provider && provider.appPasswordUrl
      ? ` אם זה Gmail/Outlook/Yahoo — כנראה צריך "סיסמת אפליקציה" ולא הסיסמה הרגילה: ${provider.appPasswordUrl}`
      : "";
    throw new Error("החיבור נכשל — בדקו כתובת/סיסמה." + hint + " (" + (e.responseText || e.message) + ")");
  }

  writeConfig(baseDir, {
    email, host: finalHost, port: finalPort,
    smtpHost: (provider && provider.smtpHost) || "",
    smtpPort: (provider && provider.smtpPort) || 465,
    smtpSecure: provider ? provider.smtpSecure !== false : true,
    passwordEnc: encrypt(password),
    lastCheck: new Date().toISOString(), lastError: null
  });
  return status(baseDir);
}

// שולח מייל מתיבת המשתמש המחוברת (SMTP) — משמש את "שתף" בכל לשונית.
async function sendMail(baseDir, { to, subject, text, html } = {}) {
  const cfg = readConfig(baseDir);
  if (!cfg.email || !cfg.passwordEnc) throw new Error("אין תיבת מייל מחוברת — חברו תיבה בלשונית מיילים קודם");
  if (!cfg.smtpHost) throw new Error("לא ידועה כתובת שרת SMTP לספק הזה — לא ניתן לשלוח (רק לקבל)");
  const to2 = String(to || "").trim();
  if (!to2) throw new Error("צריך כתובת נמען");

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost, port: cfg.smtpPort || 465, secure: cfg.smtpSecure !== false,
    auth: { user: cfg.email, pass: decrypt(cfg.passwordEnc) }
  });
  await transporter.sendMail({
    from: cfg.email, to: to2,
    subject: subject || "(ללא נושא)",
    text: text || "",
    ...(html ? { html } : {})
  });
  return { ok: true };
}

function disconnect(baseDir) {
  writeConfig(baseDir, {});
  return { ok: true };
}

async function recentMessages(baseDir, limit = 15) {
  const cfg = readConfig(baseDir);
  if (!cfg.email || !cfg.passwordEnc) throw new Error("לא מחובר");
  const password = decrypt(cfg.passwordEnc);
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.email, pass: password }, logger: false, socketTimeout: 20000, greetingTimeout: 15000 });
  client.on("error", () => {});

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const out = [];
    try {
      const status = await client.status("INBOX", { messages: true, unseen: true });
      const total = status.messages || 0;
      const from = Math.max(1, total - limit + 1);
      if (total > 0) {
        for await (const msg of client.fetch(`${from}:${total}`, { envelope: true, flags: true })) {
          out.push({
            subject: msg.envelope?.subject || "(ללא נושא)",
            from: (msg.envelope?.from || []).map((f) => f.name || f.address).join(", "),
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
            unread: !msg.flags?.has("\\Seen")
          });
        }
      }
      out.reverse();
      cfg.lastCheck = new Date().toISOString(); cfg.lastError = null;
      writeConfig(baseDir, cfg);
      return { messages: out, unreadCount: status.unseen || 0, total };
    } finally { lock.release(); }
  } catch (e) {
    cfg.lastError = e.message; writeConfig(baseDir, cfg);
    throw e;
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch {} }
  }
}

module.exports = { status, connect, disconnect, recentMessages, detectProvider, sendMail };
