// טעינת משתני סביבה מקובץ .env אם קיים (לא חובה — אפשר גם setx/export).
try { require("dotenv").config(); } catch { /* dotenv אופציונלי */ }

const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  MAGNET_ROOT,
  EVENTS_DIR,
  FRAMES_DIR,
  CLIPART_DIR,
  READY_SUBDIR,
  APPS,
  PORT,
  IS_CONFIGURED,
  readUserConfig,
  writeUserConfig
} = require("./lib/config");
const { launchApp } = require("./lib/launcher");
const scanner = require("./lib/scanner");
const { safeJoin } = require("./lib/safepath");
const { discoverApps } = require("./lib/appDiscovery");
const { scanSystemApps } = require("./lib/systemApps");
const { CATEGORY_ORDER } = require("./lib/categoryRules");
const { getSystemStatus } = require("./lib/systemStatus");
const { getOutlookInboxSummary } = require("./lib/outlookStatus");
const { getHebrewCalendarInfo } = require("./lib/hebrewCalendar");
const { listPrinters } = require("./lib/printers");
const { getSecurityAlerts } = require("./lib/securityEvents");
const { getRecommendations } = require("./lib/recommendations");
const maton = require("./lib/matonClient");
const liveSync = require("./lib/liveSync");
const aiPanel = require("./lib/aiPanel");
const { buildBrief } = require("./lib/dailyBrief");
const jarvis = require("./lib/jarvisClient");
const housing = require("./lib/housingClient");
const astroConfig = require("./lib/astroConfig");
const dockerServices = require("./lib/dockerServices");
const calendarClient = require("./lib/calendarClient");

const app = express();
app.set("trust proxy", 1); // מאחורי proxy של שירות אחסון (Render/Railway) — לזיהוי https נכון
app.use(express.json({ limit: "45mb" }));

// ---------- הזדהות אופציונלית (מופעלת רק כשמוגדרת סיסמה — ראו lib/auth.js) ----------
const auth = require("./lib/auth");
app.get("/api/auth/status", (req, res) => res.json({ enabled: auth.config().enabled, authed: auth.isAuthed(req) }));
app.post("/api/auth/login", (req, res) => {
  if (!auth.config().enabled) return res.json({ ok: true, disabled: true });
  if (!auth.checkPassword((req.body || {}).password)) {
    return res.status(401).json({ ok: false, error: "סיסמה שגויה" });
  }
  auth.setSession(res);
  res.json({ ok: true });
});
app.post("/api/auth/logout", (req, res) => { auth.clearSession(res); res.json({ ok: true }); });
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
// בדיקת חיות לשירות האחסון — לפני שער ההזדהות
app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));
app.use(auth.gate);

// אפליקציה מקומית שמתעדכנת תדיר - מכריחים את הדפדפן לאמת מול השרת בכל טעינה
// (מונע את "צריך hard-refresh אחרי עדכון").
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    lastModified: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (/\.(js|css|html)$/i.test(filePath)) res.setHeader("Cache-Control", "no-cache");
      if (/\.webmanifest$/i.test(filePath)) res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      // מאפשר ל-Service Worker לשלוט על כל ה-scope גם כשמוגש מ-/sw.js
      if (/[\\/]sw\.js$/i.test(filePath)) res.setHeader("Service-Worker-Allowed", "/");
    }
  })
);

const DATA_DIR = path.join(__dirname, "data");
const INBOX_FILE = path.join(DATA_DIR, "n8n-inbox.json");
const EMAIL_STATUS_FILE = path.join(DATA_DIR, "email-status.json");
const CALENDAR_STATUS_FILE = path.join(DATA_DIR, "calendar-status.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(INBOX_FILE)) fs.writeFileSync(INBOX_FILE, "[]", "utf8");
if (!fs.existsSync(EMAIL_STATUS_FILE)) fs.writeFileSync(EMAIL_STATUS_FILE, "null", "utf8");
if (!fs.existsSync(CALENDAR_STATUS_FILE)) fs.writeFileSync(CALENDAR_STATUS_FILE, "null", "utf8");

// ---------- הגדרת מערכת (מסך התקנה - הופך את המערכת לניידת בין מחשבים) ----------

app.get("/api/setup/status", (req, res) => {
  const cfg = readUserConfig() || {};
  res.json({
    configured: IS_CONFIGURED,
    magnetRoot: cfg.magnetRoot || null,
    quickLaunchApps: cfg.quickLaunchApps || []
  });
});

app.get("/api/setup/validate-folder", (req, res) => {
  const p = req.query.path;
  if (!p || !p.trim()) return res.json({ ok: false, error: "נא להזין נתיב" });
  try {
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) return res.json({ ok: false, error: "הנתיב הזה אינו תיקייה" });
    const entryCount = fs.readdirSync(p).length;
    res.json({ ok: true, entryCount });
  } catch {
    res.json({ ok: false, error: "התיקייה לא נמצאה בנתיב הזה" });
  }
});

app.post("/api/setup/save", (req, res) => {
  const { magnetRoot, quickLaunchApps } = req.body || {};
  const cleanApps = Array.isArray(quickLaunchApps)
    ? quickLaunchApps
        .filter((a) => a && a.key && a.exe)
        .map((a) => ({ key: a.key, label: a.label || a.key, description: a.description || "", exe: a.exe }))
    : [];
  writeUserConfig({ magnetRoot: magnetRoot && magnetRoot.trim() ? magnetRoot.trim() : null, quickLaunchApps: cleanApps });
  res.json({ ok: true });
});

// ---------- גיבוי / העברה בין מחשבים (המערכת מקומית — אין ענן) ----------

const backup = require("./lib/backup");
const os = require("os");

