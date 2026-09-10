// שמיים היום - חישוב מקומי בלבד (ללא רשת):
//  - זמנים הלכתיים (Zmanim מ-@hebcal/core)
//  - אורך היום ושינוי מול אתמול
//  - מופע הירח, אחוז הארה, גיל, מולד/מלא הבא (astronomy-engine)
//  - כוכבי לכת נראים אחרי השקיעה

const A = require("astronomy-engine");
const { readAstroConfig } = require("./astroConfig");

let hebcalPromise = null;
function loadHebcal() {
  if (!hebcalPromise) hebcalPromise = import("@hebcal/core");
  return hebcalPromise;
}

const HE_TIME = { hour: "2-digit", minute: "2-digit", hour12: false };
const fmtTime = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleTimeString("he-IL", HE_TIME) : null);

// ---------- מיקום ----------

function resolveLocation(hebcal) {
  const cfg = readAstroConfig();
  if (cfg && Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon)) {
    try {
      return new hebcal.Location(cfg.lat, cfg.lon, false, "Asia/Jerusalem", cfg.place || "מיקום מותאם", "IL");
    } catch {
      /* נופלים לברירת המחדל */
    }
  }
  return hebcal.Location.lookup("Jerusalem");
}

// ---------- זמנים הלכתיים ----------

async function halachicTimes(loc, date) {
  const { Zmanim } = await loadHebcal();
  const z = new Zmanim(loc, date, false);
  const call = (fn, ...args) => {
    try {
      return fmtTime(fn.apply(z, args));
    } catch {
      return null;
    }
  };
  return [
    { key: "alotHaShachar", label: "עלות השחר", value: call(z.alotHaShachar) },
    { key: "misheyakir", label: "משיכיר", value: call(z.misheyakir) },
    { key: "sunrise", label: "הנץ החמה", value: call(z.sunrise) },
    { key: "sofZmanShma", label: 'סוף זמן ק"ש (גר"א)', value: call(z.sofZmanShma) },
    { key: "sofZmanTfilla", label: 'סוף זמן תפילה (גר"א)', value: call(z.sofZmanTfilla) },
    { key: "chatzot", label: "חצות היום", value: call(z.chatzot) },
    { key: "minchaGedola", label: "מנחה גדולה", value: call(z.minchaGedola) },
    { key: "minchaKetana", label: "מנחה קטנה", value: call(z.minchaKetana) },
    { key: "plagHaMincha", label: "פלג המנחה", value: call(z.plagHaMincha) },
    { key: "sunset", label: "שקיעה", value: call(z.sunset) },
    { key: "tzeit", label: "צאת הכוכבים", value: call(z.tzeit, 8.5) }
  ].filter((t) => t.value);
}

// ---------- אורך היום ----------

function dayLength(loc, date) {
  try {
    const obs = new A.Observer(loc.getLatitude(), loc.getLongitude(), loc.getElevation ? loc.getElevation() : 0);
    const rise = A.SearchRiseSet("Sun", obs, +1, date, 1);
    const set = A.SearchRiseSet("Sun", obs, -1, rise ? rise.date : date, 1);
    if (!rise || !set) return null;
    const mins = Math.round((set.date - rise.date) / 60000);

    const yRise = A.SearchRiseSet("Sun", obs, +1, new Date(date.getTime() - 864e5), 1);
    const ySet = yRise ? A.SearchRiseSet("Sun", obs, -1, yRise.date, 1) : null;
    const yMins = yRise && ySet ? Math.round((ySet.date - yRise.date) / 60000) : null;

    return {
      hours: Math.floor(mins / 60),
      minutes: mins % 60,
      deltaMin: yMins != null ? mins - yMins : null // שלילי = היום מתקצר
    };
  } catch {
    return null;
  }
}

// ---------- הירח ----------

