const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { APPS } = require("./config");
const { getCachedApps } = require("./appDiscovery");
const { getCachedSystemApps } = require("./systemApps");

function resolveApp(appKey) {
  if (APPS[appKey]) return APPS[appKey];
  const fromFolder = getCachedApps().find((a) => a.key === appKey);
  if (fromFolder) return fromFolder;
  return getCachedSystemApps().find((a) => a.key === appKey) || null;
}

/**
 * מפעיל תוכנת שולחן עבודה לפי מפתח (מוגדר מראש או שהתגלה אוטומטית).
 * אם נמסר filePath, מנסה לפתוח את הקובץ ישירות בתוכנה (נתמך חלקית, תלוי בתוכנה).
 */
function launchApp(appKey, filePath) {
  const app = resolveApp(appKey);
  if (!app) {
    return { ok: false, error: `תוכנה לא מוכרת: ${appKey}` };
  }
  if (!fs.existsSync(app.exe)) {
    return { ok: false, error: `לא נמצאה תוכנה בנתיב: ${app.exe}` };
  }

  const args = [];
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `הקובץ לא נמצא: ${filePath}` };
    }
    args.push(filePath);
  }

  try {
    const child = spawn(app.exe, args, {
      cwd: path.dirname(app.exe),
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
    return { ok: true, label: app.label };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { launchApp };
