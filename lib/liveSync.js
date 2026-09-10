// סנכרון חי ורציף - מושך מצב מיילים ואירועי יומן דרך Maton כל כמה דקות ושומר אותם
// לקבצי הסטטוס שהדשבורד קורא מהם. כך הכרטיסים "מיילים" ו"אירועים קרובים" בפאנל הצד
// נשארים מעודכנים כל הזמן כל עוד השרת רץ - בלי צורך ב-n8n או ברענון ידני.
//
// המפתח של Maton נקרא רק מ-process.env.MATON_API_KEY (ראו matonClient.js). אם הוא לא
// מוגדר, הסנכרון פשוט לא מופעל.

const fs = require("fs");
const path = require("path");
const maton = require("./matonClient");

const DATA_DIR = path.join(__dirname, "..", "data");
const EMAIL_STATUS_FILE = path.join(DATA_DIR, "email-status.json");
const CALENDAR_STATUS_FILE = path.join(DATA_DIR, "calendar-status.json");
const SYNC_STATUS_FILE = path.join(DATA_DIR, "sync-status.json");

// כל 6 דקות. ניתן לעקוף עם משתנה סביבה LIVE_SYNC_INTERVAL_MIN.
const DEFAULT_INTERVAL_MIN = 6;

function intervalMs() {
  const n = parseInt(process.env.LIVE_SYNC_INTERVAL_MIN, 10);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MIN) * 60 * 1000;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function recordSyncStatus(partial) {
  const current = readJson(SYNC_STATUS_FILE) || {};
  writeJson(SYNC_STATUS_FILE, { ...current, ...partial });
}

// ---------- מיילים (Gmail דרך Maton) ----------

async function syncEmail() {
  // ממזג את כל חשבונות google-mail המחוברים בכל מפתחות Maton
  const calendarClient = require("./calendarClient");
  const all = await calendarClient.activeGmailConnections();
  const list = all.length ? all : [{ apiKey: undefined, email: "devopsdevopshaim@gmail.com" }];

  const perAccount = await Promise.all(
    list.map((c) =>
      maton
        .gmailListMessagesDetailed("is:unread", 8, c.apiKey)
        .then((d) => ({
          email: c.email,
          count: typeof d.resultSizeEstimate === "number" ? d.resultSizeEstimate : (d.messages || []).length,
          messages: (d.messages || []).map((m) => ({
            subject: m.subject || "(ללא נושא)",
            sender: m.from || "",
            snippet: m.snippet || "",
            link: m.link || null,
            account: c.email
          }))
        }))
        .catch(() => ({ email: c.email, count: 0, messages: [] }))
    )
  );

  const totalUnread = perAccount.reduce((s, a) => s + a.count, 0);
  const allMsgs = perAccount.flatMap((a) => a.messages);

  // סיווג — סוג + תחום מקצועי למיילים של חיפוש עבודה
  const { summarize } = require("./emailClassify");
  const sum = summarize(allMsgs);

  writeJson(EMAIL_STATUS_FILE, {
    account: list.map((c) => c.email).join(", "),
    accounts: perAccount.map((a) => ({ email: a.email, unread: a.count })),
    unreadCount: totalUnread,
    sampleSize: allMsgs.length,
    jobRelatedCount: sum.jobRelatedCount,
    byCategory: sum.byCategory,
    byField: sum.byField,
    recentUnread: sum.items.slice(0, 16).map((m) => ({
      subject: m.subject,
      sender: m.sender,
      link: m.link,
      account: m.account,
      category: m.category,
      jobRelated: m.jobRelated,
      field: m.field
    })),
    source: "maton-live-sync",
    updatedAt: new Date().toISOString()
  });
  return totalUnread;
}

// ---------- יומן (Google Calendar דרך Maton) ----------

function eventStart(ev) {
  return ev.start?.dateTime || ev.start?.date || null;
}
function eventEnd(ev) {
  return ev.end?.dateTime || ev.end?.date || null;
}

async function syncCalendar() {
  // ממזג את כל חשבונות Google Calendar המחוברים ב-Maton (לא רק אחד)
  const calendarClient = require("./calendarClient");
  const conns = await calendarClient.activeCalendarConnections();
  const list = conns.length ? conns : [{ connectionId: undefined, apiKey: undefined, email: "devopsdevopshaim@gmail.com" }];

  const now = new Date().toISOString();
  const batches = await Promise.all(
    list.map((c) =>
      maton
        .calendarListEvents(20, { timeMin: now, connectionId: c.connectionId, apiKey: c.apiKey })
        .then((r) => (r.items || []).map((ev) => ({ ev, account: c.email })))
        .catch(() => [])
    )
  );

  const seen = new Set();
  const events = [];
  for (const { ev, account } of batches.flat()) {
    if (ev.id && seen.has(account + ev.id)) continue;
    if (ev.id) seen.add(account + ev.id);
    events.push({
      summary: ev.summary || "(ללא כותרת)",
      start: eventStart(ev),
      end: eventEnd(ev),
      link: ev.htmlLink || null,
      account
    });
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  writeJson(CALENDAR_STATUS_FILE, {
    account: list.map((c) => c.email).join(", "),
    accounts: list.map((c) => c.email),
    events: events.slice(0, 40),
    source: "maton-live-sync",
    updatedAt: new Date().toISOString()
  });
  return events.length;
}

// ---------- הרצה ----------

async function runOnce() {
  if (!maton.isConfigured()) {
    return { ok: false, skipped: true, reason: "MATON_API_KEY אינו מוגדר" };
  }
  const result = { ok: true, ranAt: new Date().toISOString(), email: null, calendar: null, errors: [] };

  const [emailRes, calRes] = await Promise.allSettled([syncEmail(), syncCalendar()]);

  if (emailRes.status === "fulfilled") result.email = { unreadCount: emailRes.value };
  else result.errors.push(`email: ${emailRes.reason?.message || emailRes.reason}`);

  if (calRes.status === "fulfilled") result.calendar = { eventCount: calRes.value };
  else result.errors.push(`calendar: ${calRes.reason?.message || calRes.reason}`);

  result.ok = result.errors.length === 0;
  recordSyncStatus({
    lastRunAt: result.ranAt,
    lastOk: result.ok,
    lastErrors: result.errors,
    intervalMinutes: intervalMs() / 60000
  });
  return result;
}

let timer = null;

function start() {
  if (!maton.isConfigured()) {
    console.log("סנכרון חי כבוי - MATON_API_KEY אינו מוגדר");
    return;
  }
  if (timer) return;
  const ms = intervalMs();
  console.log(`סנכרון חי פעיל - מיילים ויומן יתעדכנו דרך Maton כל ${ms / 60000} דקות`);

  // ריצה ראשונה קצת אחרי העלייה (לא לחסום את הפעלת השרת)
  setTimeout(() => {
    runOnce()
      .then((r) => {
        if (r.skipped) return;
        if (r.ok) console.log(`סנכרון חי ראשון הושלם (${r.email?.unreadCount ?? "?"} מיילים, ${r.calendar?.eventCount ?? "?"} אירועים)`);
        else console.log(`סנכרון חי ראשון הסתיים עם שגיאות: ${r.errors.join(" · ")}`);
      })
      .catch((e) => console.error("סנכרון חי נכשל:", e.message));
  }, 4000);

  timer = setInterval(() => {
    runOnce().catch((e) => console.error("סנכרון חי נכשל:", e.message));
  }, ms);
  timer.unref?.();
}

function getStatus() {
  return readJson(SYNC_STATUS_FILE);
}

module.exports = { start, runOnce, getStatus, intervalMinutes: () => intervalMs() / 60000 };
