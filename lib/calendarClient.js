// יומן שבועי משולב מכל חשבונות Google Calendar המחוברים ב-Maton.
// כדי להוסיף חשבון (למשל litaldahan1@gmail.com): כרטיס Maton בדשבורד -> "חבר" -> google-calendar.

const maton = require("./matonClient");

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

async function activeCalendarConnections() {
  try {
    const list = await maton.listAllConnections();
    return list
      .filter((c) => c.app === "google-calendar" && c.status === "ACTIVE")
      .map((c) => ({
        connectionId: c.connection_id,
        apiKey: c._apiKey,
        keyIndex: c._keyIndex,
        email: c.metadata?.email || `יומן Google ${c._keyIndex + 1}`
      }))
      .filter((c, i, arr) => arr.findIndex((x) => x.email === c.email) === i);
  } catch {
    return [];
  }
}

async function activeGmailConnections() {
  try {
    const list = await maton.listAllConnections();
    return list
      .filter((c) => c.app === "google-mail" && c.status === "ACTIVE")
      .map((c) => ({ connectionId: c.connection_id, apiKey: c._apiKey, keyIndex: c._keyIndex, email: c.metadata?.email || `Gmail ${c._keyIndex + 1}` }))
      // הסרת כפילויות של אותו חשבון (Maton יכול להחזיק כמה חיבורים לאותו מייל)
      .filter((c, i, arr) => arr.findIndex((x) => x.email === c.email) === i);
  } catch {
    return [];
  }
}

function eventStart(ev) {
  return ev.start?.dateTime || ev.start?.date || null;
}
function isTimed(ev) {
  return !!ev.start?.dateTime;
}

async function fetchEventsFor(conn, timeMin, timeMax) {
  try {
    const res = await maton.calendarListEvents(50, { timeMin, timeMax, connectionId: conn.connectionId, apiKey: conn.apiKey });
    return (res.items || []).map((ev) => ({
      id: ev.id,
      summary: ev.summary || "(ללא כותרת)",
      start: eventStart(ev),
      timed: isTimed(ev),
      link: ev.htmlLink || null,
      account: conn.email
    }));
  } catch {
    return [];
  }
}

/**
 * @returns {Promise<{configured:boolean, accounts:string[], totalEvents:number,
 *   days:Array<{date:string, weekday:string, isToday:boolean, events:Array}>}>}
 */
async function getWeek(now = new Date()) {
  const conns = await activeCalendarConnections();
  if (!conns.length) {
    return { configured: false, accounts: [], totalEvents: 0, days: [] };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const batches = await Promise.all(conns.map((c) => fetchEventsFor(c, now.toISOString(), end.toISOString())));

  // מיזוג + הסרת כפילויות (אותו id מאותו חשבון)
  const seen = new Set();
  const all = [];
  batches.flat().forEach((ev) => {
    const k = `${ev.account}|${ev.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    const d = ev.start ? new Date(ev.start) : null;
    if (!d || isNaN(d)) return;
    all.push({ ...ev, _d: d });
  });
  all.sort((a, b) => a._d - b._d);

  const today0 = start.getTime();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const evs = all
      .filter((ev) => {
        const ed = new Date(ev._d.getFullYear(), ev._d.getMonth(), ev._d.getDate());
        return ed.getTime() === day.getTime();
      })
      .map((ev) => ({
        summary: ev.summary,
        when: ev.timed ? ev._d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "כל היום",
        account: ev.account,
        link: ev.link
      }));
    days.push({
      date: dayKey,
      weekday: WEEKDAYS[day.getDay()],
      label: day.toLocaleDateString("he-IL", { day: "numeric", month: "short" }),
      isToday: day.getTime() === today0,
      events: evs
    });
  }

  return {
    configured: true,
    accounts: conns.map((c) => c.email),
    totalEvents: all.length,
    days
  };
}

module.exports = { getWeek, activeCalendarConnections, activeGmailConnections };
