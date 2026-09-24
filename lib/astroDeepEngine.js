/*
 * astro.js — מנוע אסטרולוגי דטרמיניסטי ושקוף
 * ------------------------------------------------------------------
 * מקור אמת יחיד. אותו קובץ רץ:
 *   1. בדפדפן (window.Astro)           — האתר / ה-HTML העצמאי
 *   2. ב-Node (module.exports)          — סקריפטים ובדיקות
 *   3. מוטמע כמחרוזת בתוך n8n Code node — צינור ה-n8n
 *
 * חישוב מיקומי כוכבים: השיטה הנמוכת-דיוק של Paul Schlyter
 * ("How to compute planetary positions"). דיוק בפועל:
 *   שמש/כוכבים ~1–2 דקות קשת, ירח ~2 דקות קשת.
 *   די והותר לקביעת מזל, בית והיבט. זה לא Swiss Ephemeris,
 *   אבל זה שמיים אמיתיים — לא Math.random().
 *
 * מה זה *לא*: לא תחליף לייעוץ, לא מדע מאומת. אסטרולוגיה איננה
 * שיטה מנבאת. המערכת היא כלי מובנה להרהור ולבידור.
 * ================================================================
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Astro = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- טריגונומטריה במעלות ----------
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const sin = d => Math.sin(d * D2R);
  const cos = d => Math.cos(d * D2R);
  const tan = d => Math.tan(d * D2R);
  const asin = x => Math.asin(x) * R2D;
  const atan2 = (y, x) => Math.atan2(y, x) * R2D;
  const rev = x => ((x % 360) + 360) % 360;                 // 0..360
  const rev180 = x => { let v = rev(x); return v > 180 ? v - 360 : v; }; // -180..180

  // ---------- מזלות ----------
  const SIGNS_HE = ['טלה', 'שור', 'תאומים', 'סרטן', 'אריה', 'בתולה',
    'מאזניים', 'עקרב', 'קשת', 'גדי', 'דלי', 'דגים'];
  const SIGNS_EN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  const ELEMENTS = ['אש', 'אדמה', 'אוויר', 'מים'];               // חוזר במחזור לפי index%4
  const MODALITIES = ['קרדינלי', 'קבוע', 'משתנה'];              // index%3
  const SIGN_RULER = ['מאדים', 'נוגה', 'מרקורי', 'ירח', 'שמש', 'מרקורי',
    'נוגה', 'פלוטו', 'צדק', 'שבתאי', 'אורנוס', 'נפטון'];

  const signIndex = lon => Math.floor(rev(lon) / 30);
  const degInSign = lon => rev(lon) % 30;
  function fmtDeg(lon) {
    const s = signIndex(lon), d = degInSign(lon);
    const deg = Math.floor(d), min = Math.floor((d - deg) * 60);
    return `${deg}°${String(min).padStart(2, '0')}′ ${SIGNS_HE[s]}`;
  }

  // ---------- מספר יום Schlyter (d) מתוך תאריך UTC ----------
  function dayNumber(utc) {
    const Y = utc.getUTCFullYear(), M = utc.getUTCMonth() + 1, D = utc.getUTCDate();
    const UT = utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600;
    const d = 367 * Y
      - Math.floor(7 * (Y + Math.floor((M + 9) / 12)) / 4)
      + Math.floor(275 * M / 9)
      + D - 730530;
    return d + UT / 24;
  }
  const obliquity = d => 23.4393 - 3.563e-7 * d;

  // ---------- אלמנטים אורביטליים (Schlyter) ----------
  function elements(name, d) {
    switch (name) {
      case 'sun': return { N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1, e: 0.016709 - 1.151e-9 * d, M: 356.0470 + 0.9856002585 * d };
      case 'moon': return { N: 125.1228 - 0.0529538083 * d, i: 5.1454, w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.054900, M: 115.3654 + 13.0649929509 * d };
      case 'mercury': return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.00e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d };
      case 'venus': return { N: 76.6799 + 2.46590e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.8910 + 1.38374e-5 * d, a: 0.723330, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d };
      case 'mars': return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d };
      case 'jupiter': return { N: 100.4542 + 2.76854e-5 * d, i: 1.3030 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.8950 + 0.0830853001 * d };
      case 'saturn': return { N: 113.6634 + 2.38980e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.9670 + 0.0334442282 * d };
      case 'uranus': return { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d };
      case 'neptune': return { N: 131.7806 + 3.0173e-5 * d, i: 1.7700 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d };
      default: throw new Error('unknown body ' + name);
    }
  }

  function eccentricAnomaly(M, e) {
    M = rev(M);
    let E = M + R2D * e * sin(M) * (1 + e * cos(M));
    for (let k = 0; k < 12; k++) {
      const dE = (E - R2D * e * sin(E) - M) / (1 - e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-9) break;
    }
    return E;
  }

  // מיקום הליוצנטרי במרחב + נתוני שמש נדרשים לגאוצנטרי
  function heliocentric(el) {
    const E = eccentricAnomaly(el.M, el.e);
    const xv = el.a * (cos(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
    const v = atan2(yv, xv);
    const r = Math.hypot(xv, yv);
    const u = v + el.w;
    return {
      r, v,
      x: r * (cos(el.N) * cos(u) - sin(el.N) * sin(u) * cos(el.i)),
      y: r * (sin(el.N) * cos(u) + cos(el.N) * sin(u) * cos(el.i)),
      z: r * (sin(u) * sin(el.i)),
    };
  }

  function sunPosition(d) {
    const el = elements('sun', d);
    const E = eccentricAnomaly(el.M, el.e);
    const xv = cos(E) - el.e;
    const yv = Math.sqrt(1 - el.e * el.e) * sin(E);
    const v = atan2(yv, xv);
    const r = Math.hypot(xv, yv);
    const lon = rev(v + el.w);
    return {
      lon, r, lat: 0,
      xs: r * cos(lon), ys: r * sin(lon),
      Ms: rev(el.M), ws: el.w, Ls: rev(el.M + el.w),
    };
  }

  function moonPosition(d, sun) {
    const el = elements('moon', d);
    const h = heliocentric(el);           // עבור הירח זה כבר גאוצנטרי
    let lon = atan2(h.y, h.x);
    let lat = atan2(h.z, Math.hypot(h.x, h.y));
    // הפרעות עיקריות
    const Ms = sun.Ms, Mm = rev(el.M);
    const Lm = rev(el.N + el.w + el.M), Ls = sun.Ls;
    const Dm = rev(Lm - Ls);              // אלונגציה ממוצעת
    const F = rev(Lm - el.N);             // ארגומנט הרוחב
    lon += -1.274 * sin(Mm - 2 * Dm)
      + 0.658 * sin(2 * Dm)
      - 0.186 * sin(Ms)
      - 0.059 * sin(2 * Mm - 2 * Dm)
      - 0.057 * sin(Mm - 2 * Dm + Ms)
      + 0.053 * sin(Mm + 2 * Dm)
      + 0.046 * sin(2 * Dm - Ms)
      + 0.041 * sin(Mm - Ms)
      - 0.035 * sin(Dm)
      - 0.031 * sin(Mm + Ms)
      - 0.015 * sin(2 * F - 2 * Dm)
      + 0.011 * sin(Mm - 4 * Dm);
    lat += -0.173 * sin(F - 2 * Dm)
      - 0.055 * sin(Mm - F - 2 * Dm)
      - 0.046 * sin(Mm + F - 2 * Dm)
      + 0.033 * sin(F + 2 * Dm)
      + 0.017 * sin(2 * Mm + F);
    return { lon: rev(lon), lat, r: h.r };
  }

  function planetPosition(name, d, sun) {
    const el = elements(name, d);
    const h = heliocentric(el);
    const xg = h.x + sun.xs, yg = h.y + sun.ys, zg = h.z;
    let lon = atan2(yg, xg);
    const lat = atan2(zg, Math.hypot(xg, yg));
    // הפרעות משמעותיות של צדק/שבתאי/אורנוס
    const Mj = rev(elements('jupiter', d).M);
    const Msa = rev(elements('saturn', d).M);
    const Mu = rev(elements('uranus', d).M);
    if (name === 'jupiter') {
      lon += -0.332 * sin(2 * Mj - 5 * Msa - 67.6)
        - 0.056 * sin(2 * Mj - 2 * Msa + 21)
        + 0.042 * sin(3 * Mj - 5 * Msa + 21)
        - 0.036 * sin(Mj - 2 * Msa)
        + 0.022 * cos(Mj - Msa)
        + 0.023 * sin(2 * Mj - 3 * Msa + 52)
        - 0.016 * sin(Mj - 5 * Msa - 69);
    } else if (name === 'saturn') {
      lon += 0.812 * sin(2 * Mj - 5 * Msa - 67.6)
        - 0.229 * cos(2 * Mj - 4 * Msa - 2)
        + 0.119 * sin(Mj - 2 * Msa - 3)
        + 0.046 * sin(2 * Mj - 6 * Msa - 69)
        + 0.014 * sin(Mj - 3 * Msa + 32);
    } else if (name === 'uranus') {
      lon += 0.040 * sin(Msa - 2 * Mu + 6)
        + 0.035 * sin(Msa - 3 * Mu + 33)
        - 0.015 * sin(Mj - Mu + 20);
    }
    return { lon: rev(lon), lat, r: h.r };
  }

  // פלוטו — נוסחה מקורבת של Schlyter, תקפה ~1800–2050
  function plutoPosition(d) {
    const S = rev(50.03 + 0.033459652 * d);
    const P = rev(238.95 + 0.003968789 * d);
    const lon = 238.9508 + 0.00400703 * d
      - 19.799 * sin(P) + 19.848 * cos(P)
      + 0.897 * sin(2 * P) - 4.956 * cos(2 * P)
      + 0.610 * sin(3 * P) + 1.211 * cos(3 * P)
      - 0.341 * sin(4 * P) - 0.190 * cos(4 * P)
      + 0.128 * sin(5 * P) - 0.034 * cos(5 * P)
      - 0.038 * sin(6 * P) + 0.031 * cos(6 * P)
      + 0.020 * sin(S - P) - 0.010 * cos(S - P);
    return { lon: rev(lon), lat: 0, r: 40 };
  }

  const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const BODY_HE = { sun: 'שמש', moon: 'ירח', mercury: 'מרקורי', venus: 'נוגה', mars: 'מאדים', jupiter: 'צדק', saturn: 'שבתאי', uranus: 'אורנוס', neptune: 'נפטון', pluto: 'פלוטו' };
  const BODY_GLYPH = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇' };

  function longitudeOf(name, d, sun) {
    if (name === 'sun') return sun.lon;
    if (name === 'moon') return moonPosition(d, sun).lon;
    if (name === 'pluto') return plutoPosition(d).lon;
    return planetPosition(name, d, sun).lon;
  }

  // כל האורכים למספר-יום d (שמש עצמאית לכל d — חובה לחישוב מהירות נכון ליד תחנה)
  function rawLongitudes(d) {
    const sun = sunPosition(d);
    const out = {};
    for (const b of BODIES) out[b] = longitudeOf(b, d, sun);
    return out;
  }

  // כל המיקומים לרגע נתון (UTC Date) + מהירות (לזיהוי נסיגה)
  function positions(utc) {
    const d = dayNumber(utc);
    const sun = sunPosition(d);
    const now = rawLongitudes(d);
    const next = rawLongitudes(d + 1);
    const out = {};
    for (const b of BODIES) {
      const lon = now[b];
      const speed = rev180(next[b] - lon);
      out[b] = {
        key: b, name: BODY_HE[b], glyph: BODY_GLYPH[b],
        lon, sign: signIndex(lon), signName: SIGNS_HE[signIndex(lon)],
        signGlyph: SIGN_GLYPH[signIndex(lon)], deg: degInSign(lon),
        formatted: fmtDeg(lon),
        speed, retrograde: speed < 0 && b !== 'sun' && b !== 'moon',
      };
    }
    return { d, sun, bodies: out, obliquity: obliquity(d) };
  }

  // ---------- אופק (Ascendant) ו-Midheaven ----------
  function angles(utc, lat, lonEast) {
    const d = dayNumber(utc);
    const sun = sunPosition(d);
    const UT = utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600;
    const gmst0 = rev(sun.Ls + 180) / 15;          // שעות
    const lst = (gmst0 + UT + lonEast / 15);        // שעות
    const ramc = rev(lst * 15);                     // מעלות — RA של ה-MC
    const eps = obliquity(d);
    let mc = atan2(sin(ramc), cos(ramc) * cos(eps));
    let asc = atan2(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps)));
    return { asc: rev(asc), mc: rev(mc), ramc };
  }

  // ---------- בתים (Whole Sign) ----------
  function houses(ascLon) {
    const first = signIndex(ascLon);
    const cusps = [];
    for (let h = 0; h < 12; h++) cusps.push({ house: h + 1, sign: (first + h) % 12, signName: SIGNS_HE[(first + h) % 12], lon: ((first + h) % 12) * 30 });
    return cusps;
  }
  const houseOf = (lon, ascLon) => ((signIndex(lon) - signIndex(ascLon) + 12) % 12) + 1;

  // ---------- היבטים ----------
  const ASPECTS = [
    { name: 'צמידות', en: 'conjunction', angle: 0, orb: 8, glyph: '☌', tone: 'ניטרלי-מעצים' },
    { name: 'שישית', en: 'sextile', angle: 60, orb: 4, glyph: '⚹', tone: 'הרמוני' },
    { name: 'ריבוע', en: 'square', angle: 90, orb: 6, glyph: '□', tone: 'מתחי' },
    { name: 'משולש', en: 'trine', angle: 120, orb: 7, glyph: '△', tone: 'הרמוני' },
    { name: 'ניגוד', en: 'opposition', angle: 180, orb: 8, glyph: '☍', tone: 'מתחי-מודע' },
  ];
  function aspectsBetween(listA, listB, sameList) {
    const res = [];
    const A = Object.values(listA), B = Object.values(listB);
    for (let i = 0; i < A.length; i++) {
      for (let j = (sameList ? i + 1 : 0); j < B.length; j++) {
        if (sameList && A[i].key === B[j].key) continue;
        const sep = Math.abs(rev180(A[i].lon - B[j].lon));
        for (const asp of ASPECTS) {
          const orbUsed = Math.abs(sep - asp.angle);
          if (orbUsed <= asp.orb) {
            res.push({
              a: A[i].key, aName: A[i].name, b: B[j].key, bName: B[j].name,
              aspect: asp.name, aspectEn: asp.en, glyph: asp.glyph, tone: asp.tone,
              exactAngle: asp.angle, orb: +orbUsed.toFixed(2),
              applying: null,
            });
            break;
          }
        }
      }
    }
    return res.sort((x, y) => x.orb - y.orb);
  }

  // ---------- מופע הירח ----------
  function moonPhase(utc) {
    const d = dayNumber(utc);
    const sun = sunPosition(d);
    const moon = moonPosition(d, sun).lon;
    const elong = rev(moon - sun.lon);
    const names = ['ירח חדש', 'מגל עולה', 'רבע ראשון', 'גיבן עולה', 'ירח מלא', 'גיבן יורד', 'רבע אחרון', 'מגל יורד'];
    const idx = Math.floor((elong + 22.5) / 45) % 8;
    return { elongation: elong, illumination: +((1 - cos(elong)) / 2).toFixed(3), phase: names[idx] };
  }

  // ---------- נומרולוגיה (מספר נתיב חיים) ----------
  function reduce(n) { while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = String(n).split('').reduce((a, c) => a + +c, 0); return n; }
  function numerology(dateStr) {
    const [y, m, dd] = dateStr.split('-').map(Number);
    const lifePath = reduce(reduce(y) + reduce(m) + reduce(dd));
    const MEAN = {
      1: 'עצמאות, מנהיגות, יוזמה', 2: 'שיתוף פעולה, רגישות, איזון',
      3: 'ביטוי, יצירתיות, תקשורת', 4: 'יציבות, מסירות, בנייה',
      5: 'חופש, שינוי, הרפתקה', 6: 'אחריות, טיפוח, הרמוניה',
      7: 'ניתוח, רוחניות, התבוננות', 8: 'שאפתנות, כוח, ניהול',
      9: 'הומניזם, השלמה, נתינה', 11: 'אינטואיציה מוגברת, השראה',
      22: 'הבנאי הגדול, חזון מעשי', 33: 'המורה, אחריות אוהבת',
    };
    return { lifePath, meaning: MEAN[lifePath] || '' };
  }

  // ---------- תאימות מזלות ----------
  const COMPAT = {
    0: { high: ['אריה', 'קשת', 'מאזניים'], low: ['סרטן', 'גדי'] },
    1: { high: ['בתולה', 'גדי', 'סרטן'], low: ['אריה', 'דלי'] },
    2: { high: ['מאזניים', 'דלי', 'אריה'], low: ['בתולה', 'דגים'] },
    3: { high: ['עקרב', 'דגים', 'שור'], low: ['טלה', 'מאזניים'] },
    4: { high: ['טלה', 'קשת', 'תאומים'], low: ['שור', 'עקרב'] },
    5: { high: ['שור', 'גדי', 'סרטן'], low: ['תאומים', 'קשת'] },
    6: { high: ['תאומים', 'דלי', 'קשת'], low: ['סרטן', 'גדי'] },
    7: { high: ['סרטן', 'דגים', 'גדי'], low: ['אריה', 'דלי'] },
    8: { high: ['טלה', 'אריה', 'מאזניים'], low: ['בתולה', 'דגים'] },
    9: { high: ['שור', 'בתולה', 'עקרב'], low: ['טלה', 'סרטן'] },
    10: { high: ['תאומים', 'מאזניים', 'קשת'], low: ['שור', 'עקרב'] },
    11: { high: ['סרטן', 'עקרב', 'גדי'], low: ['תאומים', 'קשת'] },
  };

  // =====================================================================
  //  chart() — המפה המלאה. הקלט תמיד שעון מקומי + היסט מ-UTC.
  // =====================================================================
  function toUTC(o) {
    const local = Date.UTC(o.year, o.month - 1, o.day, o.hour || 0, o.minute || 0, o.second || 0);
    return new Date(local - (o.tzOffset || 0) * 3600 * 1000);
  }

  function chart(input) {
    // input: { year, month, day, hour, minute, tzOffset, lat, lon, place }
    const o = Object.assign({ hour: 12, minute: 0, second: 0, tzOffset: 0, lat: 32.0853, lon: 34.7818 }, input);
    const utc = toUTC(o);
    const pos = positions(utc);
    const ang = angles(utc, o.lat, o.lon);
    const hs = houses(ang.asc);

    const bodies = {};
    for (const k of BODIES) {
      const b = pos.bodies[k];
      bodies[k] = Object.assign({}, b, { house: houseOf(b.lon, ang.asc) });
    }
    const ascObj = {
      key: 'asc', name: 'אופק (Ascendant)', glyph: 'Asc', lon: ang.asc,
      sign: signIndex(ang.asc), signName: SIGNS_HE[signIndex(ang.asc)], deg: degInSign(ang.asc), formatted: fmtDeg(ang.asc),
    };
    const mcObj = {
      key: 'mc', name: 'רום השמיים (MC)', glyph: 'MC', lon: ang.mc,
      sign: signIndex(ang.mc), signName: SIGNS_HE[signIndex(ang.mc)], deg: degInSign(ang.mc), formatted: fmtDeg(ang.mc),
    };

    const aspectList = aspectsBetween(
      Object.assign({}, bodies, { asc: ascObj, mc: mcObj }),
      Object.assign({}, bodies, { asc: ascObj, mc: mcObj }), true);

    const dist = { אש: 0, אדמה: 0, אוויר: 0, מים: 0 };
    const modal = { קרדינלי: 0, קבוע: 0, משתנה: 0 };
    for (const k of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
      dist[ELEMENTS[bodies[k].sign % 4]]++;
      modal[MODALITIES[bodies[k].sign % 3]]++;
    }

    const num = input.date ? numerology(input.date)
      : numerology(`${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`);

    return {
      meta: {
        utc: utc.toISOString(),
        local: `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')} ${String(o.hour).padStart(2, '0')}:${String(o.minute).padStart(2, '0')}`,
        tzOffset: o.tzOffset, lat: o.lat, lon: o.lon, place: o.place || '',
        engine: 'astro.js / Schlyter low-precision', generatedAt: new Date().toISOString(),
      },
      sun: bodies.sun, moon: bodies.moon,
      ascendant: ascObj, midheaven: mcObj,
      bodies, houses: hs, aspects: aspectList,
      balance: { elements: dist, modalities: modal },
      moonPhase: moonPhase(utc),
      numerology: num,
      compatibility: COMPAT[bodies.sun.sign] || null,
    };
  }

  // =====================================================================
  //  transits() — השמיים *עכשיו* (או לתאריך יעד) מול המפה הנטאלית
  // =====================================================================
  function transits(natal, when) {
    const utc = when ? new Date(when) : new Date();
    const pos = positions(utc);
    const natalBodies = {};
    for (const k of BODIES) natalBodies[k] = natal.bodies[k];
    const transitBodies = {};
    for (const k of BODIES) {
      const b = pos.bodies[k];
      transitBodies['t_' + k] = Object.assign({}, b, { key: 't_' + k, name: 'טרנזיט ' + b.name });
    }
    // היבטים בין כוכבי הטרנזיט לכוכבי הלידה
    const hits = [];
    for (const tk of Object.keys(transitBodies)) {
      const t = transitBodies[tk];
      for (const nk of BODIES) {
        const n = natalBodies[nk];
        const sep = Math.abs(rev180(t.lon - n.lon));
        for (const asp of ASPECTS) {
          if (Math.abs(sep - asp.angle) <= (asp.orb - 2 < 1 ? 1 : asp.orb - 2)) {
            hits.push({
              transit: t.name, transitKey: t.key.replace('t_', ''),
              natal: n.name, natalKey: nk,
              aspect: asp.name, glyph: asp.glyph, tone: asp.tone,
              orb: +Math.abs(sep - asp.angle).toFixed(2),
              transitSign: t.signName, retrograde: t.retrograde,
            });
            break;
          }
        }
      }
    }
    hits.sort((a, b) => a.orb - b.orb);
    return {
      when: utc.toISOString(),
      sky: Object.fromEntries(Object.entries(transitBodies).map(([k, v]) => [k.replace('t_', ''), {
        name: v.name.replace('טרנזיט ', ''), sign: v.signName, formatted: v.formatted, retrograde: v.retrograde,
      }])),
      moonPhase: moonPhase(utc),
      hits,
      summary: {
        totalHits: hits.length,
        tightest: hits.slice(0, 5),
        challenging: hits.filter(h => h.tone.includes('מתח')).length,
        harmonious: hits.filter(h => h.tone.includes('הרמונ')).length,
      },
    };
  }

  return {
    SIGNS_HE, SIGNS_EN, SIGN_GLYPH, SIGN_RULER, ELEMENTS, MODALITIES, BODIES, BODY_HE, ASPECTS,
    rev, signIndex, degInSign, fmtDeg,
    dayNumber, obliquity, positions, angles, houses, houseOf,
    aspectsBetween, moonPhase, numerology,
    chart, transits,
    version: '1.0.0',
  };
});
