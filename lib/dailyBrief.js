// "מענה יומי" - מרכז את מצב היום ממקורות רבים לכדי מטען JSON אחד + מחרוזת digest
// שממנה נכתב נרטיב ה-AI. כל מקור ב-Promise.allSettled: כשל של אחד לא מפיל את השאר.
// התוצאה נשמרת במטמון יומי (data/daily-brief-YYYY-MM-DD.json) - הנרטיב יקר מדי לייצור בכל טעינה.

const fs = require("fs");
const path = require("path");

const { DATA_DIR, READY_SUBDIR } = require("./config");
const scanner = require("./scanner");
const { getHebrewCalendarInfo } = require("./hebrewCalendar");
const { getSystemStatus } = require("./systemStatus");
const { getSecurityAlerts } = require("./securityEvents");
const { getRecommendations } = require("./recommendations");
const housing = require("./housingClient");
const narrative = require("./dailyNarrative");
const learningClient = require("./learningClient");
const skyClient = require("./skyClient");
const astroClient = require("./astroClient");
const { getSystemStatusPlus } = require("./systemStatusPlus");
const proverbs = require("./proverbs");
const lottoClient = require("./lottoClient");
const calendarClient = require("./calendarClient");
const { getDailyTips } = require("./dailyTips");

const CALENDAR_STATUS_FILE = path.join(DATA_DIR, "calendar-status.json");
const EMAIL_STATUS_FILE = path.join(DATA_DIR, "email-status.json");
const INBOX_FILE = path.join(DATA_DIR, "n8n-inbox.json");

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cacheFile(key) {
  return path.join(DATA_DIR, `daily-brief-${key}.json`);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ---------- מקורות ----------

function collectCalendar() {
  const status = readJson(CALENDAR_STATUS_FILE);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const all = (status?.events || [])
    .map((ev) => ({ ...ev, _start: ev.start ? new Date(ev.start) : null }))
    .filter((ev) => ev._start && !isNaN(ev._start));

  const isTimed = (s) => typeof s === "string" && s.includes("T");
  const fmt = (ev) =>
    isTimed(ev.start)
      ? ev._start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
      : "כל היום";

  const pick = (ev) => ({ summary: ev.summary, when: fmt(ev), link: ev.link || null, account: ev.account || null });
  return {
    updatedAt: status?.updatedAt || null,
    source: status?.source || null,
    accounts: status?.accounts || (status?.account ? [status.account] : []),
    today: all.filter((ev) => sameDay(ev._start, now)).map(pick),
    tomorrow: all.filter((ev) => sameDay(ev._start, tomorrow)).map(pick)
  };
}

function collectEmail() {
  const status = readJson(EMAIL_STATUS_FILE);
  const maton = require("./matonClient");
  const health = maton.getHealth();
  if (!status) return { configured: maton.isConfigured(), unreadCount: null, recent: [], matonHealth: health };
  return {
    configured: true,
    account: status.account || null,
    accounts: status.accounts || null,
    unreadCount: typeof status.unreadCount === "number" ? status.unreadCount : null,
    sampleSize: status.sampleSize ?? null,
    jobRelatedCount: status.jobRelatedCount ?? 0,
    byCategory: status.byCategory || {},
    byField: status.byField || {},
    updatedAt: status.updatedAt || null,
    source: status.source || null,
    matonHealth: health,
    recent: (status.recentUnread || []).slice(0, 16).map((m) => ({
      subject: m.subject || "(ללא נושא)",
      sender: m.sender || m.from || "",
      link: m.link || null,
      account: m.account || null,
      category: m.category || "other",
      jobRelated: !!m.jobRelated,
      field: m.field || null
    }))
  };
}

// שמות תיקיות שהם ספריות נכסים / מטמון, לא אירועים אמיתיים שממתינים לעיצוב
const NON_EVENT_NAMES = new Set(
  ["originals", "dgthumbs", "thumbs", "thumbnails", "cache", ".thumbnails", "clipart", "קליפ ארט", "מסגרת", "מסגרות", "מסגרות כולם"].map((s) =>
    s.toLowerCase()
  )
);

function looksLikeRealEvent(ev) {
  if (ev.id === "events/__loose__") return false;
  if (ev.photoCount < 5) return false; // קטן מדי מכדי להיות אירוע
  if (NON_EVENT_NAMES.has(ev.name.trim().toLowerCase())) return false;
  return true;
}

// אירועי מגנטים שיש בהם תמונות אך תת-התיקייה "מגנטים-מוכנים" חסרה או ריקה
function collectMagnetEvents() {
  let events = [];
  try {
    events = scanner.scanEvents();
  } catch {
    return { total: 0, pending: [], recentlyReady: [] };
  }

  const pending = [];
  const recentlyReady = [];
  for (const ev of events) {
    if (!looksLikeRealEvent(ev)) continue;
    let readyCount = 0;
    try {
      const dir = scanner.resolveEventDir(ev.id);
      const readyDir = path.join(dir, READY_SUBDIR);
      readyCount = fs
        .readdirSync(readyDir, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name)).length;
    } catch {
      readyCount = 0;
    }
    if (ev.photoCount > 0 && readyCount === 0) {
      pending.push({ name: ev.name, photoCount: ev.photoCount, source: ev.source });
    } else if (readyCount > 0) {
      recentlyReady.push({ name: ev.name, readyCount });
    }
  }
  return { total: events.length, pending: pending.slice(0, 10), recentlyReady: recentlyReady.slice(0, 5) };
}