function moonInfo(date) {
  try {
    const phaseAngle = A.MoonPhase(date); // 0=מולד, 90=רבע ראשון, 180=מלא, 270=רבע אחרון
    const illum = A.Illumination("Moon", date).phase_fraction;

    // מרחק מהמופע -> שם. משתמשים בהיסט מ-0/180/360
    let nearest = { d: 999, he: "", glyph: "" };
    for (const step of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
      const d = Math.abs(phaseAngle - step);
      if (d < nearest.d) nearest = { d, step };
    }
    const nameByStep = {
      0: { he: "מולד (ירח חדש)", glyph: "🌑" },
      45: { he: "מגל מתמלא", glyph: "🌒" },
      90: { he: "רבע ראשון", glyph: "🌓" },
      135: { he: "גיבנת מתמלאת", glyph: "🌔" },
      180: { he: "ירח מלא", glyph: "🌕" },
      225: { he: "גיבנת מתמעטת", glyph: "🌖" },
      270: { he: "רבע אחרון", glyph: "🌗" },
      315: { he: "מגל מתמעט", glyph: "🌘" },
      360: { he: "מולד (ירח חדש)", glyph: "🌑" }
    };
    const nm = nameByStep[nearest.step] || { he: "—", glyph: "🌙" };

    // גיל הירח: זמן מאז המולד האחרון
    const lastNew = A.SearchMoonPhase(0, new Date(date.getTime() - 32 * 864e5), 40);
    const ageDays = lastNew ? (date - lastNew.date) / 864e5 : null;

    const nextNew = A.SearchMoonPhase(0, date, 40);
    const nextFull = A.SearchMoonPhase(180, date, 40);

    return {
      phaseName: nm.he,
      glyph: nm.glyph,
      illuminationPercent: Math.round(illum * 100),
      ageDays: ageDays != null ? +ageDays.toFixed(1) : null,
      waxing: phaseAngle < 180,
      nextNew: nextNew ? nextNew.date.toISOString() : null,
      nextFull: nextFull ? nextFull.date.toISOString() : null
    };
  } catch {
    return null;
  }
}

// ---------- כוכבי לכת נראים אחרי השקיעה ----------

const PLANETS_HE = {
  Mercury: "כוכב חמה",
  Venus: "נוגה",
  Mars: "מאדים",
  Jupiter: "צדק",
  Saturn: "שבתאי"
};

function compass(az) {
  const dirs = ["צפון", "צפון-מזרח", "מזרח", "דרום-מזרח", "דרום", "דרום-מערב", "מערב", "צפון-מערב"];
  return dirs[Math.round(az / 45) % 8];
}

function visiblePlanets(loc, date) {
  try {
    const obs = new A.Observer(loc.getLatitude(), loc.getLongitude(), 0);
    const set = A.SearchRiseSet("Sun", obs, -1, date, 1);
    if (!set) return [];
    const dusk = new Date(set.date.getTime() + 45 * 60000); // ~45 דק' אחרי השקיעה

    const out = [];
    for (const [body, he] of Object.entries(PLANETS_HE)) {
      const eq = A.Equator(body, dusk, obs, true, true);
      const hor = A.Horizon(dusk, obs, eq.ra, eq.dec, "normal");
      if (hor.altitude > 3) {
        out.push({
          name: he,
          altitude: Math.round(hor.altitude),
          direction: compass(hor.azimuth)
        });
      }
    }
    return out.sort((a, b) => b.altitude - a.altitude);
  } catch {
    return [];
  }
}

// ---------- הרכבה ----------

async function getSky(date = new Date()) {
  const hebcal = await loadHebcal();
  const loc = resolveLocation(hebcal);

  const [times] = await Promise.all([halachicTimes(loc, date)]);

  return {
    generatedAt: new Date().toISOString(),
    place: loc.getName ? loc.getName() : "ירושלים",
    halachicTimes: times,
    dayLength: dayLength(loc, date),
    moon: moonInfo(date),
    visiblePlanets: visiblePlanets(loc, date)
  };
}

module.exports = { getSky };
