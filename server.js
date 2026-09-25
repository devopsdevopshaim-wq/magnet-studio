// טעינת משתני סביבה מקובץ .env אם קיים (לא חובה — אפשר גם setx/export).
try { require("dotenv").config(); } catch { /* dotenv אופציונלי */ }

const express = require("express");
const fs = require("fs");
const path = require("path");
const { PERSIST_DIR } = require("./lib/paths");
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

// ---------- הזדהות רב-משתמשית אופציונלית (מופעלת רק כשמוגדרת סיסמת בעלים — ראו lib/auth.js) ----------
const auth = require("./lib/auth");
const pnksUsers = require("./lib/users");
app.get("/api/auth/status", (req, res) => {
  const u = auth.currentUser(req);
  res.json({ enabled: auth.config().enabled, authed: !!u, user: u });
});
app.post("/api/auth/login", (req, res) => {
  if (!auth.config().enabled) return res.json({ ok: true, disabled: true });
  const { name, password } = req.body || {};
  const user = auth.login(name, password);
  if (!user) return res.status(401).json({ ok: false, error: "שם או סיסמה שגויים" });
  auth.setSession(res, user.id);
  res.json({ ok: true, user });
});
app.post("/api/auth/register", (req, res) => {
  if (!auth.config().enabled) return res.status(400).json({ ok: false, error: "הרשמה לא נדרשת — המערכת פתוחה" });
  try {
    const { name, password } = req.body || {};
    const user = pnksUsers.register(name, password);
    require("./lib/profile").write({ displayName: user.name }, pnksUsers.userDir(user.id));
    auth.setSession(res, user.id);
    res.json({ ok: true, user });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
app.post("/api/auth/logout", (req, res) => { auth.clearSession(res); res.json({ ok: true }); });
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
// בדיקת חיות לשירות האחסון — לפני שער ההזדהות
app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));
app.use(auth.gate);
// מזהה המשתמש המחובר זמין לכל הנתיבים מכאן והלאה — req.pnksUser = {id,name} או null (מערכת פתוחה)
app.use((req, res, next) => { req.pnksUser = auth.currentUser(req); next(); });
// תיקיית הנתונים הפרטית של המשתמש המחובר — PERSIST_DIR לבעלים/מערכת פתוחה, תיקייה נפרדת לכל חשבון רשום
function baseDirFor(req) {
  const u = req.pnksUser;
  if (!u || u.id === auth.OWNER_ID) return PERSIST_DIR;
  return pnksUsers.userDir(u.id);
}
function isOwner(req) { return !req.pnksUser || req.pnksUser.id === auth.OWNER_ID; }
function requireOwner(req, res, next) {
  if (!isOwner(req)) return res.status(403).json({ error: "פעולה זו שמורה לבעל המערכת בלבד" });
  next();
}

// ---------- ניהול משתמשים (רק לבעל המערכת) ----------
app.get("/api/admin/users", requireOwner, (req, res) => {
  res.json({ users: pnksUsers.listUsers() });
});
app.delete("/api/admin/users/:id", requireOwner, (req, res) => {
  try {
    if (req.params.id === auth.OWNER_ID) throw new Error("אי אפשר למחוק את חשבון הבעלים");
    res.json(pnksUsers.deleteUser(req.params.id));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// גיבוי/שחזור כל מפתחות האינטגרציות בבת אחת — כדי להעביר בקלות בין הרצה מקומית לענן (או להפך).
// הקובץ שיורד מכיל מפתחות אמיתיים בטקסט גלוי — נועד להעלאה ידנית לעותק האחר, לא לשמירה/שיתוף.
const INTEGRATION_FILES = ["integrations-config.json", "aia-video-config.json", "social-meta-config.json", "social-linkedin-config.json"];
app.get("/api/admin/integrations/export", requireOwner, (req, res) => {
  const bundle = {};
  for (const name of INTEGRATION_FILES) {
    const p = path.join(name === "integrations-config.json" ? PERSIST_DIR : baseDirFor(req), name);
    try { bundle[name] = JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* אין קובץ — פשוט מדלגים */ }
  }
  res.set("Content-Type", "application/json; charset=utf-8")
     .set("Content-Disposition", `attachment; filename="pnks-integrations-backup.json"`)
     .send(JSON.stringify(bundle, null, 2));
});
app.post("/api/admin/integrations/import", requireOwner, (req, res) => {
  try {
    const bundle = req.body || {};
    let count = 0;
    for (const name of INTEGRATION_FILES) {
      if (!bundle[name] || typeof bundle[name] !== "object") continue;
      const dir = name === "integrations-config.json" ? PERSIST_DIR : baseDirFor(req);
      const target = path.join(dir, name);
      // מיזוג עם מה שכבר קיים — ייבוא גיבוי חלקי (למשל מפתח אחד בלבד) לא ימחק מפתחות אחרים שכבר מוגדרים
      let existing = {};
      try { existing = JSON.parse(fs.readFileSync(target, "utf8")) || {}; } catch { /* אין קובץ קיים */ }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, JSON.stringify({ ...existing, ...bundle[name] }, null, 2));
      count++;
    }
    // מפתחות ה-AI/מדיה הכלליים נטענים ל-process.env באתחול — מרעננים גם עכשיו כדי שייכנסו לתוקף מיד
    if (bundle["integrations-config.json"]) {
      for (const [k, v] of Object.entries(bundle["integrations-config.json"])) {
        if (v) process.env[k] = String(v);
      }
    }
    res.json({ ok: true, filesImported: count });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// אנליטיקס פרטי — כניסות/מבקרים ייחודיים לפי עמוד. רק עמודי HTML אמיתיים, לא API/assets.
app.use((req, res, next) => {
  if (req.method === "GET" && req.path.endsWith(".html")) {
    try { require("./lib/analytics").track(req.path, auth.visitorToken(req)); } catch { /* לא קריטי */ }
  }
  next();
});
app.get("/", (req, res, next) => {
  try { require("./lib/analytics").track("/", auth.visitorToken(req)); } catch { /* לא קריטי */ }
  next();
});

// הורדת אפליקציית האנדרואיד — פתוח לכולם (קובץ ההתקנה עצמו, בניגוד ללוח הבקרה, לא רגיש) + מונה הורדות
const APK_PATH = path.join(__dirname, "public", "app", "hapinkas-hayomi.apk");
app.get("/app/download", (req, res) => {
  if (!fs.existsSync(APK_PATH)) return res.status(404).send("האפליקציה עדיין לא הועלתה לשרת הזה.");
  try { require("./lib/analytics").trackDownload(); } catch { /* לא קריטי */ }
  res.download(APK_PATH, "הפנקס-היומי.apk");
});

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

// ---------- אינטגרציות: כל השירותים/ה-API-ים שהמערכת משתמשת בהם, במקום אחד ----------
// integrations-config.json הוא תשתית משותפת גלובלית (לא לפי חשבון) — שמור לבעל המערכת בלבד,
// אחרת כל משתמש רשום היה יכול לקרוא/לדרוס את מפתחות ה-AI המשותפים של כולם.
app.get("/api/integrations", requireOwner, async (req, res) => {
  try { res.json({ integrations: await require("./lib/integrations").list() }); }
  catch (err) { res.status(500).json({ integrations: [], error: err.message }); }
});
app.post("/api/integrations/:id", requireOwner, async (req, res) => {
  try { res.json({ ok: true, status: await require("./lib/integrations").save(req.params.id, req.body || {}) }); }
  catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
// חשיפת הערך המלא (לא מוסתר) — רק בבקשה מפורשת מהמשתמש, מאחורי מסך ההגדרות המוגן
app.get("/api/integrations/:id/reveal", requireOwner, async (req, res) => {
  try { res.json({ values: await require("./lib/integrations").reveal(req.params.id) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ---------- אנליטיקס פרטי — נגיש רק מאחורי שער ההתחברות (auth.gate כבר חוסם למעלה) ----------
app.get("/api/analytics/stats", (req, res) => {
  try { res.json(require("./lib/analytics").getStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

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

// ---------- מנה עיקרית וקינוח ליום (מתכון + תמונה אמיתית) ----------
app.get("/api/daily-meal", async (req, res) => {
  try { res.json(await require("./lib/dailyMeal").getDailyMeal(new Date(), req.query.refresh === "1")); }
  catch (err) {
    if (err.code === "NO_AI") return res.status(428).json({ error: err.message, needAI: true });
    res.status(502).json({ error: err.message });
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

// ---------- פרופיל אישי (שם תצוגה — פרטי לכל חשבון) ----------
app.get("/api/profile", (req, res) => res.json({ ...require("./lib/profile").read(baseDirFor(req)), account: req.pnksUser }));
app.post("/api/profile", (req, res) => {
  try { res.json(require("./lib/profile").write(req.body || {}, baseDirFor(req))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ---------- חשבון מייל אישי (IMAP — פרטי לכל חשבון, לא רק לבעלים) ----------
const emailAccounts = require("./lib/emailAccounts");
app.get("/api/email-account/status", (req, res) => res.json(emailAccounts.status(baseDirFor(req))));
app.post("/api/email-account/connect", async (req, res) => {
  try { res.json(await emailAccounts.connect(baseDirFor(req), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.post("/api/email-account/disconnect", (req, res) => res.json(emailAccounts.disconnect(baseDirFor(req))));
app.get("/api/email-account/recent", async (req, res) => {
  try { res.json(await emailAccounts.recentMessages(baseDirFor(req), Math.min(parseInt(req.query.limit, 10) || 15, 50))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
// שולח מייל מהתיבה המחוברת — הבסיס לכפתור "שתף" (מייל/וואטסאפ) שבכל לשונית.
app.post("/api/email-account/send", async (req, res) => {
  try { res.json(await emailAccounts.sendMail(baseDirFor(req), req.body || {})); }
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
    const stories = require("./lib/holidayStories");
    const [active, holidays] = await Promise.all([hr.active(), hr.upcomingHolidays().catch(() => [])]);
    res.json({ resources: hr.list(), active, holidays, stories: stories.list() });
  } catch (err) {
    res.status(500).json({ resources: [], active: [], holidays: [], stories: [], error: err.message });
  }
});

// ---------- ספריית קודש: תנ"ך · סידור · רש"י/רמב"ם/אור החיים · תלמוד בבלי (חי מ-Sefaria) ----------
app.get("/api/torah/catalog", (req, res) => {
  const L = require("./lib/sefariaLibrary");
  res.json({
    books: L.TANAKH_BOOKS, commentaries: L.COMMENTARIES,
    rambam: L.RAMBAM_SECTIONS, talmud: L.TALMUD_TRACTATES
  });
});
app.get("/api/torah/siddur-tree", async (req, res) => {
  try { res.json({ tree: await require("./lib/sefariaLibrary").getSiddurTree() }); }
  catch (err) { res.status(502).json({ tree: [], error: err.message }); }
});
app.get("/api/torah/text", async (req, res) => {
  try { res.json(await require("./lib/sefariaLibrary").getText(req.query.ref)); }
  catch (err) { res.status(502).json({ error: err.message }); }
});

// ---------- ניהול עסק: לקוחות · חשבוניות · הנהלת חשבונות · יומן עסקי (פרטי לכל חשבון) ----------
const bizStore = require("./lib/business");
const biz = (req) => bizStore(baseDirFor(req));

app.get("/api/business/clients", (req, res) => res.json({ clients: biz(req).listClients() }));
app.post("/api/business/clients", (req, res) => {
  try { res.json({ client: biz(req).saveClient(req.body || {}) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/business/clients/:id", (req, res) => res.json(biz(req).deleteClient(req.params.id)));

app.get("/api/business/invoices", (req, res) => res.json({ invoices: biz(req).listInvoices() }));
app.get("/api/business/invoices/:id", (req, res) => {
  const inv = biz(req).getInvoice(req.params.id);
  if (!inv) return res.status(404).json({ error: "לא נמצאה" });
  res.json(inv);
});
app.post("/api/business/invoices", (req, res) => {
  try { res.json({ invoice: biz(req).saveInvoice(req.body || {}) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.put("/api/business/invoices/:id", (req, res) => {
  try { res.json({ invoice: biz(req).saveInvoice({ ...req.body, id: req.params.id }) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post("/api/business/invoices/:id/status", (req, res) => {
  try { res.json({ invoice: biz(req).setInvoiceStatus(req.params.id, (req.body || {}).status) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/business/invoices/:id", (req, res) => res.json(biz(req).deleteInvoice(req.params.id)));

app.get("/api/business/ledger", (req, res) => res.json(biz(req).listLedger(req.query.month)));
app.post("/api/business/ledger", (req, res) => {
  try { res.json({ entry: biz(req).saveLedgerEntry(req.body || {}) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/business/ledger/:id", (req, res) => res.json(biz(req).deleteLedgerEntry(req.params.id)));

app.get("/api/business/calendar", (req, res) => res.json({
  entries: biz(req).listCalendar(req.query.month), upcoming: req.query.upcoming ? biz(req).upcomingCalendar(Number(req.query.upcoming) || 14) : undefined
}));
app.post("/api/business/calendar", (req, res) => {
  try { res.json({ entry: biz(req).saveCalendarEntry(req.body || {}) }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/business/calendar/:id", (req, res) => res.json(biz(req).deleteCalendarEntry(req.params.id)));

// חשבונית להדפסה — עמוד עצמאי ומעוצב, מוכן ל-Ctrl+P / שמירה כ-PDF
app.get("/business/invoice/:id/print", (req, res) => {
  const inv = biz(req).getInvoice(req.params.id);
  if (!inv) return res.status(404).send("חשבונית לא נמצאה");
  const prof = require("./lib/profile").read(baseDirFor(req));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nis = (n) => Number(n || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = inv.items.map((it) => `<tr><td>${esc(it.desc)}</td><td>${it.qty}</td><td>${nis(it.price)} ₪</td><td>${nis(it.qty * it.price)} ₪</td></tr>`).join("");
  const sub = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
  res.type("html").send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>חשבונית ${esc(inv.number)}</title>
<style>
  body{font-family:'Assistant',Arial,sans-serif;max-width:720px;margin:40px auto;color:#241d16;padding:0 20px}
  h1{font-size:1.5rem;margin:0} .muted{color:#8a7c68} .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c69a63;padding-bottom:16px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin:20px 0} th,td{text-align:start;padding:8px 10px;border-bottom:1px solid #e5ddc9} th{color:#8a7c68;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}
  .totals{margin-top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:4px} .totals .grand{font-size:1.3rem;font-weight:700;color:#241d16;border-top:2px solid #241d16;padding-top:8px;margin-top:6px}
  .status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.8rem;font-weight:700}
  .status.paid{background:#e3ecdd;color:#4a6741} .status.sent{background:#fdeeda;color:#a15b16} .status.draft{background:#eee;color:#777}
  @media print{ button{display:none} }
</style></head><body>
  <div class="head">
    <div><h1>${esc(prof.displayName || "חיים קריספין")}</h1><div class="muted">חשבונית מס' ${esc(inv.number)}</div></div>
    <div style="text-align:end"><span class="status ${esc(inv.status)}">${inv.status === "paid" ? "שולם" : inv.status === "sent" ? "נשלח" : "טיוטה"}</span>
      <div class="muted" style="margin-top:6px">תאריך: ${esc(inv.date)}${inv.dueDate ? " · לתשלום עד " + esc(inv.dueDate) : ""}</div></div>
  </div>
  <div><b>לכבוד:</b> ${esc(inv.client?.name || inv.clientName || "—")}${inv.client?.phone ? " · " + esc(inv.client.phone) : ""}${inv.client?.email ? " · " + esc(inv.client.email) : ""}</div>
  <table><tr><th>תיאור</th><th>כמות</th><th>מחיר יח'</th><th>סה"כ</th></tr>${rows}</table>
  <div class="totals">
    ${inv.discount ? `<div>סכום ביניים: ${nis(sub)} ₪</div><div>הנחה ${inv.discount}%: −${nis(sub - inv.total)} ₪</div>` : ""}
    <div class="grand">לתשלום: ${nis(inv.total)} ₪</div>
  </div>
  ${inv.notes ? `<p class="muted">${esc(inv.notes)}</p>` : ""}
  <button onclick="window.print()" style="margin-top:24px;padding:10px 20px;border-radius:9px;border:1px solid #c69a63;background:#c69a63;color:#201810;font-weight:700;cursor:pointer">הדפס / שמור כ-PDF</button>
</body></html>`);
});

// ---------- סטודיו פרסום ושיווק: קמפיין מלא (כותרות/טקסטים/CTA/האשטגים/בריף חזותי) ----------
app.post("/api/marketing/generate", async (req, res) => {
  try { res.json(await require("./lib/adStudio").generate(req.body || {})); }
  catch (err) {
    if (err.code === "NO_AI") return res.status(428).json({ error: err.message, needAI: true });
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/marketing/options", (req, res) => {
  const a = require("./lib/adStudio");
  res.json({ platforms: a.PLATFORM_LABELS, goals: a.GOAL_LABELS });
});

// ---------- סטודיו לוגו: 6 קונספטים וקטוריים מיידיים + פרומפטים למחוללי תמונה ----------
app.post("/api/logo/generate", async (req, res) => {
  try { res.json(await require("./lib/logoStudio").generate(req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
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

// חיפוש חופשי ב-YouTube (בלי מפתח API) — כל שיר/ערוץ/ז'אנר, לא רק הרשימה המתוקתקת
app.get("/api/youtube/search", async (req, res) => {
  try { res.json({ items: await require("./lib/youtubeSearch").searchYouTube(req.query.q || "", 12) }); }
  catch (err) { res.status(502).json({ items: [], error: err.message }); }
});

// ---------- טלוויזיה — ערוצים חינמיים ופתוחים (השידור הרשמי של הערוץ עצמו ביוטיוב) ----------
const TV_FILE = path.join(__dirname, "data", "tv-channels.json");
app.get("/api/tv/channels", async (req, res) => {
  try {
    const j = JSON.parse(fs.readFileSync(TV_FILE, "utf8"));
    const { resolveLiveVideoId } = require("./lib/tvLive");
    const channels = await Promise.all((j.channels || []).map(async (c) => {
      const r = await resolveLiveVideoId(c.channelId);
      return { ...c, videoId: r.videoId, live: r.live };
    }));
    res.json({ ...j, channels });
  } catch { res.json({ channels: [] }); }
});
// חיפוש ערוץ להוספה — מוצא את ה-channelId הרשמי לפי שם, כדי שהשידור החי תמיד יעודכן ממקור אמיתי
app.get("/api/tv/search", async (req, res) => {
  try {
    const items = await require("./lib/youtubeSearch").searchYouTube(req.query.q || "", 8);
    const seen = new Set();
    const channels = [];
    for (const it of items) {
      if (!it.channelId || seen.has(it.channelId)) continue;
      seen.add(it.channelId);
      channels.push({ channelId: it.channelId, name: it.channel });
    }
    res.json({ channels });
  } catch (err) { res.status(502).json({ channels: [], error: err.message }); }
});
app.post("/api/tv/add", (req, res) => {
  try {
    const { he, channelId } = req.body || {};
    if (!he || !channelId) return res.status(400).json({ error: "חסר שם או מזהה ערוץ" });
    const j = JSON.parse(fs.readFileSync(TV_FILE, "utf8"));
    j.channels = j.channels || [];
    if (!j.channels.some((c) => c.channelId === channelId)) {
      j.channels.push({ id: "custom-" + Date.now().toString(36), he: String(he).slice(0, 80), group: "שלי", channelId });
      fs.writeFileSync(TV_FILE, JSON.stringify(j, null, 2));
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// הוספת תחנה שנמצאה בחיפוש לרשימת המוזיקה הקבועה — נכנסת מיד לרוטציה, נשארת לתמיד
app.post("/api/ambient/add", (req, res) => {
  try {
    const { id, title } = req.body || {};
    if (!id || !title) return res.status(400).json({ error: "חסר מזהה או כותרת" });
    const file = path.join(__dirname, "data", "ambient-tracks.json");
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    j.tracks = j.tracks || []; j.moods = j.moods || [];
    if (!j.tracks.some((t) => t.id === id)) {
      j.tracks.push({ id, title: String(title).slice(0, 140), mood: "custom" });
      if (!j.moods.some((m) => m.key === "custom")) {
        j.moods.push({ key: "custom", he: "שלי", emoji: "⭐", desc: "תחנות שהוספתי מיוטיוב" });
      }
      fs.writeFileSync(file, JSON.stringify(j, null, 2));
    }
    require("./lib/dockbarData").reload();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- תשתית Docker נלווית (לא n8n - כל n8n באפליקציה עובד מול n8n Cloud) ----------

const DIRA_COMPOSE = path.join(__dirname, "..", "housing-system", "infra", "docker-compose.local.yml");

app.post("/api/housing/stack-up", async (req, res) => {
  const r = await dockerServices.ensureUp(DIRA_COMPOSE, { envFile: ".env.local" });
  res.status(r.ok ? 200 : 502).json(r);
});

// ---------- DevOps Hub (n8n Cloud · infra · פרויקטים · CI) ----------

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

// ---------- אשף AI של DevOps — שיחה עם צ'אט AI שמכירה את מצב המחשב האמיתי, ומגיעה ל-JSON ----------
const devopsWizard = require("./lib/devopsWizard");
app.post("/api/devops/wizard/ask", async (req, res) => {
  try {
    const { messages, sessionId } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ ok: false, error: "אין הודעות" });
    res.json(await devopsWizard.ask(baseDirFor(req), messages, sessionId));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- סטודיו עיצוב AIA (חבילת הפקה מ-AI: קונספט · פרומפטים · סטוריבורד · וידאו) ----------

const aiaStudioFactory = require("./lib/aiaStudio");
const aiaRender = require("./lib/aiaRender");
const aia = (req) => aiaStudioFactory(baseDirFor(req));
const aiaDirFor = (req) => path.join(baseDirFor(req), "aia");

setInterval(() => {
  try { aiaStudioFactory(PERSIST_DIR).purgeStaging(); } catch {}
  try {
    for (const uid of pnksUsers.listUsers().map((u) => u.id)) {
      aiaStudioFactory(pnksUsers.userDir(uid)).purgeStaging();
    }
  } catch {}
}, 3 * 3600 * 1000);

app.get("/api/aia/projects", (req, res) => {
  res.json({
    projects: aia(req).listProjects(),
    maxImages: aiaStudioFactory.MAX_IMAGES,
    canRender: aiaRender.hasFFmpeg,
    beds: aiaRender.bedList(),
    transitions: aiaRender.transitionList()
  });
});

// העלאת תמונת ייחוס אחת ל-staging (מאפשר עשרות תמונות בלי גבול על גודל בקשה)
app.post("/api/aia/stage", (req, res) => {
  try {
    const { stageId, dataUrl, note } = req.body || {};
    res.json(aia(req).stageImage(stageId, dataUrl, note));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/aia/stage/clear", (req, res) => {
  aia(req).clearStage((req.body || {}).stageId || "");
  res.json({ ok: true });
});

app.post("/api/aia/generate", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.text && !(b.files || []).length && !b.title && !b.stageId) {
      return res.status(400).json({ error: "צריך לפחות כותרת, תיאור טקסטואלי, או תמונת ייחוס" });
    }
    const project = await aia(req).createProject(b);
    res.json(project);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ---- הפקת וידאו אמיתי (מונטאז'/אנימציה FFmpeg, או Remotion — React אמיתי עם תמיכת RTL נכונה) ----
const remotionRender = require("./lib/remotionRender");
function rendererFor(mode) { return mode === "remotion" ? remotionRender : aiaRender; }

app.post("/api/aia/project/:id/render", async (req, res) => {
  const id = req.params.id;
  const store = aia(req);
  const aiaDir = aiaDirFor(req);
  const project = store.getProject(id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  const opts = req.body || {};
  const engine = rendererFor(opts.mode === "remotion" ? "remotion" : "ffmpeg");
  const cur = engine.jobState(id);
  if (cur && cur.status === "running") return res.json(cur);

  // מוזיקה אופציונלית (רק למנוע ה-FFmpeg) — נשמרת זמנית
  if (opts.audioDataUrl && engine === aiaRender) {
    const m = /^data:audio\/(\w+);base64,(.+)$/s.exec(opts.audioDataUrl);
    if (m) {
      const ap = path.join(aiaDir, "_work", `${id}-audio.${m[1] === "mpeg" ? "mp3" : m[1]}`);
      fs.mkdirSync(path.dirname(ap), { recursive: true });
      const buf = Buffer.from(m[2], "base64");
      if (buf.length <= 30 * 1024 * 1024) { fs.writeFileSync(ap, buf); opts.audioPath = ap; }
    }
  }
  delete opts.audioDataUrl;

  res.json({ status: "running", pct: 0, phase: "מתחיל" });
  engine.render(aiaDir, project, opts)
    .then((job) => store.attachRender(id, { file: job.file, durationSec: job.durationSec, images: job.images, mode: opts.mode === "remotion" ? "remotion" : job.mode }))
    .catch((e) => console.error("[aia render]", opts.mode || "ffmpeg", id, e.message));
});

app.get("/api/aia/project/:id/render", (req, res) => {
  const job = aiaRender.jobState(req.params.id) || remotionRender.jobState(req.params.id);
  const project = aia(req).getProject(req.params.id);
  if (!job && project && project.render) return res.json({ status: "done", pct: 100, ...project.render });
  res.json(job || { status: "none" });
});

app.get("/api/aia/render/:file", (req, res) => {
  const id = req.params.file.replace(/\.mp4$/, "");
  const p = aiaRender.renderPath(aiaDirFor(req), id);
  if (!p) return res.status(404).end();
  res.sendFile(p);
});

// ---- מנועי וידאו AI חיצוניים (Seedance 2.5 · Deevid.AI) ----
const aiaVideo = require("./lib/aiaVideo");

app.get("/api/aia/video/providers", (req, res) => {
  res.json({ providers: aiaVideo.providerList() });
});

// שמירת מפתח API בצד השרת בלבד (לא חוזר לדפדפן) — תשתית משותפת לכלל החשבונות
app.post("/api/aia/video/config", (req, res) => {
  try {
    const { provider, key, model } = req.body || {};
    res.json({ provider: aiaVideo.saveProvider(provider, { key, model }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/aia/project/:id/video/prompt", (req, res) => {
  const p = aia(req).getProject(req.params.id);
  if (!p) return res.status(404).send("לא נמצא");
  res.set("Content-Type", "text/plain; charset=utf-8")
     .send(aiaVideo.exportPrompt(p, req.query.provider || "seedance"));
});

app.post("/api/aia/project/:id/video", async (req, res) => {
  const project = aia(req).getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  const cur = aiaVideo.jobState(project.id);
  if (cur && cur.status === "running") return res.json(cur);
  try {
    const job = await aiaVideo.submit(aiaDirFor(req), project, req.body || {});
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
  const store = aia(req);
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  try {
    const job = await aiaVideo.attachUpload(aiaDirFor(req), project, (req.body || {}).dataUrl);
    store.attachRender(project.id, { file: job.file, durationSec: job.durationSec, mode: "deevid" });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/aia/project/:id/video", (req, res) => {
  const job = aiaVideo.jobState(req.params.id);
  res.json(job || { status: "none" });
});

// ---- ComfyUI מקומי — תהליך עבודה משלכם, רץ על אותו מחשב כמו ComfyUI (לא דרך הענן, אלא אם יש טאנל) ----
const comfyui = require("./lib/comfyui");
app.get("/api/aia/comfyui/status", async (req, res) => res.json(await comfyui.status(baseDirFor(req))));
app.post("/api/aia/comfyui/config", async (req, res) => {
  try { res.json(await comfyui.saveConfig(baseDirFor(req), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.post("/api/aia/project/:id/comfyui", async (req, res) => {
  const project = aia(req).getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  const cur = comfyui.jobState(project.id);
  if (cur && cur.status === "running") return res.json(cur);
  try { res.json(await comfyui.submit(aiaDirFor(req), baseDirFor(req), project, req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/aia/project/:id/comfyui", (req, res) => {
  const job = comfyui.jobState(req.params.id);
  res.json(job || { status: "none" });
});
app.get("/api/aia/comfyui/file/:filename", (req, res) => {
  try {
    const p = comfyui.filePath(aiaDirFor(req), req.params.filename);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.sendFile(p);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get("/api/aia/project/:id", (req, res) => {
  const p = aia(req).getProject(req.params.id);
  if (!p) return res.status(404).json({ error: "לא נמצא" });
  res.json(p);
});

app.get("/api/aia/project/:id/markdown", (req, res) => {
  const p = aia(req).getProject(req.params.id);
  if (!p) return res.status(404).send("לא נמצא");
  res.set("Content-Type", "text/markdown; charset=utf-8")
     .set("Content-Disposition", `attachment; filename="aia-${req.params.id}.md"`)
     .send(aia(req).toMarkdown(p));
});

app.delete("/api/aia/project/:id", (req, res) => {
  res.json(aia(req).deleteProject(req.params.id));
});

app.get("/api/aia/asset/:id/:name", (req, res) => {
  try {
    const p = aia(req).assetPath(req.params.id, req.params.name);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.sendFile(p);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- רשתות חברתיות: וואטסאפ (QR לא-רשמי) + פייסבוק/אינסטגרם (Graph API) + לינקדין (OAuth) ----------

const wa = require("./lib/whatsapp");
const socialMeta = require("./lib/socialMeta");
const linkedin = require("./lib/linkedin");

app.get("/api/social/status", (req, res) => {
  const baseDir = baseDirFor(req);
  res.json({
    whatsapp: wa.state(baseDir),
    meta: socialMeta.status(baseDir),
    linkedin: linkedin.status(baseDir)
  });
});

// ---- וואטסאפ ----
app.post("/api/whatsapp/connect", async (req, res) => {
  try { res.json(await wa.connect(baseDirFor(req))); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/whatsapp/status", (req, res) => res.json(wa.state(baseDirFor(req))));
app.post("/api/whatsapp/disconnect", async (req, res) => res.json(await wa.disconnect(baseDirFor(req))));
app.post("/api/whatsapp/send", async (req, res) => {
  try {
    const { to, text } = req.body || {};
    res.json(await wa.sendMessage(baseDirFor(req), to, text));
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/whatsapp/chats", async (req, res) => res.json({ chats: await wa.recentChats(baseDirFor(req)) }));

// ---- פייסבוק / אינסטגרם ----
app.post("/api/social/meta/config", async (req, res) => {
  try { res.json(await socialMeta.saveSettings(baseDirFor(req), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.post("/api/social/meta/post/facebook", async (req, res) => {
  try { res.json(await socialMeta.postToFacebook(baseDirFor(req), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.post("/api/social/meta/post/instagram", async (req, res) => {
  try { res.json(await socialMeta.postToInstagram(baseDirFor(req), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/social/meta/posts", async (req, res) => res.json({ posts: await socialMeta.recentPosts(baseDirFor(req)) }));

// ---- לינקדין ----
app.post("/api/social/linkedin/config", (req, res) => {
  try { res.json(linkedin.saveApp(baseDirFor(req), req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/social/linkedin/connect", (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/social/linkedin/callback`;
    res.redirect(linkedin.authUrl(baseDirFor(req), redirectUri));
  } catch (err) { res.status(400).send(err.message); }
});
app.get("/api/social/linkedin/callback", async (req, res) => {
  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/social/linkedin/callback`;
    await linkedin.handleCallback(req.query.code, req.query.state, redirectUri);
    res.redirect("/social.html?linkedin=connected");
  } catch (err) { res.redirect("/social.html?linkedin=error&msg=" + encodeURIComponent(err.message)); }
});
app.post("/api/social/linkedin/disconnect", (req, res) => res.json(linkedin.disconnect(baseDirFor(req))));
app.post("/api/social/linkedin/post", async (req, res) => {
  try { res.json(await linkedin.postToLinkedIn(baseDirFor(req), (req.body || {}).text)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ---------- צ'אט AI (פרוקסי ל-n8n Cloud - פותר CORS) ----------

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

// ---------- פענוח אסטרולוגי מלא (מנוע עומק — מפת לידה, בתים, היבטים, נומרולוגיה) ----------
// פר-חשבון: כל משתמש רשום מזין את פרטי הלידה שלו-עצמו ומקבל את המפה שלו, נפרד מהבעלים.
app.get("/api/astro/deep/config", (req, res) => {
  const cfg = astroConfig.readAstroConfig(baseDirFor(req));
  res.json({
    configured: !!cfg,
    birthDate: cfg?.birthDate || null, birthTime: cfg?.birthTime || null, birthPlace: cfg?.birthPlace || null,
    lat: cfg?.lat ?? null, lon: cfg?.lon ?? null, tzOffsetMinutes: cfg?.tzOffsetMinutes ?? null,
    cities: Object.keys(astroConfig.CITIES)
  });
});
app.post("/api/astro/deep/config", (req, res) => {
  try {
    const saved = astroConfig.writeAstroConfig(req.body || {}, baseDirFor(req));
    res.json({ ok: true, birthDate: saved.birthDate, birthTime: saved.birthTime, birthPlace: saved.birthPlace });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
// ---------- גרפולוגיה — שאלון מבנה דטרמיניסטי (לא AI, לא n8n) — פר-חשבון ----------
const graphologyEngine = require("./lib/graphologyEngine");
app.get("/api/graphology/questionnaire", (req, res) => {
  res.json(graphologyEngine.questionnaireSchema(req.query.lang === "en" ? "en" : "he"));
});
app.post("/api/graphology/analyze", (req, res) => {
  try {
    const { answers, lang, subjectLabel } = req.body || {};
    const report = graphologyEngine.runAnalysis(answers, lang === "en" ? "en" : "he");
    const entry = graphologyEngine.saveToHistory(baseDirFor(req), { subjectLabel, lang, answers, report });
    res.json({ id: entry.id, report });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.get("/api/graphology/history", (req, res) => {
  res.json({ history: graphologyEngine.listHistory(baseDirFor(req)) });
});
app.get("/api/graphology/history/:id", (req, res) => {
  const e = graphologyEngine.getHistoryEntry(baseDirFor(req), req.params.id);
  if (!e) return res.status(404).json({ error: "לא נמצא" });
  res.json(e);
});
app.delete("/api/graphology/history/:id", (req, res) => {
  res.json(graphologyEngine.deleteHistoryEntry(baseDirFor(req), req.params.id));
});

app.get("/api/astro/deep/reading", (req, res) => {
  try {
    const cfg = astroConfig.readAstroConfig(baseDirFor(req));
    if (!cfg) return res.status(400).json({ error: "צריך להזין פרטי לידה קודם" });
    const Astro = require("./lib/astroDeepEngine");
    const [y, m, d] = cfg.birthDate.split("-").map(Number);
    const [hh, mm] = cfg.birthTime.split(":").map(Number);
    const tzOffset = Number.isFinite(cfg.tzOffsetMinutes) ? cfg.tzOffsetMinutes / 60 : astroConfig.israelTzOffsetMinutes(cfg.birthDate) / 60;
    const natal = Astro.chart({ year: y, month: m, day: d, hour: hh, minute: mm, tzOffset, lat: cfg.lat, lon: cfg.lon, place: cfg.birthPlace });
    const now = new Date();
    const tr = Astro.transits(natal, now);
    res.json({ natal, transits: tr, birthPlace: cfg.birthPlace, birthDate: cfg.birthDate, birthTime: cfg.birthTime });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- כושר יומי — ספריית תרגילים + תוכנית שבועית ----------

let _fitnessCache = null;
app.get("/api/fitness", async (req, res) => {
  try {
    if (!_fitnessCache) _fitnessCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "exercises.json"), "utf8"));
    const today = new Date().getDay(); // 0=ראשון
    const routine = (_fitnessCache.week || []).find((w) => w.day === today) || (_fitnessCache.week || [])[0];
    const { resolveExerciseVideo } = require("./lib/exerciseVideos");
    const exercises = await Promise.all((_fitnessCache.exercises || []).map(async (e) => {
      const v = await resolveExerciseVideo(e);
      return { ...e, video: v.videoId ? { videoId: v.videoId, title: v.title, channel: v.channel, thumb: v.thumb } : null };
    }));
    res.json({ ..._fitnessCache, exercises, today, routine });
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

// ---------- הלכות חגים: מנהגים/הלכות/ברכות + תאריכים אמיתיים + סנכרון ליומן ----------

const holidayHalacha = require("./lib/holidayHalacha");

app.get("/api/holidays", (req, res) => {
  res.json({ holidays: holidayHalacha.listAll() });
});
app.get("/api/holidays/upcoming", async (req, res) => {
  try { res.json({ upcoming: await holidayHalacha.computeUpcoming() }); }
  catch (err) { res.status(500).json({ upcoming: [], error: err.message }); }
});
app.get("/api/holidays/:id", (req, res) => {
  const c = holidayHalacha.getContent(req.params.id);
  if (!c) return res.status(404).json({ error: "חג לא נמצא" });
  res.json(c);
});
app.post("/api/holidays/sync-calendar", async (req, res) => {
  try { res.json(await holidayHalacha.syncToCalendar(baseDirFor(req))); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});
// אחת ליום — מסנכרן חגים קרובים ליומן העסקי של הבעלים (לא חוסם עלייה, ולא כפול בכל הרצה)
setTimeout(() => holidayHalacha.syncToCalendar(PERSIST_DIR).catch((e) => console.error("[holidays] sync", e.message)), 5000);
setInterval(() => holidayHalacha.syncToCalendar(PERSIST_DIR).catch(() => {}), 24 * 3600 * 1000);

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

// מצב חופשי — קישורי חיפוש ללוחות דיור, בלי תלות בסטאק מקומי. עובד בכל מקום.
const housingLinks = require("./lib/housingLinks");
app.get("/api/housing/search-links", (req, res) => {
  res.json({ links: housingLinks.searchLinks({ city: req.query.city, rooms: req.query.rooms, dealType: req.query.dealType }) });
});
app.get("/api/housing/cities", (req, res) => {
  res.json({ cities: housingLinks.POPULAR_CITIES });
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