app.get("/api/backup/export", (req, res) => {
  const bundle = backup.exportAll();
  const fname = `magnet-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.send(JSON.stringify(bundle, null, 2));
});

app.post("/api/backup/import", (req, res) => {
  try {
    res.json(backup.importAll(req.body));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// כתובת ה-LAN + כתובת מלאה להתקנת ה-PWA בטלפון (אותה רשת Wi-Fi)
app.get("/api/network/access", (req, res) => {
  const ifaces = os.networkInterfaces();
  const raw = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal && !/^169\.254\./.test(ni.address)) {
        raw.push({ name, address: ni.address });
      }
    }
  }
  // דירוג: רשת ביתית אמיתית (192.168.1-55 / 10.x) לפני מתאמים וירטואליים (WSL/Docker/VirtualBox)
  const score = ({ name, address }) => {
    let s = 0;
    if (/^192\.168\.(?!56\.)/.test(address)) s += 100;
    else if (/^10\./.test(address)) s += 90;
    else if (/^192\.168\.56\./.test(address)) s += 20; // VirtualBox host-only
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) s += 10; // בד"כ Docker/WSL
    if (/vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|Docker/i.test(name)) s -= 50;
    if (/Wi-?Fi|Wireless|Ethernet|eth0|en0|wlan/i.test(name)) s += 15;
    return s;
  };
  const addrs = raw.sort((a, b) => score(b) - score(a)).map((x) => x.address);
  const port = process.env.PORT || 4420;
  const primary = addrs[0] || null;
  const inDocker = fs.existsSync("/.dockerenv") || process.env.DISABLE_DOCKER_ORCHESTRATION === "1";
  res.json({
    port: Number(port),
    addresses: addrs,
    inDocker,
    lanUrl: primary ? `http://${primary}:${port}/daily.html` : null,
    hostname: os.hostname(),
    hint: inDocker
      ? "רץ בתוך Docker — הכתובת שמוצגת היא של הקונטיינר. לטלפון: השתמשו בכתובת ה-IP של המחשב-המארח (למשל " + (primary && primary.startsWith("192.") ? primary : "192.168.x.x") + ") עם הפורט " + port + "."
      : primary
        ? "פתחו בטלפון (על אותה רשת Wi-Fi) את הכתובת הזו ואז 'הוסף למסך הבית'. אם לא נטען — פתחו את פורט " + port + " ב-Firewall."
        : "לא נמצאה כתובת רשת מקומית — ודאו שהמחשב מחובר לרשת."
  });
});

