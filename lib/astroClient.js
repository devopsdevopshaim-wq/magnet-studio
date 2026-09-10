// אסטרולוגיה אישית - חישוב מקומי בלבד (astronomy-engine). שום נתון לא נשלח החוצה.
//  - מפת לידה: מיקומי כוכבים אקליפטיים, אופק (ASC) ורום השמים (MC), בתים לפי Whole-Sign
//  - טרנזיטים: מיקומי הכוכבים היום והיבטים מול נקודות המפה
//  - "מזל היום": מזל השמש + מזל הירח כרגע
// הפרשנות המילולית נכתבת בנפרד ע"י lib/dailyNarrative.js.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const A = require("astronomy-engine");
const { readAstroConfig, israelTzOffsetMinutes } = require("./astroConfig");

const DATA_DIR = path.join(__dirname, "..", "data");
const NATAL_CACHE = path.join(DATA_DIR, "astro-natal-cache.json");

const SIGNS = [
  "טלה", "שור", "תאומים", "סרטן", "אריה", "בתולה",
  "מאזניים", "עקרב", "קשת", "גדי", "דלי", "דגים"
];
const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

const BODIES = [
  ["Sun", "השמש", "☉"],
  ["Moon", "הירח", "☾"],
  ["Mercury", "כוכב חמה", "☿"],
  ["Venus", "נוגה", "♀"],
  ["Mars", "מאדים", "♂"],
  ["Jupiter", "צדק", "♃"],
  ["Saturn", "שבתאי", "♄"],
  ["Uranus", "אורנוס", "♅"],
  ["Neptune", "נפטון", "♆"],
  ["Pluto", "פלוטו", "♇"]
];

const OBLIQUITY_2026 = 23.4363; // מעלות - מספיק מדויק ל-Whole-Sign

const r = (deg) => (deg * Math.PI) / 180;
const d = (rad) => (rad * 180) / Math.PI;
const norm360 = (x) => ((x % 360) + 360) % 360;

function signOf(lon) {
  const i = Math.floor(norm360(lon) / 30);
  return { index: i, name: SIGNS[i], glyph: SIGN_GLYPH[i], degInSign: +(norm360(lon) % 30).toFixed(1) };
}

// ---------- מיקומי כוכבים ----------

function planetLongitudes(date) {
  const out = {};
  for (const [body] of BODIES) {
    try {
      const vec = A.GeoVector(body, date, true);
      out[body] = norm360(A.Ecliptic(vec).elon);
    } catch {
      /* גוף לא נתמך - מדלגים */
    }
  }
  return out;
}

// ---------- אופק (ASC) ורום השמים (MC) ----------

function eclipticToEquatorial(lonDeg, oblDeg) {
  const l = r(lonDeg), e = r(oblDeg);
  const ra = Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)); // rad
  const dec = Math.asin(Math.sin(e) * Math.sin(l)); // rad, latitude 0
  return { raHours: norm360(d(ra)) / 15, decDeg: d(dec) };
}

// LST במעלות
function localSiderealDeg(date, lonEastDeg) {
  return norm360(A.SiderealTime(date) * 15 + lonEastDeg);
}

// MC: הנקודה האקליפטית שה-RA שלה שווה ל-LST
function computeMC(lstDeg) {
  let best = { diff: 999, lon: 0 };
  for (let lon = 0; lon < 360; lon += 0.25) {
    const { raHours } = eclipticToEquatorial(lon, OBLIQUITY_2026);
    let diff = Math.abs(norm360(raHours * 15 - lstDeg));
    if (diff > 180) diff = 360 - diff;
    if (diff < best.diff) best = { diff, lon };
  }
  return best.lon;
}

// ASC: הנקודה האקליפטית העולה במזרח (altitude~0, azimuth בחצי המזרחי)
function computeASC(date, observer) {
  let best = { score: 1e9, lon: 0 };
  const scan = (start, end, step) => {
    for (let lon = start; lon < end; lon += step) {
      const { raHours, decDeg } = eclipticToEquatorial(norm360(lon), OBLIQUITY_2026);
      const hor = A.Horizon(date, observer, raHours, decDeg, "normal");
      const eastern = hor.azimuth > 20 && hor.azimuth < 160;
      const score = Math.abs(hor.altitude) + (eastern ? 0 : 500);
      if (score < best.score) best = { score, lon: norm360(lon) };
    }
  };
  scan(0, 360, 1);
  scan(best.lon - 2, best.lon + 2, 0.1);
  return best.lon;
}

// ---------- מפת לידה ----------

function birthDateUTC(cfg) {
  const tz = cfg.tzOffsetMinutes != null ? cfg.tzOffsetMinutes : israelTzOffsetMinutes(cfg.birthDate);
  const [hh, mm] = cfg.birthTime.split(":").map(Number);
  // הזמן המקומי בלידה פחות ההיסט = UTC
  const [Y, M, D] = cfg.birthDate.split("-").map(Number);
  return new Date(Date.UTC(Y, M - 1, D, hh, mm) - tz * 60000);
}

