// lib/linkedin.js — פרסום ללינקדין (פרופיל אישי) דרך OAuth2 הרשמי של לינקדין.
//
// לינקדין לא מאפשרת "הדבקת טוקן" כמו מטא — חובה זרימת הרשאה (OAuth) אמיתית שבה המשתמש
// עצמו מאשר בדפדפן שלו. מה שצריך כדי לחבר:
//   1. יוצרים אפליקציה ב-developer.linkedin.com (חינם)
//   2. בכרטיסייה "Products" מוסיפים את "Share on LinkedIn" (מאושר אוטומטית לרוב)
//   3. בכרטיסייה "Auth" מוסיפים Redirect URL: <כתובת האתר שלך>/api/social/linkedin/callback
//   4. מעתיקים Client ID + Client Secret לכאן, ואז לוחצים "התחברות ללינקדין" — זה יפתח את
//      מסך ההרשאה של לינקדין עצמה; שום סיסמה לא עוברת דרך השרת שלנו.
//
// כל חשבון (בעלים / משתמש רשום) מחזיק הגדרות וטוקן נפרדים משלו.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com/v2";
const SCOPES = "openid profile w_member_social";

function fileFor(baseDir) { return path.join(baseDir, "social-linkedin-config.json"); }
function readConfig(baseDir) {
  try { return JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8")) || {}; } catch { return {}; }
}
function writeConfig(baseDir, cfg) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(cfg, null, 2));
}

// state חתום -> baseDir, לאימות ה-callback (תקף 10 דקות)
const pendingStates = new Map();
function purgeStates() {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (now - v.at > 10 * 60 * 1000) pendingStates.delete(k);
}

function saveApp(baseDir, { clientId, clientSecret } = {}) {
  const cfg = readConfig(baseDir);
  if (clientId !== undefined) cfg.clientId = String(clientId || "").trim();
  if (clientSecret !== undefined) cfg.clientSecret = String(clientSecret || "").trim();
  writeConfig(baseDir, cfg);
  return status(baseDir);
}

function status(baseDir) {
  const cfg = readConfig(baseDir);
  return {
    appConfigured: !!(cfg.clientId && cfg.clientSecret),
    connected: !!cfg.accessToken && (!cfg.expiresAt || cfg.expiresAt > Date.now()),
    name: cfg.name || "",
    expiresAt: cfg.expiresAt || null
  };
}

function authUrl(baseDir, redirectUri) {
  const cfg = readConfig(baseDir);
  if (!cfg.clientId) throw new Error("צריך להזין Client ID / Client Secret קודם");
  purgeStates();
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { baseDir, at: Date.now() });
  const q = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: redirectUri,
    scope: SCOPES, state
  });
  return `${AUTH_URL}?${q.toString()}`;
}

async function handleCallback(code, state, redirectUri) {
  purgeStates();
  const pending = pendingStates.get(state);
  if (!pending) throw new Error("קישור ההרשאה פג תוקף — נסה להתחבר שוב");
  pendingStates.delete(state);
  const { baseDir } = pending;
  const cfg = readConfig(baseDir);
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("הגדרות לינקדין חסרות");

  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: redirectUri,
    client_id: cfg.clientId, client_secret: cfg.clientSecret
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json();
  if (j.error) throw new Error(j.error_description || j.error);

  cfg.accessToken = j.access_token;
  cfg.expiresAt = Date.now() + (Number(j.expires_in) || 3600) * 1000;

  try {
    const ur = await fetch(`${API}/userinfo`, { headers: { Authorization: "Bearer " + j.access_token } });
    const uj = await ur.json();
    cfg.sub = uj.sub || null; // ה-URN שמשמש כ-author בפרסום
    cfg.name = uj.name || "";
  } catch { /* לא קריטי */ }

  writeConfig(baseDir, cfg);
  return { ok: true, baseDir };
}

async function postToLinkedIn(baseDir, text) {
  const cfg = readConfig(baseDir);
  if (!cfg.accessToken) throw new Error("לינקדין לא מחובר");
  if (cfg.expiresAt && cfg.expiresAt < Date.now()) throw new Error("החיבור פג תוקף — יש להתחבר מחדש");
  if (!cfg.sub) throw new Error("חסר מזהה משתמש לינקדין — התחבר מחדש");

  const body = {
    author: `urn:li:person:${cfg.sub}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: String(text || "").slice(0, 3000) },
        shareMediaCategory: "NONE"
      }
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
  };
  const r = await fetch(`${API}/ugcPosts`, {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.accessToken, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j.message) || ("לינקדין החזיר שגיאה " + r.status)); }
  const j = await r.json();
  return { ok: true, id: j.id || null };
}

function disconnect(baseDir) {
  const cfg = readConfig(baseDir);
  delete cfg.accessToken; delete cfg.expiresAt; delete cfg.sub; delete cfg.name;
  writeConfig(baseDir, cfg);
  return { ok: true };
}

module.exports = { saveApp, status, authUrl, handleCallback, postToLinkedIn, disconnect };
