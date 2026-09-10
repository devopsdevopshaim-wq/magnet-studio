// lib/holidayResources.js — אוצר קבצים לחגים.
// לכל קובץ מוגדר occasion (שם חג / "always" / "shabbat") וחלון ימים לפני/אחרי.
// active(date) מחזיר את הקבצים שרלוונטיים כרגע, עם ספירה לאחור.

const fs = require("fs");
const path = require("path");

const MANIFEST = path.join(__dirname, "..", "data", "holiday-resources.json");
const LIB_DIR = path.join(__dirname, "..", "public", "library");

// שמות אירועים של hebcal (getDesc) → occasion key שלנו
const OCCASION_MATCH = {
  Pesach: /^Pesach/i,
  "Rosh Hashana": /^Rosh Hashana/i,
  "Yom Kippur": /^Yom Kippur/i,
  Sukkot: /^Sukkot|^Shmini Atzeret|^Simchat Torah/i,
  Chanukah: /^Chanukah/i,
  Purim: /^Purim|^Shushan Purim/i,
  Shavuot: /^Shavuot/i,
  "Tu BiShvat": /^Tu BiShvat/i,
  "Lag BaOmer": /^Lag BaOmer/i,
  "Tish'a B'Av": /^Tish'a B'Av/i,
  Sigd: /^Sigd/i
};

let hebcalPromise = null;
function loadHebcal() {
  if (!hebcalPromise) hebcalPromise = import("@hebcal/core");
  return hebcalPromise;
}

function readManifest() {
  try {
    const j = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    return (j.resources || []).filter((r) => r && r.file);
  } catch { return []; }
}

function withMeta(r) {
  const p = path.join(LIB_DIR, path.basename(r.file));
  let sizeKB = null, exists = false;
  try { const st = fs.statSync(p); exists = true; sizeKB = Math.round(st.size / 1024); } catch {}
  return { ...r, exists, sizeKB };
}

function list() {
  return readManifest().map(withMeta);
}

// מוצא את המופע הקרוב של חג נתון (בימים מהיום; שלילי אם אנחנו בתוכו/אחריו בטווח)
async function occasionWindow(occasion, refDate) {
  const { HebrewCalendar, HDate, Location } = await loadHebcal();
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const re = OCCASION_MATCH[occasion];
  if (!re) return null;

  const start = new Date(today); start.setDate(start.getDate() - 20);
  const end = new Date(today); end.setDate(end.getDate() + 400);
  const events = HebrewCalendar.calendar({ start, end, il: true, location: Location.lookup("Jerusalem") })
    .filter((ev) => re.test(ev.getDesc()))
    .map((ev) => ev.getDate().greg())
    .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    .sort((a, b) => a - b);
  if (!events.length) return null;

  const first = events[0];
  const last = events[events.length - 1];
  const dFirst = Math.round((first - today) / 86400000);
  const dLast = Math.round((last - today) / 86400000);
  const inHoliday = dFirst <= 0 && dLast >= 0;
  return { daysToStart: dFirst, daysAfterEnd: dLast < 0 ? -dLast : 0, inHoliday, startDate: first.toISOString().slice(0, 10) };
}

// הקבצים הרלוונטיים כרגע (occasion "always" תמיד; אחרים לפי חלון)
async function active(refDate = new Date()) {
  const out = [];
  const isFriday = refDate.getDay() === 5;
  const isSaturday = refDate.getDay() === 6;
  for (const r of list()) {
    if (!r.exists) continue;
    if (r.occasion === "always") { out.push({ ...r, reason: "always" }); continue; }
    if (r.occasion === "shabbat") {
      if (isFriday || isSaturday) out.push({ ...r, reason: "shabbat", label: "לשבת" });
      continue;
    }
    const w = await occasionWindow(r.occasion, refDate).catch(() => null);
    if (!w) continue;
    const before = r.windowBefore ?? 14;
    const after = r.windowAfter ?? 2;
    if (w.inHoliday) {
      out.push({ ...w, ...r, reason: "during", label: "החג עכשיו" });
    } else if (w.daysToStart > 0 && w.daysToStart <= before) {
      out.push({ ...w, ...r, reason: "upcoming", label: `בעוד ${w.daysToStart} ${w.daysToStart === 1 ? "יום" : "ימים"}` });
    } else if (w.daysAfterEnd > 0 && w.daysAfterEnd <= after) {
      out.push({ ...w, ...r, reason: "recent", label: "זה עתה" });
    }
  }
  // upcoming/during קודם, always אחרון
  const rank = { during: 0, upcoming: 1, recent: 2, shabbat: 3, always: 4 };
  return out.sort((a, b) => (rank[a.reason] ?? 9) - (rank[b.reason] ?? 9));
}

// לוח חגים קרובים — היום הראשון של כל חג עיקרי, עד ~13 חודשים קדימה
const MAJOR_RE = /^(Rosh Hashana(?! II| 57)|Yom Kippur$|Sukkot I$|Shmini Atzeret$|Chanukah: 1|Tu BiShvat$|Purim$|Pesach I$|Lag BaOmer$|Shavuot I?$|Tish'a B'Av$|Yom HaZikaron$|Yom HaAtzma'ut$|Yom Yerushalayim$)/;

async function upcomingHolidays(refDate = new Date()) {
  const { HebrewCalendar, Location } = await loadHebcal();
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const end = new Date(today); end.setDate(end.getDate() + 400);
  const seen = new Set();
  return HebrewCalendar.calendar({ start: today, end, il: true, location: Location.lookup("Jerusalem") })
    .filter((ev) => {
      const d = ev.getDesc();
      return MAJOR_RE.test(d) || /^Rosh Hashana \d/.test(d) && !/II/.test(d);
    })
    .map((ev) => {
      const d = ev.getDate().greg();
      const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return {
        title: ev.render("he").replace(/\s+[א׳אבגדIV]+$/, "").replace(/\s*57\d\d$/, "").trim(),
        desc: ev.getDesc(),
        date: dd.toISOString().slice(0, 10),
        dateHe: ev.getDate().render("he").replace(/,?\s*5\d\d\d$/, ""),
        daysAway: Math.round((dd - today) / 86400000)
      };
    })
    .filter((h) => { const k = h.title; if (seen.has(k) || h.daysAway < 0) return false; seen.add(k); return true; })
    .slice(0, 12);
}

module.exports = { list, active, upcomingHolidays };
