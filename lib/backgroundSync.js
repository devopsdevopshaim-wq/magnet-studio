// lib/backgroundSync.js — לולאת סנכרון שרתית שרצה ברקע (server.js, setInterval) ללא תלות
// בזה שהמכשיר של המשתמש דלוק או שהוא בכלל בעמוד: עוברת על כל החשבונות הפעילים, בודקת מיילים
// חדשים ואירועי יומן קרובים לכל מי שחיבר, ויוצרת התראות (lib/notifications.js). הלקוח רק
// שולף את מה שכבר נאסף - "בכל הפעלה" הוא כבר מוכן ומחכה, לא תלוי בטיימינג של הפתיחה.

const accounts = require("./accounts");
const pnksUsers = require("./users");
const { PERSIST_DIR } = require("./paths");
const emailAccounts = require("./emailAccounts");
const googleCalendar = require("./googleCalendar");
const vacationTrips = require("./vacationTrips");
const notifications = require("./notifications");

// שמות היעדים באתר מסע (vacation-hub/js/data.js) — לתצוגה בהתראה במקום מזהה פנימי כמו "athens".
const VACATION_DEST_NAMES = {
  eilat: "אילת", jerusalem: "ירושלים", telaviv: "תל אביב", galilee: "הגליל והגולן",
  paris: "פריז", london: "לונדון", rome: "רומא", barcelona: "ברצלונה",
  athens: "אתונה והאיים", prague: "פראג", newyork: "ניו יורק", dubai: "דובאי",
  bangkok: "בנגקוק ותאילנד", tokyo: "טוקיו"
};

function baseDirForAccount(acc) {
  return acc.is_admin ? PERSIST_DIR : pnksUsers.userDir(acc.id);
}

async function syncEmail(acc, baseDir) {
  const st = emailAccounts.status(baseDir);
  if (!st.connected) return;
  const { messages } = await emailAccounts.recentMessages(baseDir, 10);
  for (const m of messages) {
    if (!m.unread || !m.uid) continue;
    await notifications.create(acc.id, {
      type: "email",
      title: `מייל חדש: ${m.subject}`,
      body: m.from,
      sourceKey: `email:${st.email}:${m.uid}`
    });
  }
}

async function syncCalendar(acc, baseDir) {
  const cst = googleCalendar.status(baseDir);
  if (!cst.connected) return;
  const events = await googleCalendar.listUpcomingEvents(baseDir, { maxResults: 8 });
  for (const ev of events) {
    const when = ev.allDay
      ? ev.start
      : new Date(ev.start).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const body = ev.description ? `${when} — ${ev.description.slice(0, 140)}` : when;
    await notifications.create(acc.id, {
      type: "calendar",
      title: `אירוע ביומן: ${ev.title}`,
      body,
      sourceKey: `calendar:${ev.id}`
    });
  }
}

// "דקה 90": חופשה שמורה שהתאריך שלה מתקרב (עד 14 יום) ועדיין לא סומנו טיסה+מלון כמוזמנים
// ברשימת ההכנות. bucket שונה ל"soon"/"urgent" כדי שההתראה תישלח שוב כשהדחיפות עולה.
function isVacationBooked(trip) {
  const items = trip.checklist || [];
  const flight = items.find((i) => /טיסה/.test(i.t));
  const hotel = items.find((i) => /מלון/.test(i.t));
  return !!(flight && flight.done && hotel && hotel.done);
}

async function syncVacations(acc, baseDir) {
  const { trips } = vacationTrips.read(baseDir);
  if (!trips.length) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const trip of trips) {
    if (!trip.id || !trip.start) continue;
    const daysAway = Math.round((new Date(trip.start) - today) / 86400000);
    if (daysAway < 0 || daysAway > 14) continue;
    if (isVacationBooked(trip)) continue;
    const name = VACATION_DEST_NAMES[trip.dest] || trip.dest;
    const bucket = daysAway <= 3 ? "urgent" : "soon";
    const title =
      daysAway === 0 ? `היום! חופשה ל${name} יוצאת היום` :
      daysAway === 1 ? `מחר! חופשה ל${name} יוצאת מחר` :
      `דקה 90: חופשה ל${name} בעוד ${daysAway} ימים`;
    const total = (trip.checklist || []).length;
    const done = (trip.checklist || []).filter((i) => i.done).length;
    await notifications.create(acc.id, {
      type: "vacation",
      title,
      body: total ? `${done} מתוך ${total} הכנות בוצעו — עדיין לא סגרתם טיסה/מלון.` : "עדיין לא סגרתם טיסה/מלון.",
      sourceKey: `vacation:${trip.id}:${bucket}`
    });
  }
}

async function syncAccount(acc) {
  const baseDir = baseDirForAccount(acc);
  try { await syncEmail(acc, baseDir); }
  catch (e) { console.error(`סנכרון רקע — מייל נכשל עבור ${acc.email}:`, e.message); }
  try { await syncCalendar(acc, baseDir); }
  catch (e) { console.error(`סנכרון רקע — יומן נכשל עבור ${acc.email}:`, e.message); }
  try { await syncVacations(acc, baseDir); }
  catch (e) { console.error(`סנכרון רקע — חופשות נכשל עבור ${acc.email}:`, e.message); }
}

async function syncAll() {
  let list;
  try { list = await accounts.listAccounts(); }
  catch (e) { console.error("סנכרון רקע: כשל בטעינת רשימת חשבונות:", e.message); return; }
  for (const acc of list) {
    if (acc.account_status !== "active") continue;
    await syncAccount(acc);
  }
}

function start(intervalMinutes = 10) {
  const run = () => syncAll().catch((e) => console.error("סנכרון רקע נכשל:", e.message));
  setTimeout(run, 15000); // לא לחסום את עליית השרת
  setInterval(run, intervalMinutes * 60 * 1000);
}

module.exports = { syncAll, syncAccount, start };