// קוד QR (PNG) לכתובת ה-LAN — לסריקה מהטלפון והתקנה כאפליקציה
app.get("/api/network/qr", async (req, res) => {
  try {
    const ifaces = os.networkInterfaces();
    let primary = null, best = -1;
    for (const [name, list] of Object.entries(ifaces)) {
      for (const ni of list || []) {
        if (ni.family !== "IPv4" || ni.internal || /^169\.254\./.test(ni.address)) continue;
        let s = /^192\.168\.(?!56\.)/.test(ni.address) ? 100 : /^10\./.test(ni.address) ? 90 : /^172\.(1[6-9]|2\d|3[01])\./.test(ni.address) ? 10 : 0;
        if (/vEthernet|WSL|VirtualBox|VMware|Hyper-V|Docker/i.test(name)) s -= 50;
        if (s > best) { best = s; primary = ni.address; }
      }
    }
    const port = process.env.PORT || 4420;
    const target = req.query.url || (primary ? `http://${primary}:${port}/daily.html` : `http://localhost:${port}/daily.html`);
    const png = await require("qrcode").toBuffer(target, { width: 320, margin: 2, color: { dark: "#1b1611", light: "#f1e7d4" } });
    res.set("Content-Type", "image/png").set("Cache-Control", "no-store").set("X-QR-Target", encodeURIComponent(target)).send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// פתיחת גישה לטלפון — מריץ את סקריפט העזר עם הרשאות מנהל (יופיע חלון UAC במחשב)
app.post("/api/network/open-access", (req, res) => {
  const ps1 = path.join(__dirname, "install", "allow-firewall.ps1");
  if (!fs.existsSync(ps1)) return res.status(404).json({ error: "install/allow-firewall.ps1 חסר" });
  try {
    const { spawn } = require("child_process");
    // Start-Process ... -Verb RunAs → מקפיץ UAC על שולחן העבודה של המשתמש
    const child = spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${ps1.replace(/'/g, "''")}'`
    ], { windowsHide: true, detached: true, stdio: "ignore" });
    child.unref();
    res.json({ ok: true, message: "אמור להופיע חלון אישור (UAC) במחשב — אשרו אותו." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- תוכנות ----------

app.get("/api/apps", async (req, res) => {
  const curated = Object.entries(APPS).map(([key, a]) => ({
    key,
    label: a.label,
    description: a.description,
    icon: null,
    installed: fs.existsSync(a.exe),
    auto: false
  }));

  let discovered = [];
  try {
    discovered = await discoverApps();
  } catch {
    /* גילוי אוטומטי נכשל - התוכנות המוגדרות מראש עדיין יעבדו */
  }
  const auto = discovered.map((a) => ({
    key: a.key,
    label: a.label,
    description: a.description,
    icon: a.icon,
    installed: true,
    auto: true
  }));

  res.json([...curated, ...auto]);
});

// כל התוכנות המותקנות במחשב (תפריט התחלה), מסווגות לפי קטגוריה
app.get("/api/system-apps", async (req, res) => {
  let apps = [];
  try {
    apps = await scanSystemApps();
  } catch {
    /* הסריקה נכשלה - מחזירים רשימה ריקה במקום לקרוס */
  }

  const byCategory = new Map(CATEGORY_ORDER.map((c) => [c.key, { ...c, apps: [] }]));
  for (const a of apps) {
    if (byCategory.has(a.category)) byCategory.get(a.category).apps.push(a);
  }

  res.json({
    scannedAt: new Date().toISOString(),
    total: apps.length,
    categories: [...byCategory.values()].filter((c) => c.apps.length > 0)
  });
});

app.post("/api/launch", (req, res) => {
  const { app: appKey, filePath } = req.body || {};
  let absoluteFile = null;
  if (filePath) {
    try {
      absoluteFile = path.isAbsolute(filePath) ? filePath : safeJoin(MAGNET_ROOT, filePath);
    } catch {
      return res.status(400).json({ ok: false, error: "נתיב קובץ לא חוקי" });
    }
  }
  const result = launchApp(appKey, absoluteFile);
  res.status(result.ok ? 200 : 400).json(result);
});

// ---------- אירועים ותמונות ----------

app.get("/api/events", (req, res) => {
  res.json(scanner.scanEvents());
});

app.get("/api/events/:eventId(*)/files", (req, res) => {
  try {
    const files = scanner.listEventFiles(req.params.eventId);
    res.json(files);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// הגשת תמונת אירוע בפועל (עם הגנת path traversal)
app.get("/media/event/:eventId(*)", (req, res) => {
  const { eventId } = req.params;
  const relFile = req.query.file;
  if (!relFile) return res.status(400).send("חסר פרמטר file");
  try {
    const dir = scanner.resolveEventDir(eventId);
    const full = safeJoin(dir, relFile);
    if (!fs.existsSync(full)) return res.status(404).send("הקובץ לא נמצא");
    res.sendFile(full);
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// ---------- מסגרות וקליפ-ארט ----------

app.get("/api/frames", (req, res) => {
  res.json(scanner.listFrames());
});

app.get("/media/frame/:name", (req, res) => {
  try {
    const full = safeJoin(FRAMES_DIR, req.params.name);
    if (!fs.existsSync(full)) return res.status(404).send("לא נמצא");
    res.sendFile(full);
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.get("/api/clipart", (req, res) => {
  res.json(scanner.listClipart());
});

app.get("/media/clipart/:name", (req, res) => {
  try {
    const full = safeJoin(CLIPART_DIR, req.params.name);
    if (!fs.existsSync(full)) return res.status(404).send("לא נמצא");
    res.sendFile(full);
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// ---------- מצב מערכת (זיכרון, דיסק, מעבד) ----------

app.get("/api/system/status", async (req, res) => {
  try {
    res.json(await getSystemStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- מצב מיילים (מתעדכן אוטומטית מ-Outlook המקומי, או ידנית / דרך n8n) ----------

function writeEmailStatus({ account, unreadCount, recentUnread, source }) {
  const data = {
    account: account || null,
    unreadCount,
    recentUnread: Array.isArray(recentUnread) ? recentUnread.slice(0, 10) : [],
    source: source || "api",
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(EMAIL_STATUS_FILE, JSON.stringify(data, null, 2), "utf8");
  return data;
}

app.get("/api/email/status", (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(EMAIL_STATUS_FILE, "utf8")));
  } catch {
    res.json(null);
  }
});

app.post("/api/email/status", (req, res) => {
  const { account, unreadCount, recentUnread, source } = req.body || {};
  if (typeof unreadCount !== "number") {
    return res.status(400).json({ ok: false, error: "unreadCount חייב להיות מספר" });
  }
  writeEmailStatus({ account, unreadCount, recentUnread, source });
  res.json({ ok: true });
});

// סריקת Outlook המקומי - רץ אוטומטית כל 5 דקות (ראו runOutlookScan למטה), וגם ניתן להפעיל ידנית
app.post("/api/outlook/scan-now", async (req, res) => {
  const summary = await getOutlookInboxSummary();
  if (!summary) {
    return res.status(502).json({ ok: false, error: "לא הצלחתי להתחבר ל-Outlook. ודאו שהוא מותקן ומוגדר עם חשבון." });
  }
  const data = writeEmailStatus(summary);
  res.json({ ok: true, data });
});

// ---------- לוח שנה עברי (פרשת השבוע, חגים ומועדים) - מחושב מקומית, תמיד חי ----------

app.get("/api/hebrew-calendar/today", async (req, res) => {
  try {
    res.json(await getHebrewCalendarInfo());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- יומן (אירועים קרובים) - מתעדכן ידנית או דרך n8n ----------

app.get("/api/calendar/status", (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(CALENDAR_STATUS_FILE, "utf8")));
  } catch {
    res.json(null);
  }
});

app.post("/api/calendar/status", (req, res) => {
  const { account, events, source } = req.body || {};
  if (!Array.isArray(events)) {
    return res.status(400).json({ ok: false, error: "events חייב להיות מערך" });
  }
  const data = {
    account: account || null,
    events: events.slice(0, 30),
    source: source || "api",
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(CALENDAR_STATUS_FILE, JSON.stringify(data, null, 2), "utf8");
  res.json({ ok: true });
});

// ---------- מדפסות מותקנות במחשב (מידע בלבד - ההדפסה עצמה עוברת דרך תיבת ההדפסה של הדפדפן) ----------

app.get("/api/printers", async (req, res) => {
  try {
    res.json(await listPrinters());
  } catch {
    res.json([]);
  }
});

// ---------- התראות אבטחה (יומן האבטחה של Windows - כניסות כושלות, נעילות, חשבונות חדשים) ----------

app.get("/api/security/alerts", async (req, res) => {
  try {
    res.json(await getSecurityAlerts());
  } catch (err) {
    res.status(500).json({ status: "unavailable", events: [], error: err.message });
  }
});

// ---------- המלצות לשיפור המערכת - נבדק מול המצב האמיתי הנוכחי ----------

app.get("/api/recommendations", async (req, res) => {
  try {
    res.json(await getRecommendations());
  } catch (err) {
    res.status(500).json([]);
  }
});

// ---------- Maton (שער מאוחד ל-Gmail/Drive/Calendar/Slack/YouTube) ----------
// המפתח נקרא רק מ-process.env.MATON_API_KEY - לעולם לא מהבקשה או מקובץ בפרויקט.

app.get("/api/maton/status", async (req, res) => {
  if (!maton.isConfigured()) return res.json({ configured: false, connections: [] });
  try {
    const result = await maton.listConnections();
    res.json({ configured: true, connections: result?.connections || result?.data || [] });
  } catch (err) {
    res.json({ configured: true, connections: [], error: err.message });
  }
});

// בריאות המפתח — מסביר "מפתח לא תקין" במקום להראות מיילים/יומן ריקים
app.get("/api/maton/health", async (req, res) => {
  if (maton.isConfigured() && maton.getHealth().ok === null) {
    try { await maton.listConnections(); } catch { /* noteResult כבר עדכן */ }
  }
  res.json(maton.getHealth());
});

app.post("/api/maton/connect", async (req, res) => {
  const { app: appName } = req.body || {};
  if (!appName) return res.status(400).json({ ok: false, error: "נא לציין app" });
  if (!maton.isConfigured()) return res.status(400).json({ ok: false, error: "MATON_API_KEY אינו מוגדר בשרת" });
  try {
    const result = await maton.createConnection(appName);
    res.json({ ok: true, url: result?.url || result?.data?.url || null, raw: result });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get("/api/maton/summary", async (req, res) => {
  if (!maton.isConfigured()) return res.json({ configured: false });

  // צריך את ה-team_id של סלאק כדי לבנות קישורים אמיתיים לערוצים
  let slackTeamId = null;
  try {
    const connResult = await maton.listConnections();
    const list = connResult?.connections || connResult?.data || [];
    const slackConn = list.find((c) => c.app === "slack" && c.status === "ACTIVE");
    slackTeamId = slackConn?.metadata?.team_id || null;
  } catch {
    /* אם זה נכשל, פשוט לא נבנה קישורי סלאק */
  }

  const summary = {
    configured: true,
    gmail: { items: [], count: null },
    drive: { items: [], count: null },
    calendar: { items: [], count: null },
    slack: { items: [], count: null },
    youtube: { items: [], count: null },
    errors: []
  };

  await Promise.all([
    maton.gmailListMessagesDetailed("is:unread", 8).then((r) => {
      summary.gmail = {
        count: r.resultSizeEstimate ?? r.messages.length,
        items: r.messages.map((m) => ({ title: m.subject, sub: m.from, link: m.link }))
      };
    }).catch((e) => summary.errors.push(`gmail: ${e.message}`)),

    maton.driveListFiles(8).then((r) => {
      const files = r.files || [];
      summary.drive = {
        count: files.length,
        items: files.map((f) => ({ title: f.name, sub: f.mimeType?.split(".").pop() || "", link: f.webViewLink }))
      };
    }).catch((e) => summary.errors.push(`drive: ${e.message}`)),

    maton.calendarListEvents(8).then((r) => {
      const items = r.items || [];
      summary.calendar = {
        count: items.length,
        items: items.map((ev) => ({ title: ev.summary || "(ללא כותרת)", sub: ev.start?.dateTime || ev.start?.date || "", link: ev.htmlLink }))
      };
    }).catch((e) => summary.errors.push(`calendar: ${e.message}`)),

    maton.slackListChannels().then((r) => {
      const channels = r.channels || [];
      summary.slack = {
        count: channels.length,
        items: channels.map((c) => ({
          title: `#${c.name}`,
          sub: c.is_member ? "חבר בערוץ" : "לא חבר",
          link: slackTeamId ? `https://app.slack.com/client/${slackTeamId}/${c.id}` : null
        }))
      };
    }).catch((e) => summary.errors.push(`slack: ${e.message}`)),

    maton.youtubeSubscriptions(8).then((r) => {
      const items = r.items || [];
      summary.youtube = {
        count: r.pageInfo?.totalResults ?? items.length,
        items: items.map((s) => ({
          title: s.snippet?.title || "",
          sub: "ערוץ במעקב",
          link: s.snippet?.resourceId?.channelId ? `https://www.youtube.com/channel/${s.snippet.resourceId.channelId}` : null
        }))
      };
    }).catch((e) => summary.errors.push(`youtube: ${e.message}`))
  ]);

  res.json(summary);
});