function collectInbox() {
  const inbox = readJson(INBOX_FILE, []);
  if (!Array.isArray(inbox)) return [];
  return inbox.slice(0, 5).map((e) => ({
    title: e.title || e.type || e.message || "התראה מ-n8n",
    detail: e.detail || e.body || "",
    receivedAt: e.receivedAt || null
  }));
}

async function collectSystem() {
  const sys = await getSystemStatus();
  const warnings = [];
  if (sys.disk && sys.disk.percent >= 88) warnings.push(`הדיסק כמעט מלא - ${sys.disk.freeGB} GB פנויים בלבד`);
  if (sys.memory && sys.memory.percent >= 90) warnings.push(`שימוש זיכרון גבוה - ${sys.memory.percent}%`);
  return {
    memoryPercent: sys.memory?.percent ?? null,
    diskPercent: sys.disk?.percent ?? null,
    diskFreeGB: sys.disk?.freeGB ?? null,
    cpuPercent: sys.cpuPercent ?? null,
    uptimeHours: sys.uptimeHours ?? null,
    warnings
  };
}

async function collectSecurity() {
  const sec = await getSecurityAlerts();
  return {
    status: sec.status,
    count: Array.isArray(sec.events) ? sec.events.length : 0,
    events: (sec.events || []).slice(0, 4).map((e) => ({ id: e.id, time: e.time, message: e.message }))
  };
}

async function collectHousing() {
  const st = await housing.status();
  if (!st.up) return { up: false, base: st.base, listings: [] };
  const listings = await housing.recentListings(10);
  return { up: true, base: st.base, listings };
}

// ---------- הסברים לפריטי לימוד ----------

async function addLearningExplanations(learning) {
  const it = learning.items || {};
  const jobs = [];
  for (const [key, label] of [
    ["mishnah", "משנה"],
    ["tanya", "תניא"],
    ["halacha", "הלכה"]
  ]) {
    const entry = it[key];
    if (entry && entry.text && entry.text.he && !entry.explanation) {
      jobs.push(
        narrative
          .explain(label, `${entry.displayHe}\n${entry.text.he}`)
          .then((ex) => {
            if (ex) entry.explanation = ex;
          })
          .catch(() => {})
      );
    }
  }
  await Promise.allSettled(jobs);
  return learning;
}

// ---------- digest טקסטואלי ל-AI ----------

