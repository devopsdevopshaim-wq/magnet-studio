const { getParashaContent } = require("./parashaContent");

// @hebcal/core הוא חבילת ESM טהורה - נטענת דינמית מתוך קוד CommonJS
let hebcalModulePromise = null;
function loadHebcal() {
  if (!hebcalModulePromise) hebcalModulePromise = import("@hebcal/core");
  return hebcalModulePromise;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function getHebrewCalendarInfo() {
  const { HDate, HebrewCalendar, Location, flags } = await loadHebcal();
  const now = new Date();
  const hdate = new HDate(now);
  const location = Location.lookup("Jerusalem");

  // פרשת השבוע - השבת הקרובה (או היום עצמו אם היום שבת)
  const dayOfWeek = now.getDay(); // 0=ראשון .. 5=שישי, 6=שבת
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const upcomingSaturday = new Date(now);
  upcomingSaturday.setDate(now.getDate() + daysUntilSaturday);

  const sedraEvents = HebrewCalendar.calendar({
    start: upcomingSaturday,
    end: upcomingSaturday,
    sedrot: true,
    il: true,
    location
  });
  const parshaEvent = sedraEvents.find((ev) => (ev.getFlags() & flags.PARSHA_HASHAVUA) !== 0);
  const parshaEnglishKey = parshaEvent ? parshaEvent.getDesc().replace(/^Parashat /, "") : null;

  // חגים ומועדים ב-45 הימים הקרובים
  const rangeEnd = new Date(now);
  rangeEnd.setDate(now.getDate() + 45);
  const today0 = startOfDay(now);

  const holidays = HebrewCalendar.calendar({
    start: now,
    end: rangeEnd,
    il: true,
    location,
    sedrot: false
  })
    .filter((ev) => (ev.getFlags() & flags.PARSHA_HASHAVUA) === 0)
    .map((ev) => {
      const d = ev.getDate().greg();
      const daysAway = Math.round((startOfDay(d) - today0) / 86400000);
      const f = ev.getFlags();
      const isMajor = !!(f & (flags.CHAG | flags.MAJOR_FAST | flags.LIGHT_CANDLES_TZEIS));
      return { date: d.toISOString().slice(0, 10), title: ev.render("he"), daysAway, isMajor };
    });

  return {
    generatedAt: now.toISOString(),
    hebrewDate: hdate.render("he"),
    dayOfWeek,
    isFriday: dayOfWeek === 5,
    parasha: parshaEvent ? parshaEvent.render("he") : null,
    parashaDate: upcomingSaturday.toISOString().slice(0, 10),
    parashaContent: getParashaContent(parshaEnglishKey),
    holidays
  };
}

module.exports = { getHebrewCalendarInfo };
