// lib/googleCalendar.js — חיבור OAuth אמיתי ליומן Google, פר-חשבון. כל משתמש מאשר גישה
// ליומן שלו-עצמו דרך מסך ההסכמה של Google (לא מזין סיסמה באתר בכלל — זה כל הרעיון ב-OAuth).
// רק refresh_token מוצפן נשמר; access_token מתחדש בכל שימוש ולא נשמר בדיסק.
//
// דורש הגדרה חד-פעמית מחוץ לקוד (Google Cloud Console): GOOGLE_OAUTH_CLIENT_ID +
// GOOGLE_OAUTH_CLIENT_SECRET במשתני הסביבה, ורישום Authorized redirect URI מדויק
// (ראו redirectUri למטה) בפרויקט ה-OAuth של גוגל.

const https = require("https");
const fs = require("fs");
const path = require("path");
const secretCrypto = require("./secretCrypto");

const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

function creds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET לא מוגדרים");
  return { clientId, clientSecret };
}

// נבנה דינמית מהבקשה בפועל (עובד גם ב-localhost וגם בענן) — אבל גוגל דורש שהכתובת המדויקת
// תהיה רשומה מראש כ-Authorized redirect URI בפרויקט ה-OAuth שלכם.
function redirectUri(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}/api/calendar/google/callback`;
}

function fileFor(baseDir) { return path.join(baseDir, "google-calendar.json"); }
function readConfig(baseDir) { try { return JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8")) || {}; } catch { return {}; } }
function writeConfig(baseDir, cfg) { fs.mkdirSync(baseDir, { recursive: true }); fs.writeFileSync(fileFor(baseDir), JSON.stringify(cfg, null, 2)); }

function httpRequest(url, { method = "GET", headers = {}, body, isForm = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? (isForm ? body.toString() : JSON.stringify(body)) : null;
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: {
        ...(isForm ? { "Content-Type": "application/x-www-form-urlencoded" } : { "Content-Type": "application/json" }),
        ...headers,
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
      },
      timeout: 15000
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* לא JSON */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json ?? {});
        else reject(new Error(`Google API ${res.statusCode}: ${json?.error_description || json?.error?.message || text.slice(0, 200)}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function getAuthUrl(req, state) {
  const { clientId } = creds();
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri(req), response_type: "code",
    scope: SCOPES, access_type: "offline", prompt: "consent", state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(req, code) {
  const { clientId, clientSecret } = creds();
  const body = new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri(req), grant_type: "authorization_code"
  });
  return httpRequest("https://oauth2.googleapis.com/token", { method: "POST", body, isForm: true });
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = creds();
  const body = new URLSearchParams({
    refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token"
  });
  return httpRequest("https://oauth2.googleapis.com/token", { method: "POST", body, isForm: true });
}

async function connect(baseDir, req, code) {
  const tokens = await exchangeCode(req, code);
  if (!tokens.refresh_token) {
    throw new Error("Google לא החזיר הרשאת גישה קבועה — נתקו גישה בהגדרות חשבון Google שלכם ונסו להתחבר שוב (consent screen חייב לרוץ מחדש).");
  }
  writeConfig(baseDir, {
    refreshTokenEnc: secretCrypto.encrypt("calendar", tokens.refresh_token),
    connectedAt: new Date().toISOString()
  });
  return { ok: true };
}

function status(baseDir) {
  const cfg = readConfig(baseDir);
  return { connected: !!cfg.refreshTokenEnc, connectedAt: cfg.connectedAt || null };
}

function disconnect(baseDir) { writeConfig(baseDir, {}); return { ok: true }; }

async function accessTokenFor(baseDir) {
  const cfg = readConfig(baseDir);
  if (!cfg.refreshTokenEnc) throw new Error("היומן לא מחובר");
  const refreshToken = secretCrypto.decrypt("calendar", cfg.refreshTokenEnc);
  const tok = await refreshAccessToken(refreshToken);
  return tok.access_token;
}

async function listUpcomingEvents(baseDir, { maxResults = 10 } = {}) {
  const accessToken = await accessTokenFor(baseDir);
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(), maxResults: String(maxResults),
    singleEvents: "true", orderBy: "startTime"
  });
  const r = await httpRequest(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return (r.items || []).map((e) => ({
    id: e.id,
    title: e.summary || "(ללא כותרת)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !e.start?.dateTime,
    location: e.location || "",
    description: e.description || ""
  }));
}

module.exports = { getAuthUrl, connect, status, disconnect, listUpcomingEvents };
