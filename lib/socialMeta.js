// lib/socialMeta.js — פייסבוק ואינסטגרם דרך ה-API הרשמי של מטא (Graph API).
// לכל חשבון (בעלים / משתמש רשום) יש הגדרות משלו — דף פייסבוק שונה, חשבון אינסטגרם שונה.
//
// מה שצריך כדי לחבר (המשתמש עושה זאת בעצמו, בלי צורך באישור אפליקציה מיוחד לשימוש עצמי):
//   1. יוצרים אפליקציה ב-developers.facebook.com (חינם, כמה דקות)
//   2. ב-Graph API Explorer בוחרים את האפליקציה + את הדף שמנהלים, ומבקשים הרשאות:
//      pages_manage_posts, pages_read_engagement, pages_show_list,
//      instagram_basic, instagram_content_publish (אם רוצים גם אינסטגרם)
//   3. מייצרים "Page Access Token" ארוך-טווח ומדביקים כאן יחד עם מזהה הדף.
//   4. לאינסטגרם: צריך חשבון עסקי/יוצר שמקושר לדף — המזהה שלו (IG User ID) מתקבל אוטומטית.
//
// בלי הגדרות — כל הפונקציות מחזירות שגיאה ברורה, לא קורסות.

const fs = require("fs");
const path = require("path");

const GRAPH = "https://graph.facebook.com/v21.0";

function fileFor(baseDir) { return path.join(baseDir, "social-meta-config.json"); }

function readConfig(baseDir) {
  try { return JSON.parse(fs.readFileSync(fileFor(baseDir), "utf8")) || {}; } catch { return {}; }
}
function writeConfig(baseDir, cfg) {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(fileFor(baseDir), JSON.stringify(cfg, null, 2));
}

async function saveSettings(baseDir, { pageId, pageToken } = {}) {
  const cfg = readConfig(baseDir);
  if (pageId !== undefined) cfg.pageId = String(pageId || "").trim();
  if (pageToken !== undefined) cfg.pageToken = String(pageToken || "").trim();

  // מזהה חשבון האינסטגרם מתקבל אוטומטית מהדף אם הוא מקושר
  if (cfg.pageId && cfg.pageToken) {
    try {
      const r = await fetch(`${GRAPH}/${cfg.pageId}?fields=instagram_business_account,name&access_token=${encodeURIComponent(cfg.pageToken)}`);
      const j = await r.json();
      if (j.instagram_business_account) cfg.igUserId = j.instagram_business_account.id;
      if (j.name) cfg.pageName = j.name;
      if (j.error) cfg.lastCheckError = j.error.message;
      else delete cfg.lastCheckError;
    } catch (e) { cfg.lastCheckError = e.message; }
  }
  writeConfig(baseDir, cfg);
  return status(baseDir);
}

function status(baseDir) {
  const cfg = readConfig(baseDir);
  return {
    facebookConnected: !!(cfg.pageId && cfg.pageToken && !cfg.lastCheckError),
    instagramConnected: !!(cfg.igUserId && cfg.pageToken),
    pageId: cfg.pageId || "",
    pageName: cfg.pageName || "",
    igUserId: cfg.igUserId || "",
    error: cfg.lastCheckError || null,
    // הטוקן עצמו לא חוזר ללקוח — רק מסומן אם קיים
    hasToken: !!cfg.pageToken
  };
}

async function graphPost(pathSeg, params) {
  const r = await fetch(`${GRAPH}/${pathSeg}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "שגיאת Graph API");
  return j;
}

async function postToFacebook(baseDir, { message, imageUrl } = {}) {
  const cfg = readConfig(baseDir);
  if (!cfg.pageId || !cfg.pageToken) throw new Error("דף פייסבוק לא מחובר — הגדר ב'רשתות חברתיות'");
  const params = { access_token: cfg.pageToken };
  if (message) params.message = message;
  if (imageUrl) {
    params.url = imageUrl;
    return graphPost(`${cfg.pageId}/photos`, params);
  }
  if (!message) throw new Error("צריך טקסט או תמונה לפרסום");
  return graphPost(`${cfg.pageId}/feed`, params);
}

// אינסטגרם: זרימת שני שלבים — יצירת מיכל מדיה ואז פרסום. חובה URL תמונה נגיש מהאינטרנט
// (לא נתמך מ-localhost — עובד רק כשהאתר פרוס באופן ציבורי, למשל ב-Render).
async function postToInstagram(baseDir, { caption, imageUrl } = {}) {
  const cfg = readConfig(baseDir);
  if (!cfg.igUserId || !cfg.pageToken) throw new Error("אינסטגרם לא מחובר — הגדר דף פייסבוק המקושר לחשבון עסקי באינסטגרם");
  if (!imageUrl) throw new Error("אינסטגרם דורש תמונה (URL נגיש מהאינטרנט)");
  const container = await graphPost(`${cfg.igUserId}/media`, {
    image_url: imageUrl, caption: caption || "", access_token: cfg.pageToken
  });
  return graphPost(`${cfg.igUserId}/media_publish`, { creation_id: container.id, access_token: cfg.pageToken });
}

async function recentPosts(baseDir, limit = 10) {
  const cfg = readConfig(baseDir);
  if (!cfg.pageId || !cfg.pageToken) return [];
  try {
    const r = await fetch(`${GRAPH}/${cfg.pageId}/posts?fields=message,created_time,permalink_url,likes.summary(true),comments.summary(true)&limit=${limit}&access_token=${encodeURIComponent(cfg.pageToken)}`);
    const j = await r.json();
    if (j.error) return [];
    return (j.data || []).map((p) => ({
      id: p.id, message: p.message || "", createdAt: p.created_time, url: p.permalink_url,
      likes: (p.likes && p.likes.summary && p.likes.summary.total_count) || 0,
      comments: (p.comments && p.comments.summary && p.comments.summary.total_count) || 0
    }));
  } catch { return []; }
}

module.exports = { saveSettings, status, postToFacebook, postToInstagram, recentPosts };