// ---------- סנכרון חי (מיילים + יומן דרך Maton, מתעדכן אוטומטית כל הזמן) ----------

app.get("/api/sync/status", (req, res) => {
  res.json({
    enabled: maton.isConfigured(),
    intervalMinutes: liveSync.intervalMinutes(),
    ...(liveSync.getStatus() || {})
  });
});

app.post("/api/sync/now", async (req, res) => {
  try {
    const result = await liveSync.runOnce();
    res.status(result.ok || result.skipped ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- פאנל AI מרובה - שאלה אחת לכל המקורות הזמינים במקביל ----------

app.get("/api/ai/sources", async (req, res) => {
  try {
    res.json({ sources: await aiPanel.listSources() });
  } catch (err) {
    res.status(500).json({ sources: [], error: err.message });
  }
});

app.post("/api/ai/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ ok: false, error: "נא לכתוב שאלה" });
  try {
    const answers = await aiPanel.askAll(question.trim());
    const synthesized = await aiPanel.synthesize(question.trim(), answers);
    res.json({ ok: true, answers, synthesized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- שמירת עיצוב שנערך ----------

app.post("/api/editor/save", (req, res) => {
  const { eventId, fileName, dataUrl } = req.body || {};
  if (!eventId || !fileName || !dataUrl) {
    return res.status(400).json({ ok: false, error: "חסרים פרטים לשמירה" });
  }
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ ok: false, error: "פורמט תמונה לא נתמך (נדרש PNG)" });

  try {
    const dir = scanner.resolveEventDir(eventId);
    const readyDir = safeJoin(dir, READY_SUBDIR);
    if (!fs.existsSync(readyDir)) fs.mkdirSync(readyDir, { recursive: true });
    const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
    const outPath = safeJoin(readyDir, safeName.endsWith(".png") ? safeName : `${safeName}.png`);
    fs.writeFileSync(outPath, Buffer.from(match[1], "base64"));
    res.json({ ok: true, savedTo: outPath });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ---------- אינטגרציית n8n ----------

// n8n (או הדשבורד) קורא לנקודת קצה זו כדי לקבל תמונת מצב עדכנית של כל התיקיות
app.get("/api/n8n/scan", (req, res) => {
  res.json(scanner.fullScan());
});

// n8n יכול לדחוף הודעות/התראות בחזרה לדשבורד (למשל "אירוע חדש התגלה")
app.post("/api/n8n/notify", (req, res) => {
  const entry = { ...req.body, receivedAt: new Date().toISOString() };
  const inbox = JSON.parse(fs.readFileSync(INBOX_FILE, "utf8"));
  inbox.unshift(entry);
  fs.writeFileSync(INBOX_FILE, JSON.stringify(inbox.slice(0, 50), null, 2), "utf8");
  res.json({ ok: true });
});

app.get("/api/n8n/inbox", (req, res) => {
  res.json(JSON.parse(fs.readFileSync(INBOX_FILE, "utf8")));
});

// ---------- מענה יומי (סיכום מובנה + נרטיב AI, נפתח אוטומטית בהפעלת המחשב) ----------

app.get("/api/daily-brief", async (req, res) => {
  try {
    const refresh = req.query.refresh === "1" || req.query.refresh === "true";
    const brief = await buildBrief({ refresh });
    res.json(brief);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- יומן שבועי (משולב מכל חשבונות Google Calendar ב-Maton) ----------

app.get("/api/calendar/week", async (req, res) => {
  try {
    res.json(await calendarClient.getWeek());
  } catch (err) {
    res.status(500).json({ configured: false, days: [], error: err.message });
  }
});

// ---------- הגרלה קרובה (גם ל-workflow ב-n8n) ----------

app.get("/api/lotto", async (req, res) => {
  try {
    res.json(await require("./lib/lottoClient").getLotto());
  } catch (err) {
    res.status(502).json({ available: false, error: err.message });
  }
});

// ---------- תהילים יומי (לפי ימי החודש) ----------
app.get("/api/tehillim", async (req, res) => {
  try {
    res.json(await require("./lib/tehillim").getDailyTehillim());
  } catch (err) {
    res.status(502).json({ available: false, error: err.message });
  }
});

// ---------- שוק ההון (מידע בלבד — לא ייעוץ) ----------
app.get("/api/market", async (req, res) => {
  try {
    res.json(await require("./lib/marketData").getMarket());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
app.get("/api/market/news", async (req, res) => {
  try {
    res.json({ items: await require("./lib/marketData").getMarketNews() });
  } catch (err) {
    res.status(502).json({ items: [], error: err.message });
  }
});
app.get("/api/market/outlook", async (req, res) => {
  try {
    res.json(await require("./lib/marketData").getMarketOutlook());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
app.get("/api/market/lookup", async (req, res) => {
  try {
    res.json(await require("./lib/marketData").lookupTicker(req.query.symbol || ""));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- מצפן פיננסי (חינוכי — לא ייעוץ השקעות) ----------
app.post("/api/finance/metrics", (req, res) => {
  res.json({ metrics: require("./lib/financeAdvisor").computeMetrics(req.body || {}) });
});
app.post("/api/finance/analyze", async (req, res) => {
  try {
    res.json(await require("./lib/financeAdvisor").analyze(req.body || {}));
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ---------- פרופיל נייד (שם תצוגה שמתאים למחשב) ----------
app.get("/api/profile", (req, res) => res.json(require("./lib/profile").read()));
app.post("/api/profile", (req, res) => {
  try { res.json(require("./lib/profile").write(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ---------- פס תחתון: חדשות רצות + המלצת יום + טראק מוזיקה ----------

app.get("/api/news", async (req, res) => {
  try {
    res.json(await require("./lib/newsClient").getNews());
  } catch (err) {
    res.status(502).json({ items: [], error: err.message });
  }
});

app.get("/api/dockbar", (req, res) => {
  try {
    res.json(require("./lib/dockbarData").getDockbar());
  } catch (err) {
    res.status(500).json({ tip: null, ambient: null, error: err.message });
  }
});

// ---------- אוצר קבצים לחגים ולתאריכים ----------
app.get("/api/library", async (req, res) => {
  try {
    const hr = require("./lib/holidayResources");
    const [active, holidays] = await Promise.all([hr.active(), hr.upcomingHolidays().catch(() => [])]);
    res.json({ resources: hr.list(), active, holidays });
  } catch (err) {
    res.status(500).json({ resources: [], active: [], holidays: [], error: err.message });
  }
});

// ---------- הקראה בעברית בקול נשי (לצ'אט הקולי של JARVIS) ----------

app.get("/api/tts/status", (req, res) => {
  try { res.json(require("./lib/ttsClient").status()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post("/api/tts/config", (req, res) => {
  try { res.json(require("./lib/ttsClient").setAzure(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post("/api/tts", async (req, res) => {
  const text = (req.body && req.body.text ? String(req.body.text) : "").trim();
  if (!text) return res.status(400).json({ error: "אין טקסט" });
  try {
    const { audio, engine } = await require("./lib/ttsClient").synthesize(text.slice(0, 3000));
    res.set("Content-Type", "audio/mpeg").set("Cache-Control", "no-store").set("X-TTS-Engine", engine).send(audio);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// טראק אקראי אחר (כפתור "הבא" בנגן) — עם סינון לפי מצב-רוח
app.get("/api/ambient/next", (req, res) => {
  const dock = require("./lib/dockbarData");
  const list = dock.tracksByMood(req.query.mood);
  if (!list.length) return res.json({ ambient: null });
  const exclude = req.query.exclude;
  const pool = list.filter((t) => t.id !== exclude);
  const src = pool.length ? pool : list;
  res.json({ ambient: src[Math.floor(Math.random() * src.length)] });
});

// רשימת מצבי-רוח + כמה טראקים בכל אחד (לבורר בפס התחתון)
app.get("/api/ambient/moods", (req, res) => {
  const dock = require("./lib/dockbarData");
  const tracks = dock.tracks();
  const moods = dock.moods().map((m) => ({ ...m, count: tracks.filter((t) => t.mood === m.key).length }));
  res.json({ moods, total: tracks.length });
});

// ---------- n8n מקומי (Docker) - JARVIS עצמו נשאר מול n8n Cloud ----------

const MS_N8N_COMPOSE = path.join(__dirname, "n8n", "docker-compose.yml");
const DIRA_COMPOSE = path.join(__dirname, "..", "housing-system", "infra", "docker-compose.local.yml");

app.get("/api/n8n/local-status", async (req, res) => {
  const [c5678, c5680] = await Promise.all([
    dockerServices.reachable("http://localhost:5678/healthz"),
    dockerServices.reachable("http://localhost:5680/healthz")
  ]);
  res.json({ n8n5678: c5678, n8n5680: c5680, dockerAvailable: await dockerServices.dockerAvailable() });
});

app.post("/api/n8n/local-up", async (req, res) => {
  const r = await dockerServices.ensureUp(MS_N8N_COMPOSE, { healthUrl: "http://localhost:5680/healthz" });
  res.status(r.ok ? 200 : 502).json(r);
});

app.post("/api/housing/stack-up", async (req, res) => {
  const r = await dockerServices.ensureUp(DIRA_COMPOSE, { envFile: ".env.local" });
  res.status(r.ok ? 200 : 502).json(r);
});

// ---------- DevOps Hub (n8n מקומי · infra · פרויקטים · CI) ----------

const devops = require("./lib/devops");

app.get("/api/devops/overview", async (req, res) => {
  try {
    const [n8n, inf, projects] = await Promise.all([
      devops.n8nStatus().catch((e) => ({ up: false, error: e.message })),
      devops.infra().catch((e) => ({ error: e.message })),
      devops.listProjects().catch(() => [])
    ]);
    res.json({ n8n, infra: inf, projects, config: devops.readConfig() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/devops/n8n/workflows", async (req, res) => {
  try { res.json({ workflows: await devops.n8nWorkflows() }); }
  catch (err) { res.status(502).json({ workflows: [], error: err.message }); }
});
app.get("/api/devops/n8n/executions", async (req, res) => {
  try { res.json({ executions: await devops.n8nExecutions(Number(req.query.limit) || 25) }); }
  catch (err) { res.status(502).json({ executions: [], error: err.message }); }
});
app.post("/api/devops/n8n/activate", async (req, res) => {
  try { res.json(await devops.n8nSetActive(req.body.id, !!req.body.active)); }
  catch (err) { res.status(502).json({ error: err.message }); }
});
app.post("/api/devops/n8n/run", async (req, res) => {
  try { res.json(await devops.n8nRun(req.body.id)); }
  catch (err) { res.status(502).json({ ok: false, error: err.message }); }
});
app.post("/api/devops/config", (req, res) => {
  try { res.json(devops.writeConfig(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get("/api/devops/projects", async (req, res) => {
  try { res.json({ projects: await devops.listProjects() }); }
  catch (err) { res.status(500).json({ projects: [], error: err.message }); }
});
app.post("/api/devops/projects/:id/:action", async (req, res) => {
  const { id, action } = req.params;
  try {
    if (action === "start") return res.json(await devops.startProject(id));
    if (action === "stop") return res.json(await devops.stopProject(id));
    if (action === "logs") return res.json(await devops.projectLogs(id));
    if (action === "pipeline") return res.json(await devops.runPipeline(id));
    res.status(400).json({ error: "פעולה לא מוכרת" });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});
app.get("/api/devops/projects/:id/pipeline", (req, res) => {
  res.json(devops.pipelineStatus(req.params.id) || { steps: [], running: false });
});

// ---------- סטודיו עיצוב AIA (חבילת הפקה מ-AI: קונספט · פרומפטים · סטוריבורד · וידאו) ----------

const aiaStudio = require("./lib/aiaStudio");
const aiaRender = require("./lib/aiaRender");

setInterval(() => aiaStudio.purgeStaging(), 3 * 3600 * 1000);
aiaStudio.purgeStaging();

app.get("/api/aia/projects", (req, res) => {
  res.json({
    projects: aiaStudio.listProjects(),
    maxImages: aiaStudio.MAX_IMAGES,
    canRender: aiaRender.hasFFmpeg,
    beds: aiaRender.bedList()
  });
});

// העלאת תמונת ייחוס אחת ל-staging (מאפשר עשרות תמונות בלי גבול על גודל בקשה)
app.post("/api/aia/stage", (req, res) => {
  try {
    const { stageId, dataUrl, note } = req.body || {};
    res.json(aiaStudio.stageImage(stageId, dataUrl, note));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/aia/stage/clear", (req, res) => {
  aiaStudio.clearStage((req.body || {}).stageId || "");
  res.json({ ok: true });
});

app.post("/api/aia/generate", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.text && !(b.files || []).length && !b.title && !b.stageId) {
      return res.status(400).json({ error: "צריך לפחות כותרת, תיאור טקסטואלי, או תמונת ייחוס" });
    }
    const project = await aiaStudio.createProject(b);
    res.json(project);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ---- הפקת וידאו אמיתי (מונטאז' FFmpeg) ----
app.post("/api/aia/project/:id/render", async (req, res) => {
  const id = req.params.id;
  const project = aiaStudio.getProject(id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  const cur = aiaRender.jobState(id);
  if (cur && cur.status === "running") return res.json(cur);

  const opts = req.body || {};
  // מוזיקה אופציונלית — נשמרת זמנית
  if (opts.audioDataUrl) {
    const m = /^data:audio\/(\w+);base64,(.+)$/s.exec(opts.audioDataUrl);
    if (m) {
      const ap = path.join(aiaStudio.AIA_DIR, "_work", `${id}-audio.${m[1] === "mpeg" ? "mp3" : m[1]}`);
      fs.mkdirSync(path.dirname(ap), { recursive: true });
      const buf = Buffer.from(m[2], "base64");
      if (buf.length <= 30 * 1024 * 1024) { fs.writeFileSync(ap, buf); opts.audioPath = ap; }
    }
    delete opts.audioDataUrl;
  }

  res.json({ status: "running", pct: 0, phase: "מתחיל" });
  aiaRender.render(project, opts)
    .then((job) => aiaStudio.attachRender(id, { file: job.file, durationSec: job.durationSec, images: job.images, mode: job.mode }))
    .catch((e) => console.error("[aia render]", id, e.message));
});

app.get("/api/aia/project/:id/render", (req, res) => {
  const job = aiaRender.jobState(req.params.id);
  const project = aiaStudio.getProject(req.params.id);
  if (!job && project && project.render) return res.json({ status: "done", pct: 100, ...project.render });
  res.json(job || { status: "none" });
});

app.get("/api/aia/render/:file", (req, res) => {
  const id = req.params.file.replace(/\.mp4$/, "");
  const p = aiaRender.renderPath(id);
  if (!p) return res.status(404).end();
  res.sendFile(p);
});

// ---- מנועי וידאו AI חיצוניים (Seedance 2.5 · Deevid.AI) ----
const aiaVideo = require("./lib/aiaVideo");

app.get("/api/aia/video/providers", (req, res) => {
  res.json({ providers: aiaVideo.providerList() });
});

// שמירת מפתח API בצד השרת בלבד (לא חוזר לדפדפן)
app.post("/api/aia/video/config", (req, res) => {
  try {
    const { provider, key, model } = req.body || {};
    res.json({ provider: aiaVideo.saveProvider(provider, { key, model }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/aia/project/:id/video/prompt", (req, res) => {
  const p = aiaStudio.getProject(req.params.id);
  if (!p) return res.status(404).send("לא נמצא");
  res.set("Content-Type", "text/plain; charset=utf-8")
     .send(aiaVideo.exportPrompt(p, req.query.provider || "seedance"));
});

app.post("/api/aia/project/:id/video", async (req, res) => {
  const project = aiaStudio.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  const cur = aiaVideo.jobState(project.id);
  if (cur && cur.status === "running") return res.json(cur);
  try {
    const job = await aiaVideo.submit(project, req.body || {});
    res.json(job);
  } catch (err) {
    const pid = (req.body || {}).provider || "seedance";
    if (err.code === "NO_KEY") {
      return res.status(428).json({
        error: "no-key", needKey: true,
        prompt: aiaVideo.exportPrompt(project, pid)
      });
    }
    if (err.code === "HANDOFF") {
      return res.status(409).json({
        error: "handoff", handoff: true, appUrl: err.appUrl,
        prompt: aiaVideo.exportPrompt(project, pid)
      });
    }
    res.status(502).json({ error: err.message });
  }
});

// העלאת וידאו שהופק ידנית (Deevid וכו') לגלריית הפרויקט
app.post("/api/aia/project/:id/video/upload", async (req, res) => {
  const project = aiaStudio.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  try {
    const job = await aiaVideo.attachUpload(project, (req.body || {}).dataUrl);
    aiaStudio.attachRender(project.id, { file: job.file, durationSec: job.durationSec, mode: "deevid" });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/aia/project/:id/video", (req, res) => {
  const job = aiaVideo.jobState(req.params.id);
  res.json(job || { status: "none" });
});

app.get("/api/aia/project/:id", (req, res) => {
  const p = aiaStudio.getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "לא נמצא" });
  res.json(p);
});

app.get("/api/aia/project/:id/markdown", (req, res) => {
  const p = aiaStudio.getProject(req.params.id);
  if (!p) return res.status(404).send("לא נמצא");
  res.set("Content-Type", "text/markdown; charset=utf-8")
     .set("Content-Disposition", `attachment; filename="aia-${req.params.id}.md"`)
     .send(aiaStudio.toMarkdown(p));
});

app.delete("/api/aia/project/:id", (req, res) => {
  res.json(aiaStudio.deleteProject(req.params.id));
});

app.get("/api/aia/asset/:id/:name", (req, res) => {
  try {
    const p = aiaStudio.assetPath(req.params.id, req.params.name);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.sendFile(p);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- עוזר JARVIS (פרוקסי ל-n8n Cloud - פותר CORS) ----------

app.get("/api/jarvis/config", (req, res) => {
  res.json(jarvis.readConfig());
});

app.post("/api/jarvis/config", (req, res) => {
  const { base, id, mode } = req.body || {};
  res.json(jarvis.writeConfig({ base, id, mode }));
});

app.post("/api/jarvis/ask", async (req, res) => {
  const { chatInput, sessionId } = req.body || {};
  if (!chatInput || !chatInput.trim()) {
    return res.status(400).json({ ok: false, error: "chatInput ריק" });
  }
  try {
    const result = await jarvis.ask(chatInput.trim(), sessionId);
    res.json(result);
  } catch (err) {
    res.status(502).json({ ok: false, error: `לא הצלחתי להגיע ל-n8n: ${err.message}`, url: jarvis.readConfig().base });
  }
});

// ---------- אסטרולוגיה אישית · פרטי לידה (חישוב מקומי בלבד, שום דבר לא נשלח החוצה) ----------

app.get("/api/astro/config", (req, res) => {
  const cfg = astroConfig.readAstroConfig();
  res.json({
    configured: !!cfg,
    birthDate: cfg?.birthDate || null,
    birthTime: cfg?.birthTime || null,
    birthPlace: cfg?.birthPlace || null,
    // lat/lon/tz — כדי שהאסטרולוגיה תוכל להיחשב מקומית בטלפון (אופליין)
    lat: cfg?.lat ?? null,
    lon: cfg?.lon ?? null,
    tzOffsetMinutes: cfg?.tzOffsetMinutes ?? null,
    cities: Object.keys(astroConfig.CITIES)
  });
});

app.post("/api/astro/config", (req, res) => {
  try {
    const saved = astroConfig.writeAstroConfig(req.body || {});
    res.json({ ok: true, birthDate: saved.birthDate, birthTime: saved.birthTime, birthPlace: saved.birthPlace });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// קריאה אסטרולוגית לתאריך נבחר (טרנזיטים + פרשנות בעברית, ללא AI)
app.get("/api/astro/reading", (req, res) => {
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? new Date(req.query.date + "T12:00:00") : new Date();
    res.json(require("./lib/astroClient").getReading(d));
  } catch (err) {
    res.status(500).json({ configured: false, error: err.message });
  }
});

// ---------- כושר יומי — ספריית תרגילים + תוכנית שבועית ----------

let _fitnessCache = null;
app.get("/api/fitness", (req, res) => {
  try {
    if (!_fitnessCache) _fitnessCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "exercises.json"), "utf8"));
    const today = new Date().getDay(); // 0=ראשון
    const routine = (_fitnessCache.week || []).find((w) => w.day === today) || (_fitnessCache.week || [])[0];
    res.json({ ..._fitnessCache, today, routine });
  } catch (err) {
    res.status(500).json({ error: err.message, exercises: [], week: [] });
  }
});

// ---------- דרושים — קישורי חיפוש + פילוח מיילי חיפוש עבודה ----------

app.get("/api/jobs/boards", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const jb = require("./lib/jobBoards");
  if (q) return res.json({ query: q, boards: jb.boardsFor(q) });
  res.json({ fields: jb.byField() });
});

app.get("/api/jobs/emails", (req, res) => {
  try {
    const status = JSON.parse(fs.readFileSync(EMAIL_STATUS_FILE, "utf8") || "null");
    if (!status) return res.json({ configured: false, byField: {}, items: [] });
    const jobs = (status.recentUnread || []).filter((m) => m.jobRelated);
    const byField = {};
    jobs.forEach((m) => {
      const f = m.field || "כללי";
      (byField[f] = byField[f] || []).push({ subject: m.subject, sender: m.sender, link: m.link, account: m.account });
    });
    res.json({
      configured: true,
      updatedAt: status.updatedAt || null,
      total: jobs.length,
      sampleSize: status.sampleSize ?? null,
      byField
    });
  } catch (err) {
    res.status(500).json({ configured: false, error: err.message, byField: {} });
  }
});

// ---------- זמני כניסת/יציאת שבת (חישוב מקומי) ----------

app.get("/api/shabbat", async (req, res) => {
  try {
    res.json(await require("./lib/shabbatClient").getShabbatTimes());
  } catch (err) {
    res.status(500).json({ available: false, error: err.message });
  }
});

// ---------- מצפן בריאות — ניתוח אישי מבוסס-הנחיות (לא ייעוץ רפואי) ----------

app.post("/api/health/analyze", async (req, res) => {
  try {
    const data = req.body && typeof req.body === "object" ? req.body : {};
    const result = await require("./lib/healthAdvisor").analyze(data);
    res.status(result.ok ? 200 : 503).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- דיור · DiraFinder (פאנל קל - הסטאק המלא רץ בנפרד ב-housing-system/) ----------

app.get("/api/housing/status", async (req, res) => {
  try {
    res.json(await housing.status());
  } catch (err) {
    res.json({ up: false, base: housing.BASE, error: err.message });
  }
});

app.get("/api/housing/listings", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    res.json({ listings: await housing.recentListings(limit) });
  } catch (err) {
    res.status(502).json({ listings: [], error: err.message });
  }
});

// דף הנחיתה של DiraFinder חי בתיקייה אחות (housing-system/). הקובץ הוא פרגמנט (נכתב
// לפרסום כ-Artifact) ללא <!doctype>/<html>/<head>/<body> - הגשה ישירה תגרום ל-quirks mode
// ולשבירת הפריסה. לכן עוטפים אותו בשלד HTML תקין בעת ההגשה.
// עמוד הפענוח האסטרולוגי המלא (הפרויקט הנפרד astrology-system/) - מוגש כמו שהוא
const ASTRO_FULL = path.join(__dirname, "..", "astrology-system", "web", "פענוח-אסטרולוגי-משופר.html");
app.get("/astro/full", (req, res) => {
  if (fs.existsSync(ASTRO_FULL)) return res.sendFile(ASTRO_FULL);
  res.status(404).send("עמוד הפענוח האסטרולוגי לא נמצא (astrology-system/web/)");
});

const HOUSING_LANDING = path.join(__dirname, "..", "housing-system", "site", "landing.html");
app.get("/housing/landing", (req, res) => {
  if (!fs.existsSync(HOUSING_LANDING)) {
    return res.status(404).send("דף הנחיתה של DiraFinder לא נמצא (housing-system/site/landing.html)");
  }
  let html = fs.readFileSync(HOUSING_LANDING, "utf8");
  // עטיפה בשלד תקין + <base target="_parent"> כדי שקישורים ייפתחו מחוץ ל-iframe
  const head = `<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<base target="_blank">`;
  if (!/^\s*<!doctype/i.test(html)) {
    html = `<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n${head}\n</head>\n<body>\n${html}\n</body>\n</html>`;
  } else if (!/<base\s/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n<base target="_parent">`);
  }
  res.type("html").send(html);
});

// סריקת Outlook אוטומטית כל 5 דקות - לא דורסת נתונים קיימים אם הסריקה נכשלת (לדוגמה Outlook סגור)
const OUTLOOK_SCAN_INTERVAL_MS = 5 * 60 * 1000;
async function runOutlookScan() {
  try {
    const summary = await getOutlookInboxSummary();
    if (summary) writeEmailStatus(summary);
  } catch {
    /* Outlook לא זמין כרגע - ננסה שוב בסריקה הבאה */
  }
}

// הסריקה האוטומטית כבויה כברירת מחדל: אם ל-Outlook אין חשבון מוגדר, כל ניסיון פותח
// את חלון "הוספת חשבון" מחדש כל 5 דקות - חוויה מטרידה. הפעילו ב-ENABLE_OUTLOOK_AUTOSCAN=1
// אחרי שהחשבון הוגדר ב-Outlook פעם אחת, או השתמשו בכפתור "רענן עכשיו" בלוח הבקרה.
const OUTLOOK_AUTOSCAN_ENABLED = process.env.ENABLE_OUTLOOK_AUTOSCAN === "1";

// אם הפורט תפוס (למשל תהליך קודם שנתקע), מנסים שוב כמה פעמים במקום לקרוס בשקט או
// להישאר תלוי בלי להאזין בכלל - זה בדיוק מה שגרם לאתר "לא לעלות" בעבר.
// מאזינים על 0.0.0.0 במפורש (IPv4 על כל המתאמים) — כדי שהטלפון ברשת המקומית יוכל להתחבר.
// בלי זה Node עלול להיקשר רק ל-IPv6 (::) ואז חיבור מ-192.168.x.x נכשל.
const BIND_HOST = process.env.BIND_HOST || "0.0.0.0";

// מטפל שגיאות אחרון — מחזיר JSON לנתיבי API (כולל שגיאות גוף גדול מדי), במקום דף HTML של Express
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (req.path.startsWith("/api/")) {
    const msg = status === 413 ? "הבקשה גדולה מדי — הסר תמונות או השתמש בקטנות יותר." : (err.message || "שגיאת שרת");
    return res.status(status).json({ error: msg });
  }
  res.status(status).send(err.message || "Server error");
});

function startServer(retriesLeft = 5) {
  const server = app.listen(PORT, BIND_HOST, () => {
    console.log(`מערכת ההפעלה של חיים קריספין רצה בכתובת: http://localhost:${PORT}  (מאזין על ${BIND_HOST}:${PORT})`);
    console.log(`שורש עיצובים: ${MAGNET_ROOT}`);
    if (OUTLOOK_AUTOSCAN_ENABLED) {
      setTimeout(runOutlookScan, 5000); // סריקה ראשונה קצת אחרי העלייה, לא לחסום את ההפעלה
      setInterval(runOutlookScan, OUTLOOK_SCAN_INTERVAL_MS);
    } else {
      console.log('סריקת Outlook אוטומטית כבויה - הגדירו חשבון ב-Outlook והפעילו עם ENABLE_OUTLOOK_AUTOSCAN=1, או לחצו "רענן עכשיו" בלוח הבקרה');
    }
    liveSync.start();

    // הרמת שירותי Docker נלווים ברקע (best-effort, לא חוסם את השרת).
    // אם השירות כבר נגיש - מדלגים, כדי לא להתנגש בקונטיינר קיים.
    setTimeout(() => {
      const logResult = (label) => (r) => {
        if (r.ok && r.alreadyUp) console.log(`${label}: כבר פעיל`);
        else if (r.ok) console.log(`${label}: הופעל`);
        else if (r.skipped) console.log(`${label}: דילוג (${r.error || "לא זמין"})`);
        else console.log(`${label}: נכשל (${(r.error || "").slice(0, 120)})`);
      };
      dockerServices
        .ensureUp(MS_N8N_COMPOSE, { healthUrl: "http://localhost:5680/healthz" })
        .then(logResult("n8n מקומי (5680)"))
        .then(() =>
          dockerServices
            .importN8nWorkflow(
              "magnet-studio-n8n",
              path.join(__dirname, "n8n", "workflows", "jarvis-local.json"),
              "jarvisLocal00001"
            )
            .then((r) => {
              if (r.alreadyPresent) console.log("JARVIS Local workflow: קיים ופעיל");
              else if (r.imported) console.log("JARVIS Local workflow: יובא והופעל (ייתכן שידרוש restart לקונטיינר)");
              else if (r.error) console.log(`JARVIS Local workflow: ${r.error}`);
            })
            .catch(() => {})
        )
        .catch(() => {});
      dockerServices
        .ensureUp(DIRA_COMPOSE, { envFile: ".env.local" })
        .then(logResult("סטאק DiraFinder"))
        .catch(() => {});
    }, 3000);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && retriesLeft > 0) {
      console.log(`פורט ${PORT} תפוס כרגע - מנסה שוב בעוד 2 שניות... (${retriesLeft} ניסיונות נותרו)`);
      setTimeout(() => startServer(retriesLeft - 1), 2000);
    } else {
      console.error(`השרת נכשל בעלייה: ${err.message}`);
      process.exit(1);
    }
  });
}

startServer();