function buildDigest(p) {
  const L = [];
  L.push(`תאריך: ${p.hebrew?.hebrewDate || ""} · ${new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}`);
  if (p.hebrew?.parasha) L.push(`פרשת השבוע: ${p.hebrew.parasha}`);
  const nextHoliday = (p.hebrew?.holidays || []).find((h) => h.isMajor && h.daysAway >= 0);
  if (nextHoliday) L.push(`מועד קרוב: ${nextHoliday.title} (בעוד ${nextHoliday.daysAway} ימים)`);

  const calSrc = p.calendar.accounts && p.calendar.accounts.length
    ? ` (יומן Maton · ${p.calendar.accounts.join(", ")})`
    : p.calendar.source
      ? " (יומן Maton)"
      : " — יומן לא מחובר ב-Maton";
  L.push(
    p.calendar.today.length
      ? `אירועי יומן היום (${p.calendar.today.length})${calSrc}: ${p.calendar.today.map((e) => `${e.summary} ב-${e.when}`).join("; ")}`
      : `אין אירועי יומן היום${calSrc}.`
  );
  if (p.calendar.tomorrow.length) L.push(`מחר: ${p.calendar.tomorrow.map((e) => e.summary).join("; ")}`);

  if (p.email.matonHealth && p.email.matonHealth.ok === false) {
    L.push(`⚠ ${p.email.matonHealth.error}`);
  } else if (p.email.configured) {
    const job = p.email.jobRelatedCount ? ` (${p.email.jobRelatedCount} על חיפוש עבודה)` : "";
    L.push(`מיילים שלא נקראו: ${p.email.unreadCount ?? p.email.recent.length}${job}${p.email.recent.length ? ` · לאחרונה: ${p.email.recent.slice(0, 4).map((m) => m.subject).join("; ")}` : ""}`);
    const fields = Object.entries(p.email.byField || {}).sort((a, b) => b[1] - a[1]);
    if (fields.length) L.push(`תחומי חיפוש העבודה במיילים: ${fields.map(([f, n]) => `${f} (${n})`).join(", ")}`);
  }

  L.push(
    p.magnets.pending.length
      ? `אירועי מגנטים שממתינים לעיצוב (${p.magnets.pending.length}): ${p.magnets.pending.map((e) => `${e.name} (${e.photoCount} תמונות)`).join("; ")}`
      : "אין אירועי מגנטים שממתינים לעיצוב."
  );

  if (p.inbox.length) L.push(`התראות n8n אחרונות: ${p.inbox.map((i) => i.title).join("; ")}`);

  // לימוד יומי
  if (p.learning?.available) {
    const it = p.learning.items || {};
    if (p.aliyah) L.push(`עליית היום בפרשה: ${p.aliyah.name} (עלייה ${p.aliyah.number})`);
    if (it.mishnah) L.push(`משנה יומית: ${it.mishnah.displayHe}${it.mishnah.text ? ` — "${it.mishnah.text.he.slice(0, 180)}"` : ""}`);
    if (it.dafYomi) L.push(`דף יומי: ${it.dafYomi.displayHe}`);
    if (it.tanya) L.push(`תניא יומי (קבלה): ${it.tanya.displayHe}${it.tanya.text ? ` — "${it.tanya.text.he.slice(0, 180)}"` : ""}`);
    if (it.halacha) L.push(`הלכה יומית: ${it.halacha.displayHe}`);
  }

  // יומן השבוע
  if (p.weekCalendar?.configured) {
    const upcoming = (p.weekCalendar.days || []).flatMap((d) => d.events.map((e) => `${d.weekday}: ${e.summary}`)).slice(0, 6);
    L.push(
      p.weekCalendar.totalEvents
        ? `יומן השבוע (${p.weekCalendar.totalEvents} אירועים, חשבונות: ${p.weekCalendar.accounts.join(", ")}): ${upcoming.join("; ")}`
        : "אין אירועים ביומן השבוע."
    );
  }

  // הגרלה
  if (p.lotto?.available) {
    L.push(
      `הגרלת לוטו קרובה: הגרלה ${p.lotto.nextDraw.id} ב${p.lotto.nextDraw.dateHe} (בעוד ${p.lotto.nextDraw.daysAway} ימים). ` +
        `מספרים חמים לאחרונה: ${p.lotto.hotCold.main.hot.join(", ")}.`
    );
  }

  // המלצות ניהול-יום
  if (p.dayTips?.length) L.push(`המלצות לניהול היום: ${p.dayTips.map((t) => `${t.category} — ${t.text}`).join(" | ")}`);

  // פתגם
  if (p.proverb) L.push(`פתגם היום: "${p.proverb.text}" (${p.proverb.source})`);

  // שמיים
  if (p.sky) {
    if (p.sky.moon) L.push(`הירח: ${p.sky.moon.phaseName}, ${p.sky.moon.illuminationPercent}% מואר, גיל ${p.sky.moon.ageDays} ימים`);
    if (p.sky.dayLength) {
      const dl = p.sky.dayLength;
      L.push(`אורך היום: ${dl.hours} שעות ו-${dl.minutes} דקות${dl.deltaMin != null ? ` (${dl.deltaMin > 0 ? "מתארך" : "מתקצר"} ב-${Math.abs(dl.deltaMin)} דקות מאתמול)` : ""}`);
    }
    if (p.sky.visiblePlanets?.length) L.push(`כוכבי לכת נראים הערב: ${p.sky.visiblePlanets.map((pl) => pl.name).join(", ")}`);
  }

  // שבת
  if (p.shabbat?.available && p.shabbat.candleLighting) {
    const s = p.shabbat;
    if (s.isShabbatNow) {
      L.push(`שבת עכשיו — הבדלה ב-${s.havdalah?.timeStr || "?"} (${s.havdalah?.dateHe || ""}).`);
    } else {
      L.push(`כניסת שבת: ${s.candleLighting.timeStr} (${s.candleLighting.dateHe})${s.parasha ? ", פרשת " + s.parasha.replace(/^פָּרָשַׁת\s*/, "") : ""}. יציאת שבת: ${s.havdalah?.timeStr || "?"}.`);
    }
    if (s.upcoming?.length) {
      const u = s.upcoming[0];
      if (/חג|ראש השנה|כיפור|סוכות|פסח|שבועות/i.test(u.reason || "")) L.push(`מתקרב: ${u.reason} — הדלקת נרות ${u.timeStr} (${u.dateHe}).`);
    }
  }

  // מזל
  if (p.astro?.transits) {
    const t = p.astro.transits;
    L.push(`מזל היום: השמש ב${t.sunSign.name}, הירח ב${t.moonSign.name}`);
    if (p.astro.configured && t.aspects?.length) {
      L.push(`היבטים אסטרולוגיים בולטים היום מול מפת הלידה: ${t.aspects.slice(0, 3).map((a) => `${a.transiting} ב${a.aspect} ל${a.natalPoint}`).join("; ")}`);
    }
  }

  // מערכת
  if (p.system.warnings.length) L.push(`אזהרות מערכת: ${p.system.warnings.join("; ")}`);
  if (p.systemPlus) {
    const sp = p.systemPlus;
    const bits = [];
    if (sp.battery) bits.push(`סוללה ${sp.battery.percent}%${sp.battery.plugged ? " (בטעינה)" : ""}`);
    if (sp.drives?.length) bits.push(sp.drives.map((d) => `${d.letter} ${d.percent}% בשימוש`).join(", "));
    if (sp.topProcess) bits.push(`התהליך הכבד ביותר: ${sp.topProcess.name} (${sp.topProcess.memMB} MB)`);
    if (sp.network) bits.push(sp.network.online ? "אינטרנט מחובר" : "אין אינטרנט");
    if (bits.length) L.push(`מצב מערכת מורחב: ${bits.join(" · ")}`);
    if (sp.warnings?.length) L.push(`אזהרות מערכת נוספות: ${sp.warnings.join("; ")}`);
  }
  if (p.security.count > 0) L.push(`אירועי אבטחה ב-24 השעות האחרונות: ${p.security.count}`);
  if (p.housing.up && p.housing.listings.length) L.push(`דיור: ${p.housing.listings.length} נכסים חדשים במערכת DiraFinder.`);

  return L.join("\n");
}

