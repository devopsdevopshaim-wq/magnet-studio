// lib/whatsapp.js — חיבור וואטסאפ אישי (לא רשמי, דרך WhatsApp Web): סורקים קוד QR עם הטלפון,
// בדיוק כמו web.whatsapp.com, והחשבון נשאר מחובר לשרת. אין API רשמי ואין מספר עסקי נפרד —
// זה בדיוק הטלפון והמספר שלכם, אבל ה-Session רץ מתוך הדפדפן שהשרת מפעיל (Puppeteer).
//
// אזהרה חשובה: זו ספרייה לא-רשמית (whatsapp-web.js) שמדמה דפדפן מחובר ל-WhatsApp Web.
// זה עובד, אבל נוגד את תנאי השימוש של וואטסאפ/מטא ויש סיכון (נמוך אך קיים) לחסימת המספר,
// בעיקר בשימוש אוטומטי אגרסיבי (הודעות המוניות, קצב גבוה). מומלץ לשימוש אישי מתון.
//
// כל חשבון (בעלים / משתמש רשום) מקבל session נפרד משלו, נשמר תחת התיקייה הפרטית שלו —
// כדי שלא ישתפו את אותו חיבור וואטסאפ.

const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

let Client, LocalAuth;
let loadError = null;
try {
  ({ Client, LocalAuth } = require("whatsapp-web.js"));
} catch (e) {
  loadError = e;
}

// accountKey (baseDir) -> { client, status, qrDataUrl, info, lastError, startedAt }
const sessions = new Map();

function keyFor(baseDir) { return path.resolve(baseDir); }

function state(baseDir) {
  const s = sessions.get(keyFor(baseDir));
  if (!s) return { status: "disconnected", qr: null, info: null, error: null, available: !loadError };
  return { status: s.status, qr: s.status === "qr" ? s.qrDataUrl : null, info: s.info || null, error: s.lastError || null, available: true };
}

async function connect(baseDir) {
  if (loadError) throw new Error("מודול הוואטסאפ לא נטען בשרת הזה: " + loadError.message);
  const key = keyFor(baseDir);
  const existing = sessions.get(key);
  if (existing && ["qr", "connecting", "ready", "authenticated"].includes(existing.status)) return state(baseDir);

  const sessionDir = path.join(baseDir, "whatsapp-session");
  fs.mkdirSync(sessionDir, { recursive: true });

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionDir }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    }
  });

  const s = { client, status: "connecting", qrDataUrl: null, info: null, lastError: null, startedAt: Date.now() };
  sessions.set(key, s);

  client.on("qr", async (qr) => {
    try { s.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 }); } catch { s.qrDataUrl = null; }
    s.status = "qr";
  });
  client.on("authenticated", () => { s.status = "authenticated"; });
  client.on("ready", () => {
    s.status = "ready";
    s.qrDataUrl = null;
    try {
      const info = client.info;
      s.info = info ? { name: info.pushname || "", number: (info.wid && info.wid.user) || "" } : null;
    } catch { s.info = null; }
  });
  client.on("auth_failure", (msg) => { s.status = "auth_failure"; s.lastError = String(msg || "אימות נכשל"); });
  client.on("disconnected", (reason) => {
    s.status = "disconnected"; s.lastError = String(reason || ""); s.qrDataUrl = null; s.info = null;
    sessions.delete(key);
  });

  client.initialize().catch((e) => { s.status = "error"; s.lastError = e.message; });
  return state(baseDir);
}

async function disconnect(baseDir) {
  const key = keyFor(baseDir);
  const s = sessions.get(key);
  if (!s) return { ok: true };
  try { await s.client.logout(); } catch { /* ייתכן שכבר מנותק */ }
  try { await s.client.destroy(); } catch {}
  sessions.delete(key);
  // מוחקים גם את קבצי ה-session השמורים כדי לאלץ סריקת QR חדשה בפעם הבאה
  try { fs.rmSync(path.join(baseDir, "whatsapp-session"), { recursive: true, force: true }); } catch {}
  return { ok: true };
}

function normalizePhone(raw) {
  let n = String(raw || "").replace(/[^\d+]/g, "");
  n = n.replace(/^\+/, "");
  if (n.startsWith("0")) n = "972" + n.slice(1); // ברירת מחדל: מספר ישראלי מקומי
  return n;
}

async function sendMessage(baseDir, to, text) {
  const key = keyFor(baseDir);
  const s = sessions.get(key);
  if (!s || s.status !== "ready") throw new Error("וואטסאפ לא מחובר — יש לסרוק קוד QR קודם");
  const phone = normalizePhone(to);
  if (!phone) throw new Error("מספר טלפון לא תקין");
  const chatId = phone + "@c.us";
  const num = await s.client.getNumberId(chatId).catch(() => null);
  if (!num) throw new Error("המספר הזה לא רשום בוואטסאפ");
  const msg = await s.client.sendMessage(num._serialized, String(text || "").slice(0, 4000));
  return { ok: true, id: msg.id ? msg.id._serialized : null };
}

async function recentChats(baseDir, limit = 20) {
  const key = keyFor(baseDir);
  const s = sessions.get(key);
  if (!s || s.status !== "ready") return [];
  try {
    const chats = await s.client.getChats();
    return chats.slice(0, limit).map((c) => ({
      id: c.id._serialized,
      name: c.name || c.formattedTitle || c.id.user,
      isGroup: !!c.isGroup,
      unread: c.unreadCount || 0,
      lastMessage: c.lastMessage ? { body: (c.lastMessage.body || "").slice(0, 200), fromMe: !!c.lastMessage.fromMe, ts: (c.lastMessage.timestamp || 0) * 1000 } : null
    }));
  } catch { return []; }
}

module.exports = { connect, disconnect, sendMessage, recentChats, state, available: !loadError };
