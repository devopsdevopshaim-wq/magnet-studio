// זמני כניסת ויציאת השבת (וערבי חג) — חישוב מקומי דרך @hebcal/core, ללא רשת.
// המיקום נלקח מ-data/astro-config.json אם קיים (רחובות וכו'), אחרת ירושלים.

const { readAstroConfig } = require("./astroConfig");

let hebcalPromise = null;
function loadHebcal() {
  if (!hebcalPromise) hebcalPromise = import("@hebcal/core");
  return hebcalPromise;
}

const HE_TIME = { hour: "2-digit", minute: "2-digit", hour12: false };
const timeStr = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleTimeString("he-IL", HE_TIME) : null);
const dateHe = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }) : null);

function resolveLocation(hebcal) {
  const cfg = readAstroConfig();
  if (cfg && Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon)) {
    try {
      return new hebcal.Location(cfg.lat, cfg.lon, false, "Asia/Jerusalem", cfg.birthPlace || cfg.place || "מיקום מקומי", "IL");
    } catch {
      /* ברירת מחדל */
    }
  }
  return hebcal.Location.lookup("Jerusalem");
}

async function getShabbatTimes(now = new Date()) {
  const hebcal = await loadHebcal();
  const { HebrewCalendar } = hebcal;
  const location = resolveLocation(hebcal);

  // חלון של 9 ימים קדימה מתחילת היום — תופס את השבת הקרובה + ערבי חג סמוכים
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 9 * 86400000);

  let events = [];
  try {
    events = HebrewCalendar.calendar({
      start, end, location,
      candlelighting: true,
      sedrot: true,
      locale: "he"
    });
  } catch (e) {
    return { available: false, error: e.message };
  }

  const candles = events.filter((e) => e.getDesc() === "Candle lighting" && e.eventTime);
  const havdalahs = events.filter((e) => e.getDesc() === "Havdalah" && e.eventTime);
  const parsha = events.find((e) => e.getDesc && /Parashat/.test(e.getDesc()));

  // הדלקת הנרות הקרובה שעוד לא עברה (או של היום אם עוד לא הגיעה)
  const nextCandle = candles.find((e) => e.eventTime.getTime() >= now.getTime() - 30 * 60000);
  // ההבדלה הראשונה שאחרי הדלקת הנרות הזו
  const nextHavdalah = nextCandle
    ? havdalahs.find((e) => e.eventTime.getTime() > nextCandle.eventTime.getTime())
    : havdalahs[0];

  // האם שבת/חג עכשיו (בין הדלקה אחרונה שעברה להבדלה הבאה)
  const lastCandle = [...candles].reverse().find((e) => e.eventTime.getTime() <= now.getTime());
  const firstHavdalahAfter = lastCandle
    ? havdalahs.find((e) => e.eventTime.getTime() > lastCandle.eventTime.getTime())
    : null;
  const isShabbatNow = !!(lastCandle && firstHavdalahAfter &&
    now.getTime() >= lastCandle.eventTime.getTime() &&
    now.getTime() < firstHavdalahAfter.eventTime.getTime());

  const pack = (ev) => ev && {
    time: ev.eventTime.toISOString(),
    timeStr: timeStr(ev.eventTime),
    dateHe: dateHe(ev.eventTime),
    label: ev.render ? ev.render("he") : ev.getDesc(),
    reason: ev.linkedEvent ? ev.linkedEvent.render("he") : (ev.memo || null)
  };

  // ערבי חג / הדלקות נוספות ב-9 הימים (מעבר לשבת הקרובה)
  const upcoming = candles
    .filter((e) => !nextCandle || e.eventTime.getTime() !== nextCandle.eventTime.getTime())
    .slice(0, 3)
    .map((e) => ({
      timeStr: timeStr(e.eventTime),
      dateHe: dateHe(e.eventTime),
      reason: e.linkedEvent ? e.linkedEvent.render("he") : (e.memo || "שבת")
    }));

  return {
    available: true,
    place: location.getName ? location.getName() : "ירושלים",
    isShabbatNow,
    candleLighting: pack(nextCandle),
    havdalah: pack(nextHavdalah),
    parasha: parsha ? (parsha.render ? parsha.render("he") : parsha.getDesc()) : null,
    upcoming
  };
}

module.exports = { getShabbatTimes };