// ---------- הרכבה ----------

let inFlight = null;

async function buildBrief({ refresh = false, withNarrative = true } = {}) {
  const key = todayKey();
  const file = cacheFile(key);

  if (!refresh) {
    const cached = readJson(file);
    if (cached) return cached;
    // בקשה מקבילה בזמן שהמטמון עדיין נבנה - מחזירים את אותה הבטחה במקום לייצר פעמיים
    if (inFlight) return inFlight;
  }

  const run = generateBrief({ key, file, withNarrative });
  if (!refresh) {
    inFlight = run.finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  return run;
}

async function generateBrief({ key, file, withNarrative }) {
  const [hebrew, calendar, email, magnets, inbox, system, security, hous, learning, sky, astro, systemPlus, proverb, recs, lotto, weekCal, shabbat, library, tehillim] =
    await Promise.allSettled([
      getHebrewCalendarInfo(),
      Promise.resolve(collectCalendar()),
      Promise.resolve(collectEmail()),
      Promise.resolve(collectMagnetEvents()),
      Promise.resolve(collectInbox()),
      collectSystem(),
      collectSecurity(),
      collectHousing(),
      learningClient.getDailyLearning(),
      skyClient.getSky(),
      Promise.resolve().then(() => astroClient.getReading()),
      getSystemStatusPlus(),
      Promise.resolve().then(() => proverbs.getDailyProverb()),
      getRecommendations(),
      lottoClient.getLotto(),
      calendarClient.getWeek(),
      require("./shabbatClient").getShabbatTimes(),
      require("./holidayResources").active(),
      require("./tehillim").getDailyChapters()
    ]);

  const val = (r, fb) => (r.status === "fulfilled" ? r.value : fb);

  const payload = {
    date: key,
    generatedAt: new Date().toISOString(),
    hebrew: val(hebrew, null),
    calendar: val(calendar, { today: [], tomorrow: [] }),
    email: val(email, { configured: false, recent: [] }),
    magnets: val(magnets, { total: 0, pending: [], recentlyReady: [] }),
    inbox: val(inbox, []),
    system: val(system, { warnings: [] }),
    security: val(security, { status: "unavailable", count: 0, events: [] }),
    housing: val(hous, { up: false, listings: [] }),
    learning: val(learning, { available: false }),
    aliyah: learningClient.aliyahOfToday(),
    sky: val(sky, null),
    astro: val(astro, { configured: false, transits: null }),
    systemPlus: val(systemPlus, null),
    proverb: val(proverb, null),
    recommendations: val(recs, []),
    lotto: val(lotto, { available: false }),
    weekCalendar: val(weekCal, { configured: false, days: [] }),
    shabbat: val(shabbat, { available: false }),
    library: val(library, []),
    tehillim: val(tehillim, null),
    dayTips: getDailyTips(new Date(), 3),
    errors: []
  };
  [
    ["hebrew", hebrew],
    ["calendar", calendar],
    ["email", email],
    ["magnets", magnets],
    ["inbox", inbox],
    ["system", system],
    ["security", security],
    ["housing", hous],
    ["learning", learning],
    ["sky", sky],
    ["astro", astro],
    ["systemPlus", systemPlus],
    ["proverb", proverb],
    ["lotto", lotto],
    ["weekCalendar", weekCal],
    ["shabbat", shabbat]
  ].forEach(([name, r]) => {
    if (r.status === "rejected") payload.errors.push(`${name}: ${r.reason?.message || r.reason}`);
  });

  // הסברים קצרים בעברית לפריטי הלימוד (פעם ביום, נשמר במטמון)
  if (withNarrative && payload.learning?.available) {
    payload.learning = await addLearningExplanations(payload.learning);
  }

  payload.digest = buildDigest(payload);

  if (withNarrative) {
    try {
      const n = await narrative.narrate(payload.digest);
      payload.narrative = n ? n.text : null;
      payload.narrativeSource = n ? n.source : null;
    } catch (err) {
      payload.narrative = null;
      payload.narrativeSource = null;
      payload.errors.push(`narrative: ${err.message}`);
    }
  } else {
    payload.narrative = null;
    payload.narrativeSource = null;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
    cleanupOldCaches(key);
  } catch {
    /* מטמון הוא נוחות בלבד - אם הכתיבה נכשלת, עדיין מחזירים את המטען */
  }

  return payload;
}

// שומרים רק את 7 הימים האחרונים של קבצי מטמון
function cleanupOldCaches(currentKey) {
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => /^daily-brief-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    const keep = new Set(files.slice(-7));
    keep.add(`daily-brief-${currentKey}.json`);
    for (const f of files) {
      if (!keep.has(f)) fs.unlinkSync(path.join(DATA_DIR, f));
    }
  } catch {
    /* ניקוי הוא bonus */
  }
}

module.exports = { buildBrief };