function computeNatal(cfg) {
  const date = birthDateUTC(cfg);
  const observer = new A.Observer(cfg.lat, cfg.lon, 0);
  const lons = planetLongitudes(date);

  const lst = localSiderealDeg(date, cfg.lon);
  const ascLon = computeASC(date, observer);
  const mcLon = computeMC(lst);
  const ascSign = signOf(ascLon);

  const planets = BODIES.filter(([b]) => lons[b] != null).map(([b, he, glyph]) => {
    const s = signOf(lons[b]);
    // Whole-Sign: בית 1 = המזל של האופק
    const house = ((s.index - ascSign.index + 12) % 12) + 1;
    return { key: b, name: he, glyph, lon: +lons[b].toFixed(2), sign: s.name, signGlyph: s.glyph, degInSign: s.degInSign, house };
  });

  return {
    birthUTC: date.toISOString(),
    place: cfg.birthPlace,
    ascendant: { lon: +ascLon.toFixed(2), sign: ascSign.name, glyph: ascSign.glyph, degInSign: ascSign.degInSign },
    midheaven: { lon: +mcLon.toFixed(2), sign: signOf(mcLon).name, glyph: signOf(mcLon).glyph },
    sun: planets.find((p) => p.key === "Sun") || null,
    moon: planets.find((p) => p.key === "Moon") || null,
    planets
  };
}

function configHash(cfg) {
  return crypto
    .createHash("sha1")
    .update(`${cfg.birthDate}|${cfg.birthTime}|${cfg.lat}|${cfg.lon}|${cfg.tzOffsetMinutes}`)
    .digest("hex")
    .slice(0, 12);
}

function getNatalChart() {
  const cfg = readAstroConfig();
  if (!cfg) return null;
  const hash = configHash(cfg);
  try {
    const cached = JSON.parse(fs.readFileSync(NATAL_CACHE, "utf8"));
    if (cached.hash === hash) return cached.chart;
  } catch {
    /* אין מטמון */
  }
  const chart = computeNatal(cfg);
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(NATAL_CACHE, JSON.stringify({ hash, chart }, null, 2), "utf8");
  } catch {
    /* מטמון הוא נוחות */
  }
  return chart;
}

// ---------- טרנזיטים והיבטים ----------

const ASPECTS = [
  { angle: 0, name: "צמידות", he: "☌" },
  { angle: 60, name: "שישית", he: "⚹" },
  { angle: 90, name: "ריבוע", he: "□" },
  { angle: 120, name: "שלישית", he: "△" },
  { angle: 180, name: "ניגוד", he: "☍" }
];

function aspectBetween(a, b, wideOrb) {
  let sep = Math.abs(norm360(a - b));
  if (sep > 180) sep = 360 - sep;
  for (const asp of ASPECTS) {
    const orb = Math.abs(sep - asp.angle);
    if (orb <= wideOrb) return { ...asp, orb: +orb.toFixed(1), separation: +sep.toFixed(1) };
  }
  return null;
}

function getTransits(natal, date = new Date()) {
  const today = planetLongitudes(date);
  const sunSign = signOf(today.Sun);
  const moonSign = signOf(today.Moon);

  const hits = [];
  if (natal) {
    const natalPoints = [
      ...natal.planets.map((p) => ({ key: p.key, name: p.name, lon: p.lon })),
      { key: "ASC", name: "האופק", lon: natal.ascendant.lon },
      { key: "MC", name: "רום השמים", lon: natal.midheaven.lon }
    ];
    for (const [tBody, tHe] of BODIES) {
      if (today[tBody] == null) continue;
      const wideOrb = tBody === "Sun" || tBody === "Moon" ? 5 : 3;
      for (const np of natalPoints) {
        const asp = aspectBetween(today[tBody], np.lon, wideOrb);
        if (asp) {
          hits.push({
            transiting: tHe,
            aspect: asp.name,
            glyph: asp.he,
            natalPoint: np.name,
            orb: asp.orb,
            tight: asp.orb <= 1.5
          });
        }
      }
    }
    hits.sort((a, b) => a.orb - b.orb);
  }

  return {
    sunSign: { name: sunSign.name, glyph: sunSign.glyph, degInSign: sunSign.degInSign },
    moonSign: { name: moonSign.name, glyph: moonSign.glyph, degInSign: moonSign.degInSign },
    aspects: hits.slice(0, 8)
  };
}

// ---------- פרשנות ----------

let meaningsCache = null;
function meanings() {
  if (meaningsCache) return meaningsCache;
  try {
    meaningsCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "astro-meanings.json"), "utf8"));
  } catch {
    meaningsCache = { planets: {}, aspects: {}, points: {}, houseAreas: {} };
  }
  return meaningsCache;
}

function interpretAspects(natal, transits) {
  const M = meanings();
  const natalHouseByName = {};
  (natal?.planets || []).forEach((p) => (natalHouseByName[p.name] = p.house));

  return (transits.aspects || []).map((a) => {
    const tMean = M.planets[a.transiting] || "";
    const npMean = M.points[a.natalPoint] || M.planets[a.natalPoint] || "";
    const aspMean = M.aspects[a.aspect] || "";
    const house = natalHouseByName[a.natalPoint];
    const area = house && M.houseAreas[String(house)] ? ` התחום שנוגע: ${M.houseAreas[String(house)]}.` : "";
    return {
      headline: `${a.transiting} ${a.glyph} ${a.natalPoint} · ${a.aspect}${a.tight ? " (מדויק)" : ""}`,
      text:
        `${a.transiting} (${tMean}) יוצר ${a.aspect} אל ${a.natalPoint} שלך (${npMean}). ` +
        `${aspMean ? aspMean[0].toUpperCase() + aspMean.slice(1) + "." : ""}${area}`,
      tight: a.tight,
      orb: a.orb
    };
  });
}

// ---------- קריאה מלאה ----------

function getReading(date = new Date()) {
  const cfg = readAstroConfig();
  const natal = cfg ? getNatalChart() : null;
  const transits = getTransits(natal, date);
  return {
    configured: !!cfg,
    place: cfg ? cfg.birthPlace : null,
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    natal,
    transits,
    interpretations: natal ? interpretAspects(natal, transits) : []
  };
}

module.exports = { getReading, getNatalChart, getTransits, SIGNS };
