// lib/clientBrief.js — סיכום יומי קליל ואישי לחשבון לקוח: מבוסס אך ורק על המייל והיומן
// שהמשתמש-עצמו חיבר (Google OAuth / IMAP אישי) — בלי שום גישה למידע העסקי-פנימי של המנהל
// (מגנטים ממתינים לעיצוב, התראות n8n, הגרלה, מצב מערכת/דיסק/רשת, יומן אבטחה). ראו server.js:
// /api/daily-brief מפעיל את המודול הזה לכל חשבון שאינו is_admin, במקום lib/dailyBrief.js.

const emailAccounts = require("./emailAccounts");
const googleCalendar = require("./googleCalendar");
const { getHebrewCalendarInfo } = require("./hebrewCalendar");
const proverbs = require("./proverbs");

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtTime(ev) {
  return ev.allDay ? "כל היום" : new Date(ev.start).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

async function collectCalendar(baseDir) {
  const st = googleCalendar.status(baseDir);
  if (!st.connected) return { connected: false, today: [], week: [] };
  try {
    const events = await googleCalendar.listUpcomingEvents(baseDir, { maxResults: 20 });
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 7);
    const pick = (ev) => ({ summary: ev.title, when: fmtTime(ev), link: null });
    const today = events.filter((e) => sameDay(new Date(e.start), now)).map(pick);
    const week = events
      .filter((e) => new Date(e.start) <= weekEnd)
      .map((e) => ({
        summary: e.title,
        weekday: new Date(e.start).toLocaleDateString("he-IL", { weekday: "long" }),
        when: fmtTime(e)
      }));
    return { connected: true, today, week };
  } catch (err) {
    return { connected: true, error: err.message, today: [], week: [] };
  }
}

async function collectEmail(baseDir) {
  const st = emailAccounts.status(baseDir);
  if (!st.connected) return { connected: false, unreadCount: null, recent: [] };
  try {
    const { messages } = await emailAccounts.recentMessages(baseDir, 10);
    const unread = messages.filter((m) => m.unread);
    return {
      connected: true,
      email: st.email,
      unreadCount: unread.length,
      recent: unread.slice(0, 6).map((m) => ({ subject: m.subject, sender: m.from }))
    };
  } catch (err) {
    return { connected: true, error: err.message, unreadCount: null, recent: [] };
  }
}

async function build(baseDir, displayName) {
  const [hebrew, calendar, email, proverb] = await Promise.all([
    getHebrewCalendarInfo().catch(() => null),
    collectCalendar(baseDir),
    collectEmail(baseDir),
    Promise.resolve()
      .then(() => proverbs.getDailyProverb())
      .catch(() => null)
  ]);

  return {
    mode: "client",
    displayName: displayName || "",
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    hebrew,
    calendar,
    email,
    proverb
  };
}

module.exports = { build };
